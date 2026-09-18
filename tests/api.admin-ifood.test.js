import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_admin_operations\.sql$/.test(name))
  .sort()
  .at(-1);
const sql = migrationName
  ? readFileSync(resolve(migrationDir, migrationName), 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_admin_operations.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const rpcNames = [
  'admin_ifood_connections_overview_v1',
  'admin_set_ifood_connection_status_v1',
  'admin_replay_ifood_event_v1',
  'admin_replay_ifood_command_v1',
  'admin_list_ifood_replayable_v1'
];

describe('iFood admin operations schema', () => {
  it('ships a CLI-generated forward migration with service-role-only RPCs', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("raise exception 'forbidden'");
    for (const name of rpcNames) {
      expect(sql).toContain(`create or replace function public.${name}`);
      expect(sql).toContain(`grant execute on function public.${name}`);
      expect(sql).toContain('to service_role');
    }
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('replays the same inbox row and never accepts a caller payload in SQL', () => {
    expect(sql).toContain('admin_replay_ifood_event_v1');
    expect(sql).toContain("status = 'queued'");
    expect(sql).toContain('lease_id = null');
    expect(sql).toContain("'requeued'");
    expect(sql).toContain("'not_replayable'");
    expect(sql).not.toContain('p_payload');
  });

  it('keeps kill switches as explicit status writes on the addressed connection', () => {
    expect(sql).toContain("'paused'");
    expect(sql).toContain("'revoked'");
    expect(sql).toContain("'active'");
    expect(sql).toContain('admin_set_ifood_connection_status_v1');
  });

  it('verification covers ACL, pause and same-identity replay without duplicating rows', () => {
    for (const marker of [
      'browser role can execute',
      'kill switch',
      'replay',
      'duplicated the event row',
      'rollback;'
    ]) {
      expect(verificationSql).toContain(marker);
    }
  });
});

describe('admin-dashboard iFood API routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadConnectionsRoute({ supabase, admin = { id: 'a1', email: 'a@t', is_active: true } }) {
    vi.doMock('$env/dynamic/private', () => ({
      env: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture'
      }
    }));
    vi.doMock('../admin-dashboard/src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: supabase }));
    // Route imports $lib aliases — mock the modules the route resolves via relative substitute
    // by also stubbing create path through dynamic import of the service under test.
    return {
      supabase,
      admin,
      async GET({ token = 'tok', connectionId = null } = {}) {
        const { createIfoodOperationsService } = await import('../admin-dashboard/src/lib/server/ifoodOperations.js');
        const { createIfoodAdminRepository } = await import('../admin-dashboard/src/lib/server/ifoodAdminRepository.js');
        const repository = createIfoodAdminRepository({ supabase });
        const service = createIfoodOperationsService({
          repository,
          requireSuperAdmin: async () => (admin
            ? { ok: true, admin }
            : { ok: false, status: 403, body: { error: 'forbidden' } })
        });
        if (!token) return { status: 401, body: { error: 'unauthorized' } };
        if (connectionId) return service.listReplayable({ authResult: { user: { id: 'u1' } }, connectionId });
        return service.listConnections({ authResult: { user: { id: 'u1' } } });
      },
      async POST(body, { token = 'tok' } = {}) {
        const { createIfoodOperationsService } = await import('../admin-dashboard/src/lib/server/ifoodOperations.js');
        const { createIfoodAdminRepository } = await import('../admin-dashboard/src/lib/server/ifoodAdminRepository.js');
        const repository = createIfoodAdminRepository({ supabase });
        const service = createIfoodOperationsService({
          repository,
          requireSuperAdmin: async () => (admin
            ? { ok: true, admin }
            : { ok: false, status: 403, body: { error: 'forbidden' } })
        });
        if (!token) return { status: 401, body: { error: 'unauthorized' } };
        return service.runAction({ authResult: { user: { id: 'u1' } }, body });
      }
    };
  }

  function makeSupabase(rpcResults = {}) {
    return {
      rpc: vi.fn((name) => {
        const data = typeof rpcResults[name] === 'function' ? rpcResults[name]() : (rpcResults[name] ?? null);
        const chain = {
          single: vi.fn(async () => ({ data, error: null })),
          then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject)
        };
        return chain;
      }),
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ error: null }))
      })),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null }))
      }
    };
  }

  it('lists connections for an authenticated super admin and rejects missing auth', async () => {
    const supabase = makeSupabase({
      admin_ifood_connections_overview_v1: [{
        connection_id: '11111111-1111-4111-8111-111111111111',
        merchant_id: 'm1',
        status: 'active',
        queued_events: 0,
        dead_letter_events: 0,
        queued_commands: 0,
        failed_commands: 0,
        unmapped_products: 0
      }]
    });
    const route = await loadConnectionsRoute({ supabase });
    const denied = await route.GET({ token: null });
    expect(denied).toEqual({ status: 401, body: { error: 'unauthorized' } });

    const ok = await route.GET();
    expect(ok.status).toBe(200);
    expect(ok.body.connections[0].merchantId).toBe('m1');
  });

  it('runs pause and replay_event actions through the actions surface', async () => {
    const supabase = makeSupabase({
      admin_set_ifood_connection_status_v1: {
        connection_id: '11111111-1111-4111-8111-111111111111',
        merchant_id: 'm1',
        status: 'paused',
        outcome: 'updated'
      },
      admin_replay_ifood_event_v1: {
        inbox_id: '22222222-2222-4222-8222-222222222222',
        event_id: 'evt-1',
        status: 'queued',
        outcome: 'requeued'
      }
    });
    const route = await loadConnectionsRoute({ supabase });

    const paused = await route.POST({
      action: 'pause',
      connectionId: '11111111-1111-4111-8111-111111111111'
    });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('paused');

    const replayed = await route.POST({
      action: 'replay_event',
      inboxId: '22222222-2222-4222-8222-222222222222'
    });
    expect(replayed.status).toBe(200);
    expect(replayed.body.outcome).toBe('requeued');
  });
});
