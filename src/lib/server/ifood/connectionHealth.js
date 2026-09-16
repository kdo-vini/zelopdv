export const DEFAULT_CONNECTION_MAX_AGE_MS = 90_000;

function nowMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function timestampFrom(value) {
  const parsed = nowMs(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fresh(value, now, maxAgeMs) {
  const timestamp = timestampFrom(value);
  return timestamp !== null && now - timestamp <= maxAgeMs;
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

function configurationIsGreen(connection) {
  const explicit = connectionValue(connection, [
    'configurationValid',
    'configuration_valid',
    'configValid',
    'configured'
  ]);
  if (typeof explicit === 'boolean') return explicit;
  if (typeof connection?.configuration?.valid === 'boolean') return connection.configuration.valid;
  if (typeof connection?.config?.valid === 'boolean') return connection.config.valid;
  return false;
}

function statusOf(connection) {
  const value = connectionValue(connection, ['status', 'connectionStatus']);
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'active';
}

function maxAge(value) {
  if (value === undefined || value === null) return DEFAULT_CONNECTION_MAX_AGE_MS;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('iFood connection max age must be a positive integer');
  }
  return value;
}

function clockNow(clock) {
  const value = nowMs(typeof clock === 'function' ? clock() : clock?.now?.());
  return Number.isFinite(value) ? value : Date.now();
}

/**
 * Pure per-merchant health evaluation. `lastPollAt` is an allowed liveness
 * fallback for a worker that has successfully polled, but token freshness and
 * configuration are still independently required for recovery.
 */
export function evaluateConnectionHealth({
  connection,
  workerHeartbeatAt,
  lastTokenAt,
  now = Date.now(),
  maxAgeMs = DEFAULT_CONNECTION_MAX_AGE_MS
} = {}) {
  const ageLimit = maxAge(maxAgeMs);
  const current = timestampFrom(now);
  const effectiveNow = current ?? Date.now();
  const status = statusOf(connection);
  const heartbeat = workerHeartbeatAt
    ?? connectionValue(connection, ['workerHeartbeatAt', 'worker_heartbeat_at']);
  const lastPoll = connectionValue(connection, ['lastPollAt', 'last_poll_at']);
  const token = lastTokenAt
    ?? connectionValue(connection, ['lastTokenAt', 'last_token_at']);
  const heartbeatFresh = fresh(heartbeat, effectiveNow, ageLimit);
  const pollFresh = fresh(lastPoll, effectiveNow, ageLimit);
  const tokenFresh = fresh(token, effectiveNow, ageLimit);
  const reasons = [];

  if (!heartbeatFresh && !pollFresh) {
    reasons.push(heartbeat === undefined || heartbeat === null
      ? 'worker_heartbeat_missing'
      : 'worker_heartbeat_stale');
  }
  if (!tokenFresh) {
    reasons.push(token === undefined || token === null ? 'token_missing' : 'token_stale');
  }
  if (!configurationIsGreen(connection)) reasons.push('configuration_not_ready');

  if (status !== 'active') {
    const statusReason = ['pending', 'degraded', 'paused', 'revoked'].includes(status)
      ? `connection_${status}`
      : 'connection_not_active';
    reasons.push(statusReason);
  }

  return {
    healthy: reasons.length === 0,
    reasons
  };
}

/**
 * Adds the operational fail-closed decision to the pure health result.
 * Orders already persisted remain visible regardless of this policy.
 */
export function resolveConnectionHealthPolicy(input = {}) {
  const evaluation = evaluateConnectionHealth(input);
  const status = statusOf(input.connection);
  const commandsAllowed = evaluation.healthy && status === 'active';
  return {
    merchantId: merchantIdOf(input.connection),
    healthy: evaluation.healthy,
    reasons: [...evaluation.reasons],
    commandsAllowed,
    presenceOnline: commandsAllowed,
    ordersVisible: true
  };
}

function safeLog(logger, message) {
  if (!logger || typeof logger.error !== 'function') return;
  try {
    logger.error(message);
  } catch {
    // Health enforcement remains fail-closed if logging fails.
  }
}

/**
 * Applies the per-merchant policy through an explicitly injected presence
 * seam. The current HTTP adapter deliberately has no presence write method;
 * this coordinator therefore cannot toggle a real provider route by itself.
 * A presence request is sent only on a state transition, and only for the
 * affected merchant.
 */
export function createIfoodHealthCoordinator({
  presence,
  repository,
  clock = () => Date.now(),
  maxAgeMs = DEFAULT_CONNECTION_MAX_AGE_MS,
  logger = null
} = {}) {
  const presenceTarget = presence ?? repository;
  const setMerchantPresence = typeof presenceTarget?.setMerchantPresence === 'function'
    ? presenceTarget.setMerchantPresence.bind(presenceTarget)
    : null;
  const knownPresence = new Map();
  const ageLimit = maxAge(maxAgeMs);

  async function applyMerchantHealth(input = {}) {
    const policy = resolveConnectionHealthPolicy({
      ...input,
      clock: undefined,
      now: input.now ?? clockNow(clock),
      maxAgeMs: ageLimit
    });
    const merchantId = policy.merchantId;
    if (!setMerchantPresence || !merchantId) return policy;

    const desiredOnline = policy.presenceOnline;
    const previous = knownPresence.get(merchantId);
    if (previous === desiredOnline) return policy;
    // Do not invent an ON transition for a merchant whose initial state was
    // never observed. Recovery from an OFF request, however, is explicit and
    // requires the fully green policy above.
    if (previous === undefined && desiredOnline) {
      return policy;
    }

    const request = { merchantId, online: desiredOnline };
    if (input.signal) request.signal = input.signal;
    try {
      await setMerchantPresence(request);
      knownPresence.set(merchantId, desiredOnline);
    } catch {
      safeLog(logger, 'iFood merchant presence update failed');
    }
    return policy;
  }

  return Object.freeze({
    evaluateMerchantHealth: (input = {}) => resolveConnectionHealthPolicy({
      ...input,
      now: input.now ?? clockNow(clock),
      maxAgeMs: ageLimit
    }),
    applyMerchantHealth
  });
}

export const createConnectionHealthCoordinator = createIfoodHealthCoordinator;
export const IFOOD_CONNECTION_HEALTH_MAX_AGE_MS = DEFAULT_CONNECTION_MAX_AGE_MS;
export default evaluateConnectionHealth;
