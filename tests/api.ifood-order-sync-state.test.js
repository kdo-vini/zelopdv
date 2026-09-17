import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIfoodSyncStateService } from '../src/lib/server/ifood/syncStateService.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORDER_ID = '22222222-2222-4222-8222-222222222222';
const NO_COMMAND_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const EMPRESA_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'auth-fixture';
const MANY_ORDER_IDS = Array.from(
  { length: 101 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
);

function makeRequest({ token = TOKEN, ids = [ORDER_ID], extraQuery = '' } = {}) {
  const idsQuery = ids === null ? '' : `?ids=${encodeURIComponent(Array.isArray(ids) ? ids.join(',') : ids)}${extraQuery}`;
  return {
    url: `http://localhost/api/integrations/ifood/orders/sync-state${idsQuery}`,
    headers: {
      get: (name) => name.toLowerCase() === 'authorization' && token
        ? `Bearer ${token}`
        : null,
    },
    signal: undefined,
  };
}

function makeSupabase({
  user = { id: 'owner-1' },
  authError = null,
  rows = [],
  rpcError = null,
  profile = { id: EMPRESA_ID },
} = {}) {
  const rpc = vi.fn(async () => ({ data: rows, error: rpcError }));
  const from = vi.fn((table) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: table === 'empresa_perfil' ? profile : null,
        error: null,
      })),
    };
    return query;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: authError })),
    },
    from,
    rpc,
  };
}

function baseAccessContext(overrides = {}) {
  return {
    isSubUser: false,
    ownerUserId: 'owner-1',
    roleId: null,
    permissions: null,
    ...overrides,
  };
}

async function loadRoute({ supabase, accessContext = baseAccessContext() } = {}) {
  vi.resetModules();
  vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: supabase }));
  vi.doMock('$lib/server/accessControl.js', () => ({
    getServerAccessContext: vi.fn(async () => accessContext),
  }));
  return import('../src/routes/api/integrations/ifood/orders/sync-state/+server.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('createIfoodSyncStateService', () => {
  it('deduplicates UUIDs, allows pedidos.cozinha, and maps a command row', async () => {
    const repository = {
      getOrderSyncState: vi.fn(async () => [{
        zeloOrderId: ORDER_ID,
        externalStatus: 'CONFIRMED',
        lastEventAt: '2026-09-16T12:00:00.000Z',
        connectionStatus: 'active',
        commandIntent: 'confirm',
        commandStatus: 'accepted_http',
        commandUpdatedAt: '2026-09-16T12:01:00.000Z',
        commandErrorCode: null,
      }]),
    };
    const service = createIfoodSyncStateService({
      repository,
      accessResolver: async () => baseAccessContext({
        isSubUser: true,
        permissions: { 'pedidos.cozinha': true },
      }),
    });

    const result = await service.getOrderSyncState({
      authResult: { user: { id: 'sub-user-1' } },
      empresaId: EMPRESA_ID,
      orderIds: [ORDER_ID, ORDER_ID],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        orders: {
          [ORDER_ID]: {
            externalStatus: 'CONFIRMED',
            lastEventAt: '2026-09-16T12:00:00.000Z',
            connectionStatus: 'active',
            command: {
              intent: 'confirm',
              status: 'accepted_http',
              updatedAt: '2026-09-16T12:01:00.000Z',
              errorCode: null,
            },
          },
        },
      },
    });
    expect(repository.getOrderSyncState).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      orderIds: [ORDER_ID],
      signal: undefined,
    });
  });

  it('rejects missing, malformed, and over-limit ids before repository work', async () => {
    const repository = { getOrderSyncState: vi.fn() };
    const service = createIfoodSyncStateService({
      repository,
      accessResolver: async () => baseAccessContext(),
    });

    await expect(service.getOrderSyncState({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderIds: [],
    })).resolves.toEqual({ status: 400, body: { error: 'invalid_request' } });
    await expect(service.getOrderSyncState({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderIds: ['not-a-uuid'],
    })).resolves.toEqual({ status: 400, body: { error: 'invalid_request' } });
    await expect(service.getOrderSyncState({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderIds: MANY_ORDER_IDS,
    })).resolves.toEqual({ status: 400, body: { error: 'invalid_request' } });
    expect(repository.getOrderSyncState).not.toHaveBeenCalled();
  });

  it('returns 401, 403, and a generic 500 without exposing repository errors', async () => {
    const repository = { getOrderSyncState: vi.fn(async () => { throw new Error('raw database detail'); }) };
    const service = createIfoodSyncStateService({
      repository,
      accessResolver: async (userId) => userId === 'sub-user-1'
        ? baseAccessContext({ isSubUser: true, permissions: {} })
        : baseAccessContext(),
    });

    await expect(service.getOrderSyncState({
      authResult: null,
      empresaId: EMPRESA_ID,
      orderIds: [ORDER_ID],
    })).resolves.toEqual({ status: 401, body: { error: 'unauthorized' } });
    await expect(service.getOrderSyncState({
      authResult: { user: { id: 'sub-user-1' } },
      empresaId: EMPRESA_ID,
      orderIds: [ORDER_ID],
    })).resolves.toEqual({ status: 403, body: { error: 'forbidden' } });
    const result = await service.getOrderSyncState({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderIds: [ORDER_ID],
    });
    expect(result).toEqual({ status: 500, body: { error: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
  });
});

describe('GET /api/integrations/ifood/orders/sync-state', () => {
  it('returns 401 for a missing or invalid bearer token', async () => {
    const supabase = makeSupabase({ authError: { code: 'AUTH_FAILED' } });
    const route = await loadRoute({ supabase });

    const missing = await route.GET({ request: makeRequest({ token: null }) });
    const invalid = await route.GET({ request: makeRequest({ token: 'invalid-token' }) });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for missing, non-UUID, and more than 100 ids before authentication', async () => {
    const supabase = makeSupabase();
    const route = await loadRoute({ supabase });

    const missing = await route.GET({ request: makeRequest({ ids: null }) });
    const malformed = await route.GET({ request: makeRequest({ ids: ['not-a-uuid'] }) });
    const tooMany = await route.GET({ request: makeRequest({ ids: MANY_ORDER_IDS }) });

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 403 to a sub-user without pedidos.acessar or pedidos.cozinha', async () => {
    const supabase = makeSupabase();
    const route = await loadRoute({
      supabase,
      accessContext: baseAccessContext({ isSubUser: true, permissions: {} }),
    });

    const response = await route.GET({ request: makeRequest() });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('allows pedidos.cozinha only, resolves the tenant server-side, and omits cross-company ids', async () => {
    const ownerRow = {
      zelo_order_id: ORDER_ID,
      external_status: 'CONFIRMED',
      last_event_at: '2026-09-16T12:00:00.000Z',
      connection_status: 'active',
      command_intent: 'confirm',
      command_status: 'accepted_http',
      command_updated_at: '2026-09-16T12:01:00.000Z',
      command_error_code: null,
    };
    const noCommandRow = {
      zelo_order_id: NO_COMMAND_ORDER_ID,
      external_status: 'PLACED',
      last_event_at: '2026-09-16T12:02:00.000Z',
      connection_status: 'active',
      command_intent: null,
      command_status: null,
      command_updated_at: null,
      command_error_code: null,
    };
    const supabase = makeSupabase({ rows: [ownerRow, noCommandRow] });
    const route = await loadRoute({
      supabase,
      accessContext: baseAccessContext({
        isSubUser: true,
        permissions: { 'pedidos.cozinha': true },
      }),
    });

    const response = await route.GET({
      request: makeRequest({
        ids: [ORDER_ID, ORDER_ID, OTHER_ORDER_ID, NO_COMMAND_ORDER_ID],
        extraQuery: `&empresaId=${encodeURIComponent('forged-company')}`,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      orders: {
        [ORDER_ID]: {
          externalStatus: 'CONFIRMED',
          lastEventAt: '2026-09-16T12:00:00.000Z',
          connectionStatus: 'active',
          command: {
            intent: 'confirm',
            status: 'accepted_http',
            updatedAt: '2026-09-16T12:01:00.000Z',
            errorCode: null,
          },
        },
        [NO_COMMAND_ORDER_ID]: {
          externalStatus: 'PLACED',
          lastEventAt: '2026-09-16T12:02:00.000Z',
          connectionStatus: 'active',
          command: null,
        },
      },
    });
    expect(supabase.rpc).toHaveBeenCalledWith('get_ifood_order_sync_state_v1', {
      p_empresa_id: EMPRESA_ID,
      p_order_ids: [ORDER_ID, OTHER_ORDER_ID, NO_COMMAND_ORDER_ID],
    });
    expect(supabase.from).toHaveBeenCalledWith('empresa_perfil');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 503 when supabaseAdmin is unavailable', async () => {
    const route = await loadRoute({ supabase: null });
    const response = await route.GET({ request: makeRequest() });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a generic 500 for repository failures and never forwards raw text', async () => {
    const supabase = makeSupabase({ rpcError: { message: 'raw provider or database detail' } });
    const route = await loadRoute({ supabase });
    const response = await route.GET({ request: makeRequest() });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain('raw provider or database detail');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
