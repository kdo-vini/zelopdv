import { computeNextAttemptAt } from './retryPolicy.js';

export const DEFAULT_IFOOD_COMMAND_EXPIRY_SECONDS = 600;

const SAFE_PROVIDER_CODE = /^IFOOD_[A-Z0-9_]{1,79}$/;

function emptySummary() {
  return {
    claimed: 0,
    acceptedHttp: 0,
    retried: 0,
    terminal: 0,
    unhealthy: 0,
    finishFailed: 0
  };
}

function safeLog(logger, message) {
  if (!logger || typeof logger.error !== 'function') return;
  try {
    logger.error(message);
  } catch {
    // Worker progress must not depend on logging availability.
  }
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function providerErrorCode(error, fallback) {
  if (typeof error?.code === 'string' && SAFE_PROVIDER_CODE.test(error.code)) return error.code;
  if (Number.isInteger(error?.status) && error.status === 401) return 'IFOOD_HTTP_UNAUTHORIZED';
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) return 'IFOOD_HTTP_CLIENT';
  return fallback;
}

function payloadObject(row) {
  return row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : {};
}

function actionForRow(adapter, row, signal) {
  const orderId = row?.externalOrderId;
  switch (row?.intent) {
    case 'confirm':
      if (typeof adapter.confirm !== 'function') throw new TypeError('adapter.confirm is required');
      return adapter.confirm(orderId, { signal });
    case 'start_preparation':
      if (typeof adapter.startPreparation !== 'function') throw new TypeError('adapter.startPreparation is required');
      return adapter.startPreparation(orderId, { signal });
    case 'ready_to_pickup':
      if (typeof adapter.readyToPickup !== 'function') throw new TypeError('adapter.readyToPickup is required');
      return adapter.readyToPickup(orderId, { signal });
    case 'dispatch':
      if (typeof adapter.dispatch !== 'function') throw new TypeError('adapter.dispatch is required');
      return adapter.dispatch(orderId, { signal });
    case 'verify_delivery_code': {
      if (typeof adapter.verifyDeliveryCode !== 'function') {
        throw new TypeError('adapter.verifyDeliveryCode is required');
      }
      const payload = payloadObject(row);
      return adapter.verifyDeliveryCode(orderId, payload.code, { signal });
    }
    case 'cancel': {
      if (typeof adapter.requestCancellation !== 'function') {
        throw new TypeError('adapter.requestCancellation is required');
      }
      const payload = payloadObject(row);
      const input = { orderId, signal };
      if (payload.reason !== undefined) input.reason = payload.reason;
      if (payload.cancellationCode !== undefined) input.cancellationCode = payload.cancellationCode;
      return adapter.requestCancellation(input);
    }
    default:
      throw new TypeError('unsupported iFood command intent');
  }
}

function acceptedByProvider(response) {
  return response?.accepted === true
    || response?.status === 202
    || response?.status === 'accepted_http';
}

function nextAttempt(retryPolicy, attempts) {
  try {
    return retryPolicy.computeNextAttemptAt({ attempts });
  } catch {
    return null;
  }
}

/**
 * Processes claimed command rows sequentially. A provider 202 is recorded as
 * HTTP acceptance only; the event handler later correlates the matching event
 * to `confirmed_event`. Ambiguous action failures are retryable, but the HTTP
 * adapter deliberately does not retry them automatically. Re-sending the same
 * provider state transition is the worker's explicit tradeoff: the command
 * key is unique per intent/revision and a repeated POST is expected to be a
 * no-op at the provider, but the contract snapshot does not prove that
 * provider-side idempotency. The command processor therefore never claims
 * that a double-send is harmless; it only bounds and records the retry.
 *
 * @param {{
 *   repository: { claimCommands: Function, finishCommand: Function, expireAcceptedCommands?: Function },
 *   adapter: object,
 *   workerId: string,
 *   limit?: number,
 *   leaseSeconds?: number,
 *   retryPolicy?: { computeNextAttemptAt: Function },
 *   clock?: () => number,
 *   logger?: { error: Function } | null,
 *   isMerchantCommandAllowed?: (merchantId: string) => boolean|Promise<boolean>,
 *   expiryOlderThanSeconds?: number
 * }} options
 */
export function createIfoodCommandProcessor({
  repository,
  adapter,
  workerId,
  limit = 10,
  leaseSeconds = 120,
  retryPolicy,
  clock = () => Date.now(),
  random = Math.random,
  logger = null,
  isMerchantCommandAllowed,
  expiryOlderThanSeconds = DEFAULT_IFOOD_COMMAND_EXPIRY_SECONDS
} = {}) {
  if (!repository || typeof repository.claimCommands !== 'function' || typeof repository.finishCommand !== 'function') {
    throw new TypeError('createIfoodCommandProcessor requires claimCommands() and finishCommand()');
  }
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('createIfoodCommandProcessor requires an adapter');
  }
  if (!validPositiveInteger(limit) || limit > 100) throw new TypeError('iFood command limit is invalid');
  if (!validPositiveInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
    throw new TypeError('iFood command leaseSeconds is invalid');
  }
  if (!isMerchantCommandAllowed && typeof isMerchantCommandAllowed !== 'undefined') {
    throw new TypeError('isMerchantCommandAllowed must be a function');
  }
  if (!validPositiveInteger(expiryOlderThanSeconds)
    || expiryOlderThanSeconds < 60
    || expiryOlderThanSeconds > 86400) {
    throw new TypeError('iFood command expiry threshold is invalid');
  }

  const effectiveRetryPolicy = retryPolicy ?? {
    computeNextAttemptAt: ({ attempts }) => computeNextAttemptAt({ attempts, clock, random })
  };
  if (typeof effectiveRetryPolicy.computeNextAttemptAt !== 'function') {
    throw new TypeError('retryPolicy.computeNextAttemptAt is required');
  }

  async function finish(row, input, summary) {
    try {
      await repository.finishCommand({
        commandId: row.commandId,
        leaseId: row.leaseId,
        ...input
      });
      return true;
    } catch {
      summary.finishFailed += 1;
      safeLog(logger, 'iFood command finishCommand failed for a claimed row');
      return false;
    }
  }

  async function merchantAllowed(row) {
    if (typeof isMerchantCommandAllowed !== 'function') return true;
    try {
      return (await isMerchantCommandAllowed(row.merchantId)) !== false;
    } catch {
      // A health predicate failure is fail-closed for this command only.
      return false;
    }
  }

  async function processRow(row, signal, summary) {
    if (!(await merchantAllowed(row))) {
      const didFinish = await finish(row, {
        outcome: 'failed_retryable',
        errorCode: 'CONNECTION_UNHEALTHY',
        errorMessage: 'iFood merchant connection is unhealthy',
        response: null,
        nextAttemptAt: nextAttempt(effectiveRetryPolicy, row.attempts),
        signal
      }, summary);
      if (didFinish) summary.unhealthy += 1;
      return;
    }

    let finishInput;
    let category;
    try {
      const providerResponse = await actionForRow(adapter, row, signal);
      if (acceptedByProvider(providerResponse)) {
        category = 'acceptedHttp';
        finishInput = {
          outcome: 'accepted_http',
          errorCode: null,
          errorMessage: null,
          response: { status: 'accepted_http' },
          nextAttemptAt: null,
          signal
        };
      } else {
        category = 'terminal';
        finishInput = {
          outcome: 'failed_terminal',
          errorCode: providerErrorCode(providerResponse, 'IFOOD_ACTION_NOT_ACCEPTED'),
          errorMessage: 'iFood command was not accepted',
          response: null,
          nextAttemptAt: null,
          signal
        };
      }
    } catch (error) {
      if (error?.retryable === true) {
        category = 'retried';
        finishInput = {
          outcome: 'failed_retryable',
          errorCode: providerErrorCode(error, 'IFOOD_COMMAND_RETRYABLE'),
          errorMessage: 'iFood command will be retried',
          response: null,
          nextAttemptAt: nextAttempt(effectiveRetryPolicy, row.attempts),
          signal
        };
      } else {
        category = 'terminal';
        finishInput = {
          outcome: 'failed_terminal',
          errorCode: providerErrorCode(error, 'IFOOD_COMMAND_ERROR'),
          errorMessage: 'iFood command failed',
          response: null,
          nextAttemptAt: null,
          signal
        };
      }
    }

    if (await finish(row, finishInput, summary)) summary[category] += 1;
  }

  async function runCommandCycle({ signal } = {}) {
    const summary = emptySummary();
    if (signal?.aborted) return summary;

    let rows;
    try {
      rows = await repository.claimCommands({ workerId, limit, leaseSeconds, signal });
    } catch {
      safeLog(logger, 'iFood command claimCommands failed');
      return summary;
    }

    const claimedRows = Array.isArray(rows) ? rows : [];
    summary.claimed = claimedRows.length;
    for (const row of claimedRows) {
      if (signal?.aborted) break;
      await processRow(row, signal, summary);
    }
    return summary;
  }

  async function runExpirySweep({ signal } = {}) {
    if (signal?.aborted) return 0;
    if (typeof repository.expireAcceptedCommands !== 'function') return 0;
    try {
      return await repository.expireAcceptedCommands({
        olderThanSeconds: expiryOlderThanSeconds,
        signal
      });
    } catch {
      safeLog(logger, 'iFood command expiry sweep failed');
      return 0;
    }
  }

  return Object.freeze({ runCommandCycle, runExpirySweep });
}

export default createIfoodCommandProcessor;
