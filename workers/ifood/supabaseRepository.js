const CLAIM_EVENTS_RPC = 'claim_ifood_events_v1';
const FINISH_EVENT_RPC = 'finish_ifood_event_v1';
const CLAIM_COMMANDS_RPC = 'claim_ifood_commands_v1';
const FINISH_COMMAND_RPC = 'finish_ifood_command_v1';
const PROJECT_ORDER_EVENT_RPC = 'project_ifood_order_event_v1';
const LIST_POLLING_CONNECTIONS_RPC = 'list_ifood_connections_for_polling_v1';
const ENQUEUE_POLLED_EVENT_RPC = 'enqueue_ifood_webhook_event_v1';
const RECORD_POLL_SUCCESS_RPC = 'record_ifood_poll_success_v1';
const CONFIRM_COMMANDS_RPC = 'confirm_ifood_order_commands_v1';
const COMMIT_STOCK_RPC = 'commit_ifood_stock_for_event_v1';
const RELEASE_STOCK_RPC = 'release_ifood_stock_for_event_v1';
const MATERIALIZE_SALE_RPC = 'materialize_ifood_sale_v1';
const REVERSE_SALE_RPC = 'reverse_ifood_sale_v1';
const EXPIRE_ACCEPTED_COMMANDS_RPC = 'expire_ifood_accepted_commands_v1';
const MAX_POLLING_CONNECTIONS = 1_000;
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

function mapConnectionRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    connectionId: row.connectionId ?? row.connection_id ?? null,
    empresaId: row.empresaId ?? row.empresa_id ?? null,
    merchantId: row.merchantId ?? row.merchant_id ?? null,
    status: row.status ?? null,
    lastPollAt: row.lastPollAt ?? row.last_poll_at ?? null,
    pollingCursor: row.pollingCursor ?? row.polling_cursor ?? null
  };
}

function mapEnqueueOutcome(data) {
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== 'object') return { outcome: null };
  return {
    outcome: first.outcome ?? null,
    inboxId: first.inbox_id ?? first.inboxId ?? null,
    eventId: first.event_id ?? first.eventId ?? null,
    inserted: first.inserted === true,
    status: first.status ?? null
  };
}

function firstRow(data) {
  const first = Array.isArray(data) ? data[0] : data;
  return first && typeof first === 'object' ? first : null;
}

function mapStockCommit(data) {
  const first = firstRow(data);
  return {
    outcome: first?.outcome ?? null,
    committedCount: Number(first?.committed_count ?? first?.committedCount ?? 0),
    skippedUnmapped: Number(first?.skipped_unmapped ?? first?.skippedUnmapped ?? 0),
    skippedInsufficient: Number(first?.skipped_insufficient ?? first?.skippedInsufficient ?? 0),
    duplicateCount: Number(first?.duplicate_count ?? first?.duplicateCount ?? 0)
  };
}

function mapStockRelease(data) {
  const first = firstRow(data);
  return {
    outcome: first?.outcome ?? null,
    releasedCount: Number(first?.released_count ?? first?.releasedCount ?? 0),
    duplicateCount: Number(first?.duplicate_count ?? first?.duplicateCount ?? 0)
  };
}

function mapSaleMaterialize(data) {
  const first = firstRow(data);
  return {
    outcome: first?.outcome ?? null,
    vendaId: first?.venda_id ?? first?.vendaId ?? null
  };
}

function mapSaleReverse(data) {
  const first = firstRow(data);
  return {
    outcome: first?.outcome ?? null,
    estornoId: first?.estorno_id ?? first?.estornoId ?? null,
    vendaId: first?.venda_id ?? first?.vendaId ?? null,
    status: first?.status ?? null
  };
}

function asCount(data) {
  return Number.isInteger(data) ? data : Number(data ?? 0);
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

  /**
   * Connections the polling reconciler may poll this cycle. `pollingIntervalMs`
   * is the per-connection floor the RPC applies against `last_poll_at`, so a
   * short worker interval can never poll one merchant faster than the provider
   * allows.
   */
  async function listConnectionsForPolling({
    now = null,
    pollingIntervalMs = null,
    limit = MAX_POLLING_CONNECTIONS,
    signal
  } = {}) {
    const data = await mutatingRpc(LIST_POLLING_CONNECTIONS_RPC, {
      p_now: now,
      p_min_interval_ms: Number.isSafeInteger(pollingIntervalMs) && pollingIntervalMs > 0
        ? pollingIntervalMs
        : null,
      p_limit: Number.isSafeInteger(limit) && limit > 0
        ? Math.min(limit, MAX_POLLING_CONNECTIONS)
        : MAX_POLLING_CONNECTIONS
    }, signal);
    return asRows(data).map(mapConnectionRow);
  }

  /**
   * Persist one polled provider event into `event_inbox`. This reuses the
   * webhook enqueue RPC on purpose: it already resolves the connection from
   * `merchantId` and already returns the inserted/duplicate/unknown_merchant
   * outcome the reconciler branches on before it ACKs anything, so polling and
   * webhooks share a single insert path and a single idempotency constraint.
   */
  async function enqueuePolledEvent({
    eventId,
    merchantId,
    externalOrderId = null,
    eventType,
    externalRevision = 0,
    occurredAt = null,
    payload,
    signal
  } = {}) {
    const data = await mutatingRpc(ENQUEUE_POLLED_EVENT_RPC, {
      p_event_id: eventId,
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_event_type: eventType,
      p_external_revision: Number.isSafeInteger(externalRevision) ? externalRevision : 0,
      p_occurred_at: occurredAt,
      p_payload: payload
    }, signal);
    return mapEnqueueOutcome(data);
  }

  /**
   * A successful poll is an authenticated provider call, so it is also the
   * proof the token still works: the RPC stamps `last_poll_at`,
   * `last_token_at` and `worker_heartbeat_at` together, which is what
   * `connectionHealth.js` reads to clear a stale-token/heartbeat reason.
   */
  async function recordPollSuccess({
    connectionId = null,
    merchantId,
    polledAt = null,
    tokenConfirmedAt = null,
    signal
  } = {}) {
    const data = await mutatingRpc(RECORD_POLL_SUCCESS_RPC, {
      p_connection_id: connectionId,
      p_merchant_id: merchantId,
      p_polled_at: polledAt,
      p_token_confirmed_at: tokenConfirmedAt ?? polledAt
    }, signal);
    const first = Array.isArray(data) ? data[0] : data;
    return {
      outcome: first?.outcome ?? null,
      connectionId: first?.connection_id ?? first?.connectionId ?? null,
      merchantId: first?.merchant_id ?? first?.merchantId ?? null
    };
  }

  /**
   * Correlate a projected event back to any command that predicted it
   * (`eventHandler.js` calls this after every `applied`/`ignored_duplicate`
   * projection). Best-effort by design: the projection already committed,
   * so a failure here only delays a PDV "waiting" indicator, never the
   * order's canonical status.
   */
  async function confirmCommandsForEvent({ merchantId, externalOrderId, externalStatus, signal } = {}) {
    const data = await mutatingRpc(CONFIRM_COMMANDS_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_external_status: externalStatus
    }, signal);
    return asCount(data);
  }

  /**
   * Stock is event-driven (CONFIRMED commits, CANCELLED releases), never
   * command-driven — `eventHandler.js` calls this once per CONFIRMED
   * projection. The ledger RPC is idempotent per event/item.
   */
  async function commitStockForEvent({ merchantId, externalOrderId, eventId, items, signal } = {}) {
    const data = await mutatingRpc(COMMIT_STOCK_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_event_id: eventId,
      p_items: items
    }, signal);
    return mapStockCommit(data);
  }

  /** Mirror of commitStockForEvent for the CANCELLED path. */
  async function releaseStockForEvent({ merchantId, externalOrderId, eventId, signal } = {}) {
    const data = await mutatingRpc(RELEASE_STOCK_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_event_id: eventId
    }, signal);
    return mapStockRelease(data);
  }

  /**
   * Materializes a CONCLUDED iFood order as `public.vendas`, idempotent via
   * `vendas.client_sale_id`. Called once per CONCLUDED projection.
   */
  async function materializeSaleForEvent({ merchantId, externalOrderId, signal } = {}) {
    const data = await mutatingRpc(MATERIALIZE_SALE_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId
    }, signal);
    return mapSaleMaterialize(data);
  }

  /**
   * Reverses a materialized sale on the CANCELLED path, idempotent via
   * `vendas_estornos.event_id`.
   */
  async function reverseSaleForEvent({ merchantId, externalOrderId, eventId, signal } = {}) {
    const data = await mutatingRpc(REVERSE_SALE_RPC, {
      p_merchant_id: merchantId,
      p_external_order_id: externalOrderId,
      p_event_id: eventId
    }, signal);
    return mapSaleReverse(data);
  }

  /**
   * `commandProcessor.js` calls this once per cycle to expire commands stuck
   * in `accepted_http` past the provider's ack window, without touching
   * `zelo_orders` — the event stream is still the source of truth for status.
   */
  async function expireAcceptedCommands({ olderThanSeconds, signal } = {}) {
    const data = await mutatingRpc(EXPIRE_ACCEPTED_COMMANDS_RPC, {
      p_older_than_seconds: olderThanSeconds
    }, signal);
    return asCount(data);
  }

  return Object.freeze({
    probeDependencies,
    claimEvents,
    finishEvent,
    claimCommands,
    finishCommand,
    projectOrderEvent,
    listConnectionsForPolling,
    enqueuePolledEvent,
    recordPollSuccess,
    confirmCommandsForEvent,
    commitStockForEvent,
    releaseStockForEvent,
    materializeSaleForEvent,
    reverseSaleForEvent,
    expireAcceptedCommands
  });
}

export const IFOOD_POLLING_RPCS = Object.freeze({
  listConnections: LIST_POLLING_CONNECTIONS_RPC,
  enqueueEvent: ENQUEUE_POLLED_EVENT_RPC,
  recordPollSuccess: RECORD_POLL_SUCCESS_RPC,
  maxConnections: MAX_POLLING_CONNECTIONS
});

export const IFOOD_LEASE_PROBE = Object.freeze({
  rpc: CLAIM_EVENTS_RPC,
  workerId: PROBE_WORKER_ID,
  timeoutMs: PROBE_TIMEOUT_MS
});

export const IFOOD_EVENT_EFFECT_RPCS = Object.freeze({
  confirmCommandsForEvent: CONFIRM_COMMANDS_RPC,
  commitStockForEvent: COMMIT_STOCK_RPC,
  releaseStockForEvent: RELEASE_STOCK_RPC,
  materializeSaleForEvent: MATERIALIZE_SALE_RPC,
  reverseSaleForEvent: REVERSE_SALE_RPC,
  expireAcceptedCommands: EXPIRE_ACCEPTED_COMMANDS_RPC
});

export default createIfoodSupabaseRepository;
