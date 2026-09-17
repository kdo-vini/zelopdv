// Pure + injectable iFood operations console for super-admins.
// Browser never receives raw webhook payloads — only counts, statuses and
// truncated error codes. Replay resets the SAME inbox/command row.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KILL_SWITCH_STATUSES = new Set(['active', 'paused', 'revoked']);
const ACTION_TYPES = new Set([
  'pause',
  'resume',
  'revoke',
  'replay_event',
  'replay_command'
]);

function result(status, body) {
  return { status, body };
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

function truncateError(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  return code.trim().slice(0, 80);
}

function mapConnection(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    connectionId: row.connection_id ?? row.connectionId ?? null,
    empresaId: row.empresa_id ?? row.empresaId ?? null,
    merchantId: row.merchant_id ?? row.merchantId ?? null,
    status: row.status ?? null,
    printOwner: row.print_owner ?? row.printOwner ?? null,
    lastWebhookAt: row.last_webhook_at ?? row.lastWebhookAt ?? null,
    lastPollAt: row.last_poll_at ?? row.lastPollAt ?? null,
    lastTokenAt: row.last_token_at ?? row.lastTokenAt ?? null,
    workerHeartbeatAt: row.worker_heartbeat_at ?? row.workerHeartbeatAt ?? null,
    queuedEvents: Number(row.queued_events ?? row.queuedEvents ?? 0),
    deadLetterEvents: Number(row.dead_letter_events ?? row.deadLetterEvents ?? 0),
    queuedCommands: Number(row.queued_commands ?? row.queuedCommands ?? 0),
    failedCommands: Number(row.failed_commands ?? row.failedCommands ?? 0),
    unmappedProducts: Number(row.unmapped_products ?? row.unmappedProducts ?? 0),
    lastEventReceivedAt: row.last_event_received_at ?? row.lastEventReceivedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

function mapReplayable(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    kind: row.kind ?? null,
    rowId: row.row_id ?? row.rowId ?? null,
    externalRef: row.external_ref ?? row.externalRef ?? null,
    status: row.status ?? null,
    attempts: Number(row.attempts ?? 0),
    lastErrorCode: truncateError(row.last_error_code ?? row.lastErrorCode),
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

function statusForAction(action) {
  if (action === 'pause') return 'paused';
  if (action === 'resume') return 'active';
  if (action === 'revoke') return 'revoked';
  return null;
}

/**
 * @param {{
 *   repository: {
 *     listConnections: Function,
 *     listReplayable: Function,
 *     setConnectionStatus: Function,
 *     replayEvent: Function,
 *     replayCommand: Function,
 *     writeAuditLog?: Function
 *   },
 *   requireSuperAdmin: (authResult: object) => Promise<{ ok: true, admin: object } | { ok: false, status: number, body: object }>
 * }} deps
 */
export function createIfoodOperationsService({ repository, requireSuperAdmin } = {}) {
  if (!repository
    || typeof repository.listConnections !== 'function'
    || typeof repository.setConnectionStatus !== 'function'
    || typeof repository.replayEvent !== 'function'
    || typeof repository.replayCommand !== 'function') {
    throw new TypeError('createIfoodOperationsService requires repository methods');
  }
  if (typeof requireSuperAdmin !== 'function') {
    throw new TypeError('createIfoodOperationsService requires requireSuperAdmin()');
  }

  async function authorize(authResult) {
    try {
      const gate = await requireSuperAdmin(authResult);
      if (!gate?.ok) {
        return { error: result(gate?.status ?? 403, gate?.body ?? { error: 'forbidden' }) };
      }
      return { admin: gate.admin };
    } catch {
      return { error: result(500, { error: 'unavailable' }) };
    }
  }

  async function listConnections({ authResult } = {}) {
    const auth = await authorize(authResult);
    if (auth.error) return auth.error;
    try {
      const rows = await repository.listConnections();
      return result(200, {
        connections: (Array.isArray(rows) ? rows : []).map(mapConnection).filter(Boolean)
      });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  async function listReplayable({ authResult, connectionId } = {}) {
    const auth = await authorize(authResult);
    if (auth.error) return auth.error;
    if (!isValidUuid(connectionId)) return result(400, { error: 'invalid_connection_id' });
    if (typeof repository.listReplayable !== 'function') {
      return result(500, { error: 'unavailable' });
    }
    try {
      const rows = await repository.listReplayable({ connectionId: connectionId.trim() });
      return result(200, {
        items: (Array.isArray(rows) ? rows : []).map(mapReplayable).filter(Boolean)
      });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  async function runAction({ authResult, body } = {}) {
    const auth = await authorize(authResult);
    if (auth.error) return auth.error;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return result(422, { error: 'invalid_payload' });
    }

    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (!ACTION_TYPES.has(action)) return result(422, { error: 'invalid_action' });

    try {
      if (action === 'pause' || action === 'resume' || action === 'revoke') {
        if (!isValidUuid(body.connectionId)) return result(400, { error: 'invalid_connection_id' });
        const status = statusForAction(action);
        if (!KILL_SWITCH_STATUSES.has(status)) return result(422, { error: 'invalid_action' });

        const repoResult = await repository.setConnectionStatus({
          connectionId: body.connectionId.trim(),
          status
        });
        if (repoResult?.outcome === 'not_found') {
          return result(404, { error: 'connection_not_found' });
        }
        if (typeof repository.writeAuditLog === 'function') {
          await repository.writeAuditLog({
            adminId: auth.admin?.id ?? null,
            adminEmail: auth.admin?.email ?? null,
            action: `ifood.connection.${action}`,
            details: {
              connectionId: body.connectionId.trim(),
              status,
              merchantId: repoResult?.merchantId ?? null
            }
          }).catch(() => {});
        }
        return result(200, {
          connectionId: repoResult?.connectionId ?? body.connectionId.trim(),
          merchantId: repoResult?.merchantId ?? null,
          status: repoResult?.status ?? status,
          outcome: repoResult?.outcome ?? 'updated'
        });
      }

      if (action === 'replay_event') {
        if (!isValidUuid(body.inboxId)) return result(400, { error: 'invalid_inbox_id' });
        // Never accept a caller-supplied payload — only the inbox row id.
        if (body.payload !== undefined || body.eventId !== undefined) {
          return result(422, { error: 'invalid_payload' });
        }
        const repoResult = await repository.replayEvent({ inboxId: body.inboxId.trim() });
        if (repoResult?.outcome === 'not_replayable') {
          return result(409, { error: 'not_replayable' });
        }
        if (typeof repository.writeAuditLog === 'function') {
          await repository.writeAuditLog({
            adminId: auth.admin?.id ?? null,
            adminEmail: auth.admin?.email ?? null,
            action: 'ifood.event.replay',
            details: {
              inboxId: body.inboxId.trim(),
              eventId: repoResult?.eventId ?? null,
              status: repoResult?.status ?? null
            }
          }).catch(() => {});
        }
        return result(200, {
          inboxId: repoResult?.inboxId ?? body.inboxId.trim(),
          eventId: repoResult?.eventId ?? null,
          status: repoResult?.status ?? null,
          outcome: repoResult?.outcome ?? 'requeued'
        });
      }

      if (action === 'replay_command') {
        if (!isValidUuid(body.commandId)) return result(400, { error: 'invalid_command_id' });
        if (body.payload !== undefined) return result(422, { error: 'invalid_payload' });
        const repoResult = await repository.replayCommand({ commandId: body.commandId.trim() });
        if (repoResult?.outcome === 'not_replayable') {
          return result(409, { error: 'not_replayable' });
        }
        if (typeof repository.writeAuditLog === 'function') {
          await repository.writeAuditLog({
            adminId: auth.admin?.id ?? null,
            adminEmail: auth.admin?.email ?? null,
            action: 'ifood.command.replay',
            details: {
              commandId: body.commandId.trim(),
              status: repoResult?.status ?? null
            }
          }).catch(() => {});
        }
        return result(200, {
          commandId: repoResult?.commandId ?? body.commandId.trim(),
          status: repoResult?.status ?? null,
          outcome: repoResult?.outcome ?? 'requeued'
        });
      }

      return result(422, { error: 'invalid_action' });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  return Object.freeze({ listConnections, listReplayable, runAction });
}

export default createIfoodOperationsService;
