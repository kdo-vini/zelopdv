// Supabase seams for the asynchronous iFood command queue. The private
// schema is intentionally accessed only through the service-role RPCs; this
// module contains no auth, environment, or provider concerns so routes and
// workers can inject it or replace it with a fake.

function repositoryError() {
  return new Error('iFood command repository operation failed');
}

function mapCommand(row) {
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

function mapRef(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    ...row,
    merchantId: row.merchantId ?? row.merchant_id,
    externalOrderId: row.externalOrderId ?? row.external_order_id,
    connectionStatus: row.connectionStatus ?? row.connection_status
  };
}

function mapOrderSyncState(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    zeloOrderId: row.zeloOrderId ?? row.zelo_order_id ?? null,
    externalStatus: row.externalStatus ?? row.external_status ?? null,
    lastEventAt: row.lastEventAt ?? row.last_event_at ?? null,
    connectionStatus: row.connectionStatus ?? row.connection_status ?? null,
    commandIntent: row.commandIntent ?? row.command_intent ?? null,
    commandStatus: row.commandStatus ?? row.command_status ?? null,
    commandUpdatedAt: row.commandUpdatedAt ?? row.command_updated_at ?? null,
    commandErrorCode: row.commandErrorCode ?? row.command_error_code ?? null
  };
}

/**
 * @param {{ supabase: { rpc: Function } }} deps
 */
export function createIfoodCommandRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodCommandRepository requires a supabase client with rpc()');
  }

  async function enqueueCommand({
    empresaId,
    zeloOrderId,
    intent,
    expectedRevision,
    payload,
    idempotencyKey,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('enqueue_ifood_order_command_v1', {
        p_empresa_id: empresaId,
        p_zelo_order_id: zeloOrderId,
        p_intent: intent,
        p_expected_revision: expectedRevision,
        p_payload: payload,
        p_idempotency_key: idempotencyKey
      }).single();
    } catch {
      throw repositoryError();
    }

    if (result?.error) throw repositoryError();
    const data = result?.data;
    return {
      outcome: data?.outcome,
      commandId: data?.commandId ?? data?.command_id ?? null,
      status: data?.status ?? null
    };
  }

  async function claimCommands({ workerId, limit, leaseSeconds, signal }) {
    let result;
    try {
      result = await supabase.rpc('claim_ifood_commands_v1', {
        p_worker_id: workerId,
        p_limit: limit,
        p_lease_seconds: leaseSeconds
      });
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Array.isArray(result?.data) ? result.data.map(mapCommand) : [];
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
  }) {
    let result;
    try {
      result = await supabase.rpc('finish_ifood_command_v1', {
        p_command_id: commandId,
        p_lease_id: leaseId,
        p_outcome: outcome,
        p_error_code: errorCode,
        p_error_message: errorMessage,
        p_response: response,
        p_next_attempt_at: nextAttemptAt
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return result?.data ?? null;
  }

  async function confirmCommandsForEvent({ merchantId, externalOrderId, externalStatus, signal }) {
    let result;
    try {
      result = await supabase.rpc('confirm_ifood_order_commands_v1', {
        p_merchant_id: merchantId,
        p_external_order_id: externalOrderId,
        p_external_status: externalStatus
      });
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Number.isInteger(result?.data) ? result.data : Number(result?.data ?? 0);
  }

  async function expireAcceptedCommands({ olderThanSeconds, signal }) {
    let result;
    try {
      result = await supabase.rpc('expire_ifood_accepted_commands_v1', {
        p_older_than_seconds: olderThanSeconds
      });
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Number.isInteger(result?.data) ? result.data : Number(result?.data ?? 0);
  }

  async function getOrderRef({ empresaId, zeloOrderId, signal }) {
    let result;
    try {
      result = await supabase.rpc('get_ifood_order_ref_v1', {
        p_empresa_id: empresaId,
        p_zelo_order_id: zeloOrderId
      }).maybeSingle();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapRef(result?.data);
  }

  async function getOrderSyncState({ empresaId, orderIds, signal }) {
    let result;
    try {
      result = await supabase.rpc('get_ifood_order_sync_state_v1', {
        p_empresa_id: empresaId,
        p_order_ids: orderIds
      });
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Array.isArray(result?.data)
      ? result.data.map(mapOrderSyncState).filter(Boolean)
      : [];
  }

  return Object.freeze({
    enqueueCommand,
    claimCommands,
    finishCommand,
    confirmCommandsForEvent,
    expireAcceptedCommands,
    getOrderRef,
    getOrderSyncState
  });
}

export default createIfoodCommandRepository;
