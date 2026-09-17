const CLAIM_EVENTS_RPC = 'claim_ifood_events_v1';
const PROBE_WORKER_ID = 'ifood-health-probe';
const PROBE_TIMEOUT_MS = 5_000;

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function trimBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, '');
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

function errorMessage(error) {
  return typeof error?.message === 'string' ? error.message : '';
}

function errorCode(error) {
  return error?.code == null ? '' : String(error.code);
}

function isInvalidClaimArguments(error) {
  const message = errorMessage(error);
  return message === 'INVALID_CLAIM_ARGUMENTS' || message.includes('INVALID_CLAIM_ARGUMENTS');
}

function isAuthFailure(error, status) {
  if (status === 401 || status === 403) return true;
  const code = errorCode(error);
  if (code === 'PGRST301' || code === '42501') return true;
  const message = errorMessage(error);
  if (message === 'FORBIDDEN') return false;
  return /JWT|unauthorized|invalid api key/i.test(message);
}

function isTransportFailure(error, status) {
  if (status != null && status >= 500) return true;
  const code = errorCode(error);
  const message = errorMessage(error);
  if (error?.name === 'TypeError') return true;
  if (!code && /fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|AbortError/i.test(message)) {
    return true;
  }
  return false;
}

function classifyProbeResult({ data, error, status } = {}) {
  if (isInvalidClaimArguments(error)) {
    return { databaseReachable: true, leaseCapable: true };
  }
  if (!error && Array.isArray(data) && data.length === 0) {
    return { databaseReachable: true, leaseCapable: true };
  }
  if (!error && Array.isArray(data) && data.length > 0) {
    // A real claim would steal inbox work. Never treat that as a healthy probe.
    return { databaseReachable: true, leaseCapable: false };
  }
  if (isAuthFailure(error, status) || isTransportFailure(error, status)) {
    return { databaseReachable: false, leaseCapable: false };
  }
  if (error && (errorCode(error) || errorMessage(error) || (status != null && status < 500))) {
    return { databaseReachable: true, leaseCapable: false };
  }
  return { databaseReachable: false, leaseCapable: false };
}

function claimProbeParams() {
  return Object.freeze({
    p_worker_id: PROBE_WORKER_ID,
    p_limit: 0,
    p_lease_seconds: 0
  });
}

function withTimeoutSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let removeAbort = () => {};
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else if (typeof signal.addEventListener === 'function') {
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => signal.removeEventListener?.('abort', onAbort);
    }
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      removeAbort();
    }
  };
}

async function discardBody(response) {
  try {
    if (typeof response?.arrayBuffer === 'function') {
      await response.arrayBuffer();
      return;
    }
    if (typeof response?.text === 'function') {
      await response.text();
    }
  } catch {
    // Drain is best-effort so a closed socket cannot fail the probe.
  }
}

async function readJson(response) {
  try {
    if (typeof response?.json === 'function') {
      return await response.json();
    }
  } catch {
    return null;
  }
  return null;
}

function createFetchRpc({ fetchImpl, supabaseUrl, serviceRoleKey }) {
  const baseUrl = trimBaseUrl(supabaseUrl);
  const headers = Object.freeze({
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  });

  return async function postClaimRpc(params, signal) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${CLAIM_EVENTS_RPC}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal
    });
    if (response.ok) {
      const data = await readJson(response);
      return { data, error: null, status: response.status };
    }
    const payload = await readJson(response);
    await discardBody(response);
    const error = payload && typeof payload === 'object'
      ? {
        message: typeof payload.message === 'string' ? payload.message : '',
        code: payload.code == null ? '' : String(payload.code)
      }
      : { message: '', code: String(response.status) };
    return { data: null, error, status: response.status };
  };
}

function createClientRpc(supabase) {
  return async function invokeRpc(params, signal) {
    const options = signal ? { abortSignal: signal } : undefined;
    const result = supabase.rpc(CLAIM_EVENTS_RPC, params, options);
    const resolved = typeof result?.then === 'function' ? await result : result;
    return {
      data: resolved?.data ?? null,
      error: resolved?.error ?? null,
      status: resolved?.status ?? resolved?.error?.status ?? null
    };
  };
}

function resolveRpc({ supabase, fetch: fetchImpl, supabaseUrl, serviceRoleKey }) {
  if (supabase && typeof supabase.rpc === 'function') {
    return createClientRpc(supabase);
  }
  const resolvedFetch = fetchImpl ?? globalThis.fetch;
  if (hasText(supabaseUrl) && hasText(serviceRoleKey) && typeof resolvedFetch === 'function') {
    return createFetchRpc({
      fetchImpl: resolvedFetch,
      supabaseUrl: supabaseUrl.trim(),
      serviceRoleKey: serviceRoleKey.trim()
    });
  }
  throw new TypeError('createIfoodSupabaseRepository requires a supabase client or URL + service role key');
}

/**
 * Production iFood worker repository. The only method required by the Task 4
 * runtime is a non-mutating `probeDependencies()`: it exercises
 * `claim_ifood_events_v1` with invalid claim arguments so Postgres runs the
 * service-role / lease function without `FOR UPDATE` or stealing inbox rows.
 */
export function createIfoodSupabaseRepository(options = {}) {
  const rpc = resolveRpc(options);

  async function probeDependencies({ signal } = {}) {
    const timeout = withTimeoutSignal(signal, options.timeoutMs ?? PROBE_TIMEOUT_MS);
    try {
      const result = await rpc(claimProbeParams(), timeout.signal);
      return classifyProbeResult(result);
    } catch (error) {
      if (signal?.aborted && isAbortError(error)) throw error;
      if (signal?.aborted) throw error;
      return { databaseReachable: false, leaseCapable: false };
    } finally {
      timeout.cleanup();
    }
  }

  return Object.freeze({
    probeDependencies
  });
}

export const IFOOD_LEASE_PROBE = Object.freeze({
  rpc: CLAIM_EVENTS_RPC,
  workerId: PROBE_WORKER_ID,
  timeoutMs: PROBE_TIMEOUT_MS
});

export default createIfoodSupabaseRepository;
