import { createServer as createHttpServer } from 'node:http';

const LIVE_PATH = '/health/live';
const READY_PATH = '/health/ready';
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);
const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
  'content-type': 'application/json; charset=utf-8'
});

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

function probeValue(value) {
  return {
    databaseReachable: value?.databaseReachable === true,
    leaseCapable: value?.leaseCapable === true
  };
}

/**
 * Small in-memory state machine shared by the runtime and HTTP health server.
 * Probe details never leave this process through a response body.
 */
export function createHealthState({ readyMaxAgeMs = 90_000, clock = () => Date.now() } = {}) {
  let serving = true;
  let shuttingDown = false;
  let lastProbeAt = null;
  let lastProbe = null;

  const recordProbe = (value) => {
    lastProbe = probeValue(value);
    lastProbeAt = nowMs(clock);
    return { ...lastProbe };
  };

  const readyStatus = () => {
    if (shuttingDown) return { status: 'not_ready', reason: 'shutting_down' };
    if (lastProbeAt === null) return { status: 'not_ready', reason: 'startup' };
    if (!lastProbe?.databaseReachable || !lastProbe?.leaseCapable) {
      return { status: 'not_ready', reason: 'dependencies_unavailable' };
    }
    if (nowMs(clock) - lastProbeAt > readyMaxAgeMs) {
      return { status: 'not_ready', reason: 'stale_probe' };
    }
    return { status: 'ready', reason: 'fresh_probe' };
  };

  return {
    recordProbe,

    updateProbe(value) {
      return recordProbe(value);
    },

    markShuttingDown() {
      shuttingDown = true;
    },

    setShuttingDown(value = true) {
      shuttingDown = value === true;
    },

    stopServing() {
      serving = false;
    },

    setServing(value = true) {
      serving = value === true;
    },

    isLive() {
      return serving;
    },

    isReady() {
      return readyStatus().status === 'ready';
    },

    liveStatus() {
      return serving
        ? { status: 'ok', reason: 'serving' }
        : { status: 'not_live', reason: 'stopped' };
    },

    readyStatus,

    snapshot() {
      return {
        serving,
        shuttingDown,
        lastProbeAt,
        lastProbe: lastProbe ? { ...lastProbe } : null,
        ready: readyStatus()
      };
    }
  };
}

function bodyFor(statusCode, body) {
  const json = JSON.stringify(body);
  return { ...JSON_HEADERS, 'content-length': Buffer.byteLength(json), json, statusCode };
}

function writeResponse(response, statusCode, body, method) {
  const payload = bodyFor(statusCode, body);
  response.writeHead(payload.statusCode, {
    ...JSON_HEADERS,
    'content-length': payload['content-length'],
    ...(statusCode === 405 ? { allow: 'GET, HEAD' } : {})
  });
  response.end(method === 'HEAD' ? undefined : payload.json);
}

function requestPath(request) {
  try {
    return new URL(request.url || '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

export function handleHealthRequest(request, response, { state } = {}) {
  const method = request.method || 'GET';
  const path = requestPath(request);
  const healthState = state;

  if (path !== LIVE_PATH && path !== READY_PATH) {
    writeResponse(response, 404, { status: 'not_found', reason: 'route_not_found' }, method);
    return;
  }
  if (!ALLOWED_METHODS.has(method)) {
    writeResponse(response, 405, { status: 'method_not_allowed', reason: 'method_not_allowed' }, method);
    return;
  }

  const body = path === LIVE_PATH
    ? healthState.liveStatus()
    : healthState.readyStatus();
  const statusCode = path === LIVE_PATH
    ? (healthState.isLive() ? 200 : 503)
    : (healthState.isReady() ? 200 : 503);
  writeResponse(response, statusCode, body, method);
}

export function createHealthServer({ state, healthState, health, createServer = createHttpServer } = {}) {
  const resolvedState = state ?? healthState ?? health ?? createHealthState();
  const server = createServer((request, response) => {
    handleHealthRequest(request, response, { state: resolvedState });
  });
  // Useful to consumers that receive only the server handle during shutdown.
  server.healthState = resolvedState;
  return server;
}

export function createHealthHandler(state) {
  return (request, response) => handleHealthRequest(request, response, { state });
}

export function listenHealthServer(server, { host = '0.0.0.0', port = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      server.removeListener?.('error', onError);
      callback(value);
    };
    const onError = (error) => finish(reject, error);
    server.once?.('error', onError);

    try {
      const result = server.listen(port, host, () => finish(resolve));
      if (result && typeof result.then === 'function') result.then(() => finish(resolve), onError);
    } catch (error) {
      finish(reject, error);
    }
  });
}

export const HEALTH_PATHS = Object.freeze({ live: LIVE_PATH, ready: READY_PATH });
export const HEALTH_JSON_HEADERS = JSON_HEADERS;

export default createHealthServer;
