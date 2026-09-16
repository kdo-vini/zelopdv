const DEFAULT_WORKER_ID = 'ifood-worker';
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const DEFAULT_INTERVAL_MS = 300_000;
const DEFAULT_READY_MAX_AGE_MS = 90_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

const MAX_DURATION_MS = 86_400_000;
const MAX_WORKER_ID_LENGTH = 128;
const MAX_HOST_LENGTH = 253;

export class IfoodWorkerConfigError extends TypeError {
  constructor(field, reason) {
    super(`iFood worker configuration invalid (${field}): ${reason}`);
    this.name = 'IfoodWorkerConfigError';
    this.code = 'IFOOD_WORKER_CONFIG_INVALID';
    this.field = field;
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function readOptionalString(env, field, fallback) {
  const value = env?.[field];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') {
    throw new IfoodWorkerConfigError(field, 'must be a string');
  }
  if (value.trim() === '') return fallback;
  return value.trim();
}

function readFirstString(env, fields) {
  for (const field of fields) {
    const value = env?.[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') {
      throw new IfoodWorkerConfigError(field, 'must be a string');
    }
    if (hasValue(value)) return value.trim();
  }
  return undefined;
}

function parseBoundedInteger(value, field, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new IfoodWorkerConfigError(field, 'must be a bounded integer');
  }

  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new IfoodWorkerConfigError(field, 'must be a bounded integer');
  }
  return parsed;
}

function parseHttpUrl(value, field) {
  if (!hasValue(value)) throw new IfoodWorkerConfigError(field, 'is required');

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new IfoodWorkerConfigError(field, 'must be a valid HTTP(S) URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new IfoodWorkerConfigError(field, 'must be a valid HTTP(S) URL');
  }
  if (parsed.username || parsed.password) {
    throw new IfoodWorkerConfigError(field, 'must not contain credentials');
  }
  return value.trim();
}

function parseWorkerId(value) {
  if (!value) return DEFAULT_WORKER_ID;
  if (value.length > MAX_WORKER_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new IfoodWorkerConfigError('IFOOD_WORKER_ID', 'must be a short printable value');
  }
  return value;
}

function parseHost(value) {
  if (!value) return DEFAULT_HOST;
  if (value.length > MAX_HOST_LENGTH || /[\s\u0000-\u001f\u007f]/.test(value)) {
    throw new IfoodWorkerConfigError('IFOOD_WORKER_HOST', 'must be a valid host');
  }
  return value;
}

/**
 * Load the worker-only configuration. This module intentionally does not
 * import SvelteKit or `$env`; the dedicated process receives plain Node env.
 */
export function loadIfoodWorkerConfig(env = process.env) {
  if (!env || typeof env !== 'object') {
    throw new IfoodWorkerConfigError('environment', 'must be an object');
  }

  const supabaseUrl = parseHttpUrl(env.SUPABASE_URL, 'SUPABASE_URL');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasValue(serviceRoleKey)) {
    throw new IfoodWorkerConfigError('SUPABASE_SERVICE_ROLE_KEY', 'is required');
  }

  const portValue = readFirstString(env, ['IFOOD_WORKER_PORT', 'PORT']);
  const intervalValue = readFirstString(env, [
    'IFOOD_WORKER_INTERVAL_MS',
    'IFOOD_WORKER_POLL_INTERVAL_MS',
    'IFOOD_WORKER_INTERVAL'
  ]);
  const readyMaxAgeValue = readFirstString(env, [
    'IFOOD_WORKER_READY_MAX_AGE_MS',
    'IFOOD_WORKER_READY_MAX_AGE'
  ]);
  const shutdownTimeoutValue = readFirstString(env, [
    'IFOOD_WORKER_SHUTDOWN_TIMEOUT_MS',
    'IFOOD_WORKER_SHUTDOWN_TIMEOUT'
  ]);

  const clientId = readOptionalString(env, 'IFOOD_CLIENT_ID', undefined);
  const clientSecretRaw = env.IFOOD_CLIENT_SECRET;
  if (clientSecretRaw !== undefined && clientSecretRaw !== null && typeof clientSecretRaw !== 'string') {
    throw new IfoodWorkerConfigError('IFOOD_CLIENT_SECRET', 'must be a string');
  }
  const clientSecret = hasValue(clientSecretRaw) ? clientSecretRaw.trim() : undefined;
  // Task 5 only wires the HTTP adapter factory: both credentials must be
  // present together, or neither. The message below never echoes a value.
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new IfoodWorkerConfigError(
      'IFOOD_CLIENT_ID/IFOOD_CLIENT_SECRET',
      'must both be set together or both left empty'
    );
  }

  const config = {
    supabaseUrl,
    serviceRoleKey: serviceRoleKey.trim(),
    workerId: parseWorkerId(readOptionalString(env, 'IFOOD_WORKER_ID', DEFAULT_WORKER_ID)),
    host: parseHost(readOptionalString(env, 'IFOOD_WORKER_HOST', DEFAULT_HOST)),
    port: parseBoundedInteger(portValue, 'IFOOD_WORKER_PORT/PORT', {
      min: 1,
      max: 65_535,
      fallback: DEFAULT_PORT
    }),
    intervalMs: parseBoundedInteger(intervalValue, 'IFOOD_WORKER_INTERVAL_MS', {
      min: 1,
      max: MAX_DURATION_MS,
      fallback: DEFAULT_INTERVAL_MS
    }),
    readyMaxAgeMs: parseBoundedInteger(readyMaxAgeValue, 'IFOOD_WORKER_READY_MAX_AGE_MS', {
      min: 1,
      max: MAX_DURATION_MS,
      fallback: DEFAULT_READY_MAX_AGE_MS
    }),
    shutdownTimeoutMs: parseBoundedInteger(shutdownTimeoutValue, 'IFOOD_WORKER_SHUTDOWN_TIMEOUT_MS', {
      min: 1,
      max: MAX_DURATION_MS,
      fallback: DEFAULT_SHUTDOWN_TIMEOUT_MS
    })
  };
  // Preserve a descriptive alias for future adapters without making the
  // secret appear twice in ordinary object inspection or serialization.
  Object.defineProperty(config, 'supabaseServiceRoleKey', {
    value: config.serviceRoleKey,
    enumerable: false,
    writable: false,
    configurable: false
  });
  // iFood client credentials never become an enumerable/logged config field:
  // `console.log(config)`, JSON.stringify(config) and Object.keys(config)
  // must never surface clientId/clientSecret, only whether they are present.
  Object.defineProperty(config, 'credentials', {
    value: clientId && clientSecret ? Object.freeze({ clientId, clientSecret }) : undefined,
    enumerable: false,
    writable: false,
    configurable: false
  });
  Object.defineProperty(config, 'hasIfoodCredentials', {
    value: Boolean(clientId && clientSecret),
    enumerable: true,
    writable: false,
    configurable: false
  });
  return Object.freeze(config);
}

export const IFOOD_WORKER_DEFAULTS = Object.freeze({
  workerId: DEFAULT_WORKER_ID,
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  intervalMs: DEFAULT_INTERVAL_MS,
  readyMaxAgeMs: DEFAULT_READY_MAX_AGE_MS,
  shutdownTimeoutMs: DEFAULT_SHUTDOWN_TIMEOUT_MS
});

export default loadIfoodWorkerConfig;
