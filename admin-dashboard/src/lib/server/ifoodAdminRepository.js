// RPC seams for the admin iFood operations console.
function repositoryError() {
  return new Error('iFood admin operations repository failed');
}

/**
 * @param {{ supabase: { rpc: Function, from?: Function } }} deps
 */
export function createIfoodAdminRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodAdminRepository requires supabase.rpc()');
  }

  async function listConnections() {
    let result;
    try {
      result = await supabase.rpc('admin_ifood_connections_overview_v1');
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Array.isArray(result?.data) ? result.data : [];
  }

  async function listReplayable({ connectionId }) {
    let result;
    try {
      result = await supabase.rpc('admin_list_ifood_replayable_v1', {
        p_connection_id: connectionId
      });
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return Array.isArray(result?.data) ? result.data : [];
  }

  async function setConnectionStatus({ connectionId, status }) {
    let result;
    try {
      result = await supabase.rpc('admin_set_ifood_connection_status_v1', {
        p_connection_id: connectionId,
        p_status: status
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    const data = result?.data ?? {};
    return {
      connectionId: data.connection_id ?? data.connectionId ?? null,
      merchantId: data.merchant_id ?? data.merchantId ?? null,
      status: data.status ?? null,
      outcome: data.outcome ?? null
    };
  }

  async function replayEvent({ inboxId }) {
    let result;
    try {
      result = await supabase.rpc('admin_replay_ifood_event_v1', {
        p_inbox_id: inboxId
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    const data = result?.data ?? {};
    return {
      inboxId: data.inbox_id ?? data.inboxId ?? null,
      eventId: data.event_id ?? data.eventId ?? null,
      status: data.status ?? null,
      outcome: data.outcome ?? null
    };
  }

  async function replayCommand({ commandId }) {
    let result;
    try {
      result = await supabase.rpc('admin_replay_ifood_command_v1', {
        p_command_id: commandId
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    const data = result?.data ?? {};
    return {
      commandId: data.command_id ?? data.commandId ?? null,
      status: data.status ?? null,
      outcome: data.outcome ?? null
    };
  }

  async function writeAuditLog({ adminId, adminEmail, action, details }) {
    if (typeof supabase.from !== 'function' || !adminId || !adminEmail) return null;
    const { error } = await supabase.from('admin_activity_logs').insert({
      admin_id: adminId,
      admin_email: adminEmail,
      action,
      details: details && typeof details === 'object' ? details : {},
      created_at: new Date().toISOString()
    });
    if (error) throw repositoryError();
    return true;
  }

  return Object.freeze({
    listConnections,
    listReplayable,
    setConnectionStatus,
    replayEvent,
    replayCommand,
    writeAuditLog
  });
}

export default createIfoodAdminRepository;
