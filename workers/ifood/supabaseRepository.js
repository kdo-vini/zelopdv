const CLAIM_EVENTS_RPC = 'claim_ifood_events_v1';
const FINISH_EVENT_RPC = 'finish_ifood_event_v1';
const CLAIM_COMMANDS_RPC = 'claim_ifood_commands_v1';
const FINISH_COMMAND_RPC = 'finish_ifood_command_v1';
const PROJECT_ORDER_EVENT_RPC = 'project_ifood_order_event_v1';
const PROBE_WORKER_ID = 'ifood-health-probe';
const PROBE_TIMEOUT_MS = 5_000;

function repositoryError() {
  return new Error('iFood worker repository operation failed');
}

function mapInboxRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    inboxId: row.inboxId ?? row.inbox_id,
    eventId: row.eventId ?? row.event_id,
    connectionId: row.connectionId ?? row.connection_id,
    empresaId: row.empresaId ?? row.empresa_id,
    merchantId: row.merchantId ?? row.merchant_id,
    externalOrderId: row.externalOrderId ?? row.external_order_id,
    eventType: row.eventType ?? row.event_type,
    externalRevision: row.externalRevision ?? row.external_revision,
    occurredAt: row.occurredAt ?? row.occurred_at,
    leaseId: row.leaseId ?? row.lease_id,
    leaseUntil: row.leaseUntil ?? row.lease_until
  };
}

function mapCommandRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    commandId: row.commandId ?? row.command_id,
    connectionId: row.connectionId ?? row.connection_id,
    orderRefId: row.orderRefId ?? row.order_ref_id,
    empresaId: row.empresaId ?? row.empresa_id,
    merchantId: row.merchantId ?? row.merchant_id,
    externalOrderId: row.externalOrderId ?? row.external_order_id,
    expectedExternalRevision: row.expectedExternalRevision ?? row.expected_external_revision,
    idempotencyKey: row.idempotencyKey ?? row.idempotency_key,
    leaseId: row.leaseId ?? row.lease_id,
    leaseUntil: row.leaseUntil ?? row.lease_until
  };
}

function mapProjection(row) {
  if (!row || typeof row !== 'object') return row;
  const first = Array.isArray(row) ? row[0] : row;
  if (!first || typeof first !== 'object') return first;
  return {
    ...first,
    outcome: first.outcome ?? null,
    zelo_order_id: first.zelo_order_id ?? first.zeloOrderId ?? null,
    revision: first.revision ?? null
  };
}

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];
  return [];
}

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

  return async function postRpc(rpcName, params, signal) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${rpcName}`, {
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
  return async function invokeRpc(rpcName, params, signal) {
    const options = signal ? { abortSignal: signal } : undefined;
    const result = supabase.rpc(rpcName, params, options);
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
 * Production iFood worker repository. `probeDependencies()` stays the
 * non-mutating health check. Claim/finish/project methods exist so the
 * bootstrap can run inbox/commands when explicit env flags are on; the
 * default worker loop never calls them.
 */
export function createIfoodSupabaseRepository(options = {}) {
  const rpc = resolveRpc(options);
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;

  async function invokeRpc(rpcName, params, signal) {
    const timeout = withTimeoutSignal(signal, timeoutMs);
    try {
      return await rpc(rpcName, params, timeout.signal);
    } finally {
      timeout.cleanup();
    }
  }

  async function mutatingRpc(rpcName, params, signal) {
    const result = await invokeRpc(rpcName, params, signal);
    if (result?.error) throw repositoryError();
    return result?.data;
  }

  async function probeDependencies({ signal } = {}) {
    const timeout = withTimeoutSignal(signal, timeoutMs);
    try {
      const result = await rpc(CLAIM_EVENTS_RPC, claimProbeParams(), timeout.signal);
      return classifyProbeResult(result);
    } catch (error) {
      if (signal?.aborted && isAbortError(error)) throw error;
      if (signal?.aborted) throw error;
      return { databaseReachable: false, leaseCapable: false };
    } finally {
      timeout.cleanup();
    }
  }

  async function claimEvents({ workerId, limit = 10, leaseSeconds = 120, signal } = {}) {
    const data = await mutatingRpc(CLAIM_EVENTS_RPC, {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds
    }, signal);
    return asRows(data).map(mapInboxRow);
  }

  async function finishEvent({
    inboxId,
    leaseId,
    outcome,
    errorCode = null,
    errorMessage = null,
    nextAttemptAt = null,
    signal
  } = {}) {
    await mutatingRpc(FINISH_EVENT_RPC, {
      p_inbox_id: inboxId,
      p_lease_id: leaseId,
      p_outcome: outcome,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_next_attempt_at: nextAttemptAt
    }, signal);
  }

  async function claimCommands({ workerId, limit = 10, leaseSeconds = 120, signal } = {}) {
    const data = await mutatingRpc(CLAIM_COMMANDS_RPC, {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds
    }, signal);
    return asRows(data).map(mapCommandRow);
  }

  async function finishCommand({
    commandId,
    leaseId,
    outcome,
    errorCode = null,
    errorMessage = null,
    response = null,
    nextAttemptAt = null,
    signal
  } = {}) {
    await mutatingRpc(FINISH_COMMAND_RPC, {
      p_command_id: commandId,
      p_lease_id: leaseId,
      p_outcome: outcome,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_response: response,
      p_next_attempt_at: nextAttemptAt
    }, signal);
  }

  async function projectOrderEvent({
    merchantId,
    externalOrderId,
    eventId,
    externalStatus,
    occurredAt = null,
    order,
    signal
  } = {}) {
    const data = await mutatingRpc(PROJECT_ORDER_EVENT_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_event_id: eventId,
      p_external_status: externalStatus,
      p_occurred_at: occurredAt,
      p_order: order
    }, signal);
    return mapProjection(data);
  }

  return Object.freeze({
    probeDependencies,
    claimEvents,
    finishEvent,
    claimCommands,
    finishCommand,
    projectOrderEvent
  });
}

export const IFOOD_LEASE_PROBE = Object.freeze({
  rpc: CLAIM_EVENTS_RPC,
  workerId: PROBE_WORKER_ID,
  timeoutMs: PROBE_TIMEOUT_MS
});

export default createIfoodSupabaseRepository;
