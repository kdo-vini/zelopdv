import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIfoodOperationsService } from '../admin-dashboard/src/lib/server/ifoodOperations.js';

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const INBOX_ID = '22222222-2222-4222-8222-222222222222';
const COMMAND_ID = '33333333-3333-4333-8333-333333333333';

function adminGate(overrides = {}) {
  return {
    ok: true,
    admin: { id: 'admin-1', email: 'ops@zelopdv.test', is_active: true },
    ...overrides
  };
}

function makeService({
  requireSuperAdmin = async () => adminGate(),
  repository
} = {}) {
  return createIfoodOperationsService({
    requireSuperAdmin,
    repository: {
      listConnections: vi.fn(async () => []),
      listReplayable: vi.fn(async () => []),
      setConnectionStatus: vi.fn(async () => ({
        outcome: 'updated',
        connectionId: CONNECTION_ID,
        merchantId: 'merchant-1',
        status: 'paused'
      })),
      replayEvent: vi.fn(async () => ({
        outcome: 'requeued',
        inboxId: INBOX_ID,
        eventId: 'evt-1',
        status: 'queued'
      })),
      replayCommand: vi.fn(async () => ({
        outcome: 'requeued',
        commandId: COMMAND_ID,
        status: 'queued'
      })),
      writeAuditLog: vi.fn(async () => true),
      ...repository
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createIfoodOperationsService access', () => {
  it('requires a super admin before listing connections', async () => {
    const service = makeService({
      requireSuperAdmin: async () => ({ ok: false, status: 403, body: { error: 'forbidden' } })
    });
    await expect(service.listConnections({
      authResult: { user: { id: 'u1' } }
    })).resolves.toEqual({ status: 403, body: { error: 'forbidden' } });
  });

  it('returns sanitized connection metrics without inventing payload fields', async () => {
    const service = makeService({
      repository: {
        listConnections: vi.fn(async () => [{
          connection_id: CONNECTION_ID,
          merchant_id: 'merchant-1',
          status: 'active',
          print_owner: 'zelo',
          queued_events: 2,
          dead_letter_events: 1,
          payload: { customer: 'secret-should-not-leak' }
        }])
      }
    });
    const result = await service.listConnections({ authResult: { user: { id: 'admin' } } });
    expect(result.status).toBe(200);
    expect(result.body.connections).toHaveLength(1);
    expect(result.body.connections[0]).toMatchObject({
      connectionId: CONNECTION_ID,
      merchantId: 'merchant-1',
      queuedEvents: 2,
      deadLetterEvents: 1
    });
    expect(JSON.stringify(result.body)).not.toContain('secret-should-not-leak');
    expect(result.body.connections[0].payload).toBeUndefined();
  });
});

describe('createIfoodOperationsService actions', () => {
  it('pauses and resumes as separate kill switches and writes audit logs', async () => {
    const writeAuditLog = vi.fn(async () => true);
    const setConnectionStatus = vi.fn(async ({ status }) => ({
      outcome: 'updated',
      connectionId: CONNECTION_ID,
      merchantId: 'merchant-1',
      status
    }));
    const service = makeService({ repository: { setConnectionStatus, writeAuditLog } });

    const paused = await service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'pause', connectionId: CONNECTION_ID }
    });
    expect(paused).toEqual({
      status: 200,
      body: {
        connectionId: CONNECTION_ID,
        merchantId: 'merchant-1',
        status: 'paused',
        outcome: 'updated'
      }
    });
    expect(setConnectionStatus).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      status: 'paused'
    });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ifood.connection.pause',
      adminId: 'admin-1',
      adminEmail: 'ops@zelopdv.test'
    }));

    const resumed = await service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'resume', connectionId: CONNECTION_ID }
    });
    expect(resumed.body.status).toBe('active');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ifood.connection.resume'
    }));
  });

  it('replays an event by inbox id only — rejects caller-supplied payload or new eventId', async () => {
    const replayEvent = vi.fn(async () => ({
      outcome: 'requeued',
      inboxId: INBOX_ID,
      eventId: 'evt-original',
      status: 'queued'
    }));
    const service = makeService({ repository: { replayEvent } });

    await expect(service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'replay_event', inboxId: INBOX_ID, payload: { forged: true } }
    })).resolves.toEqual({ status: 422, body: { error: 'invalid_payload' } });

    await expect(service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'replay_event', inboxId: INBOX_ID, eventId: 'brand-new-id' }
    })).resolves.toEqual({ status: 422, body: { error: 'invalid_payload' } });

    const ok = await service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'replay_event', inboxId: INBOX_ID }
    });
    expect(ok.status).toBe(200);
    expect(ok.body.eventId).toBe('evt-original');
    expect(replayEvent).toHaveBeenCalledWith({ inboxId: INBOX_ID });
  });

  it('maps not_replayable to 409 and connection miss to 404', async () => {
    const service = makeService({
      repository: {
        setConnectionStatus: vi.fn(async () => ({ outcome: 'not_found' })),
        replayCommand: vi.fn(async () => ({ outcome: 'not_replayable' }))
      }
    });

    await expect(service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'pause', connectionId: CONNECTION_ID }
    })).resolves.toEqual({ status: 404, body: { error: 'connection_not_found' } });

    await expect(service.runAction({
      authResult: { user: { id: 'admin' } },
      body: { action: 'replay_command', commandId: COMMAND_ID }
    })).resolves.toEqual({ status: 409, body: { error: 'not_replayable' } });
  });
});
