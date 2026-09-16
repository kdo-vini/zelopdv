const MAX_POLLING_MERCHANTS_PER_REQUEST = 1_000;
export const MIN_IFOOD_POLL_INTERVAL_MS = 30_000;

function safeLog(logger, message) {
  if (!logger || typeof logger.error !== 'function') return;
  try {
    logger.error(message);
  } catch {
    // Reconciliation must not fail because an observer failed.
  }
}

function readNumber(value) {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}

/**
 * The provider requires active polling to be no faster than 30 seconds. The
 * caller may provide a connection/config value; values below the provider
 * floor are clamped instead of becoming a hot polling loop.
 */
export function normalizePollingIntervalMs(value) {
  if (value === undefined || value === null) return null;
  const parsed = readNumber(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError('iFood polling interval must be a positive integer');
  }
  return Math.max(parsed, MIN_IFOOD_POLL_INTERVAL_MS);
}

function connectionValue(connection, names) {
  for (const name of names) {
    if (connection?.[name] !== undefined && connection?.[name] !== null) return connection[name];
  }
  return undefined;
}

function merchantIdOf(connection) {
  const value = connectionValue(connection, ['merchantId', 'merchant_id']);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function connectionIdOf(connection) {
  const value = connectionValue(connection, ['connectionId', 'connection_id', 'id']);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function statusOf(connection) {
  const value = connectionValue(connection, ['status', 'connectionStatus']);
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function nowMs(clock) {
  const value = typeof clock === 'function' ? clock() : clock?.now?.();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function isoAt(clock) {
  return new Date(nowMs(clock)).toISOString();
}

function methodFrom(object, names, label) {
  for (const name of names) {
    if (typeof object?.[name] === 'function') return object[name].bind(object);
  }
  throw new TypeError(`iFood reconciliation requires ${label}()`);
}

function eventString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function eventNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function extractEvent(envelope, fallbackMerchantId) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return null;

  const eventId = eventString(envelope.id ?? envelope.eventId);
  const merchantId = eventString(envelope.merchantId ?? envelope.metadata?.merchantId)
    ?? (fallbackMerchantId && !envelope.merchantId && !envelope.metadata?.merchantId ? fallbackMerchantId : null);
  const fullCode = eventString(envelope.fullCode);
  const code = eventString(envelope.code);
  const eventType = fullCode ?? code;
  const orderId = eventString(envelope.orderId);
  const createdAt = eventString(envelope.createdAt);

  if (!eventId || !merchantId || !eventType) return null;

  return {
    eventId,
    merchantId,
    orderId,
    externalOrderId: orderId,
    fullCode,
    code,
    eventType,
    createdAt,
    occurredAt: createdAt,
    externalRevision: eventNumber(envelope.externalRevision),
    payload: envelope
  };
}

function emptySummary() {
  return {
    merchants: 0,
    merchantsPolled: 0,
    batches: 0,
    polls: 0,
    pollFailures: 0,
    events: 0,
    inserted: 0,
    duplicates: 0,
    persisted: 0,
    unknownMerchants: 0,
    persistFailures: 0,
    ackCalls: 0,
    acked: 0,
    ackFailures: 0,
    pollMarks: 0,
    pollMarkFailures: 0
  };
}

function persistenceOutcome(result) {
  if (typeof result === 'string') return result;
  if (result?.outcome) return result.outcome;
  if (result?.inserted === true) return 'inserted';
  if (result?.duplicate === true || result?.inserted === false) return 'duplicate';
  return null;
}

function configuredIntervalFor(connection, fallback) {
  return normalizePollingIntervalMs(connectionValue(connection, [
    'pollingIntervalMs',
    'pollIntervalMs',
    'reconciliationIntervalMs',
    'polling_interval_ms'
  ]) ?? fallback);
}

function uniqueConnections(connections) {
  const result = [];
  const seen = new Set();
  for (const connection of Array.isArray(connections) ? connections : []) {
    const merchantId = merchantIdOf(connection);
    if (!merchantId || statusOf(connection) === 'revoked' || seen.has(merchantId)) continue;
    seen.add(merchantId);
    result.push({ connection, merchantId });
  }
  return result;
}

/**
 * Pure/injectable polling reconciliation. The canonical repository seam is:
 *
 * - `listConnectionsForPolling({ signal?, now, pollingIntervalMs? })` -> rows
 *   with `connectionId`, `merchantId` and `status`;
 * - `enqueuePolledEvent({ connectionId, eventId, merchantId,
 *   externalOrderId, eventType, fullCode, code, occurredAt, createdAt,
 *   externalRevision, payload, signal? })` -> `{ outcome }`, where outcome is
 *   `inserted`, `duplicate`, or `unknown_merchant`;
 * - `recordPollSuccess({ connectionId, merchantId, polledAt, tokenConfirmedAt,
 *   signal? })`. A successful poll is an authenticated call, so it is the
 *   evidence that the token is valid: implementations must persist
 *   `polledAt` into `last_poll_at` and `tokenConfirmedAt` into
 *   `last_token_at`. Without this, `connectionHealth.js` would treat the
 *   token as stale forever and a merchant could never recover.
 *
 * `paused` and `degraded` rows are intentionally not filtered here: polling
 * continues to protect the durable inbox. Those statuses affect presence and
 * commands in `connectionHealth.js`, not ingestion.
 */
export function createIfoodReconciler({
  integration,
  adapter,
  repository,
  clock = () => Date.now(),
  logger = null,
  batchSize = MAX_POLLING_MERCHANTS_PER_REQUEST,
  pollingIntervalMs,
  pollIntervalMs
} = {}) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError('createIfoodReconciler requires a repository');
  }

  const provider = adapter ?? integration;
  const pollEvents = typeof provider?.pollEvents === 'function'
    ? provider.pollEvents.bind(provider)
    : typeof integration?.reconcileEvents === 'function'
      ? integration.reconcileEvents.bind(integration)
      : null;
  if (!pollEvents) throw new TypeError('createIfoodReconciler requires pollEvents()');

  const ackEvents = methodFrom(provider, ['ackEvents'], 'ackEvents');
  const listConnections = methodFrom(repository, [
    'listConnectionsForPolling',
    'getMerchantsToPoll',
    'listPollableConnections'
  ], 'listConnectionsForPolling');
  const enqueuePolledEvent = methodFrom(repository, [
    'enqueuePolledEvent',
    'persistPolledEvent',
    'persistEvent',
    'enqueueEvent'
  ], 'enqueuePolledEvent');
  const recordPollSuccess = methodFrom(repository, [
    'recordPollSuccess',
    'recordLastPoll',
    'markPollSuccess'
  ], 'recordPollSuccess');

  const configuredInterval = normalizePollingIntervalMs(pollingIntervalMs ?? pollIntervalMs);
  const parsedBatchSize = Number.isSafeInteger(batchSize) && batchSize > 0
    ? Math.min(batchSize, MAX_POLLING_MERCHANTS_PER_REQUEST)
    : MAX_POLLING_MERCHANTS_PER_REQUEST;

  async function runReconciliationCycle({ signal } = {}) {
    const summary = emptySummary();
    if (signal?.aborted) return summary;

    let listed;
    try {
      const listInput = { now: new Date(nowMs(clock)).toISOString() };
      if (signal) listInput.signal = signal;
      if (configuredInterval !== null) listInput.pollingIntervalMs = configuredInterval;
      listed = await listConnections(listInput);
    } catch {
      safeLog(logger, 'iFood reconciliation connection listing failed');
      return summary;
    }

    const connections = uniqueConnections(Array.isArray(listed) ? listed : listed?.connections);
    summary.merchants = connections.length;

    for (let offset = 0; offset < connections.length; offset += parsedBatchSize) {
      if (signal?.aborted) break;
      const batch = connections.slice(offset, offset + parsedBatchSize);
      const merchantIds = batch.map(({ merchantId }) => merchantId);
      summary.batches += 1;

      let envelopes;
      try {
        const pollInput = { merchantIds };
        if (signal) pollInput.signal = signal;
        envelopes = await pollEvents(pollInput);
      } catch {
        summary.pollFailures += 1;
        safeLog(logger, 'iFood reconciliation poll failed');
        continue;
      }

      summary.polls += 1;
      summary.merchantsPolled += batch.length;
      const polledAt = isoAt(clock);

      for (const { connection, merchantId } of batch) {
        try {
          const input = {
            connectionId: connectionIdOf(connection),
            merchantId,
            polledAt,
            tokenConfirmedAt: polledAt
          };
          const connectionInterval = configuredIntervalFor(connection, configuredInterval);
          if (connectionInterval !== null) input.pollingIntervalMs = connectionInterval;
          if (signal) input.signal = signal;
          await recordPollSuccess(input);
          summary.pollMarks += 1;
        } catch {
          summary.pollMarkFailures += 1;
          safeLog(logger, 'iFood reconciliation last_poll_at update failed');
        }
      }

      const events = Array.isArray(envelopes) ? envelopes : [];
      summary.events += events.length;
      const ackIds = new Set();
      const fallbackMerchantId = batch.length === 1 ? merchantIds[0] : null;

      for (const envelope of events) {
        const event = extractEvent(envelope, fallbackMerchantId);
        if (!event) {
          summary.persistFailures += 1;
          safeLog(logger, 'iFood reconciliation event identity invalid');
          continue;
        }

        const connection = batch.find(({ merchantId: candidate }) => candidate === event.merchantId)?.connection;
        if (!connection) {
          summary.persistFailures += 1;
          safeLog(logger, 'iFood reconciliation event merchant mismatch');
          continue;
        }
        const input = {
          connectionId: connectionIdOf(connection),
          ...event
        };
        if (signal) input.signal = signal;

        let result;
        try {
          result = await enqueuePolledEvent(input);
        } catch {
          summary.persistFailures += 1;
          safeLog(logger, 'iFood reconciliation event persistence failed');
          continue;
        }

        const outcome = persistenceOutcome(result);
        if (outcome === 'inserted' || outcome === 'duplicate') {
          summary.persisted += 1;
          summary[outcome === 'inserted' ? 'inserted' : 'duplicates'] += 1;
          ackIds.add(event.eventId);
        } else if (outcome === 'unknown_merchant' || outcome === 'ignored') {
          // Unknown merchants are deliberately left unacknowledged. A pending
          // connection can become attributable later; only a connected row is
          // selected for polling, so this is a visible, safe redelivery.
          summary.unknownMerchants += 1;
        } else {
          summary.persistFailures += 1;
          safeLog(logger, 'iFood reconciliation persistence outcome invalid');
        }
      }

      if (ackIds.size > 0 && !signal?.aborted) {
        const ids = [...ackIds];
        summary.ackCalls += 1;
        try {
          const ackResult = signal
            ? await ackEvents(ids, { signal })
            : await ackEvents(ids);
          if (ackResult?.accepted === false) {
            summary.ackFailures += ids.length;
          } else {
            summary.acked += ids.length;
          }
        } catch {
          summary.ackFailures += ids.length;
          safeLog(logger, 'iFood reconciliation ACK failed');
        }
      }
    }

    return summary;
  }

  return Object.freeze({
    runReconciliationCycle,
    pollingIntervalMs: configuredInterval,
    batchSize: parsedBatchSize
  });
}

export const MAX_IFOOD_POLLING_MERCHANTS = MAX_POLLING_MERCHANTS_PER_REQUEST;
export default createIfoodReconciler;
