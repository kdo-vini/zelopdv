import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/mesas/cozinha/+server.js');
const COMANDA_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';

function makeQuery(state, table) {
  const query = {
    table,
    filters: [],
    select: vi.fn(() => query),
    eq: vi.fn((field, value) => {
      query.filters.push({ field, value });
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    async maybeSingle() {
      state.queries.push({ table, filters: [...query.filters] });
      return { data: state.rows[table] ?? null, error: state.queryErrors[table] ?? null };
    },
  };
  return query;
}

function makeSupabaseAdmin(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user },
        error: state.authError ?? null,
      })),
    },
    from: vi.fn((table) => makeQuery(state, table)),
    rpc: vi.fn(async (name, args) => {
      state.rpcCalls.push({ name, args });
      return { data: state.rpcData ?? { orderId: 'order-1', alreadyConfirmed: false }, error: state.rpcError ?? null };
    }),
  };
}

function makeRequest({ token = 'token-1', body = {} } = {}) {
  return {
    headers: {
      get: (name) => name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null,
    },
    json: vi.fn(async () => body),
  };
}

function baseState(overrides = {}) {
  return {
    user: { id: 'sub-1' },
    rows: {
      subscriptions: {
        plan_tier: 'pdv',
        has_zelo_menu: true,
        has_mesas_addon: true,
        status: 'active',
        current_period_end: '2099-01-01T00:00:00.000Z',
        manually_extended_until: null,
      },
      comandas: { id: COMANDA_ID, id_mesa: 'mesa-1', status: 'aberta' },
      mesas: { id: 'mesa-1', numero: 7, ativa: true },
      comanda_itens: {
        id: ITEM_ID,
        id_comanda: COMANDA_ID,
        id_produto: 42,
        quantidade: 2,
        preco_unitario: 12.5,
        observacao: 'sem cebola',
      },
      produtos: { id: 42, nome: 'X-Burger' },
      empresa_perfil: { id: 'empresa-1' },
    },
    queryErrors: {},
    queries: [],
    rpcCalls: [],
    ...overrides,
  };
}

async function loadWith(state) {
  vi.resetModules();
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
  vi.doMock('$lib/server/accessControl', () => ({
    getServerAccessContext: vi.fn(async () => state.accessContext ?? {
      isSubUser: true,
      ownerUserId: 'owner-1',
      permissions: { 'mesas.editar_itens': true, 'pedidos.cozinha': true },
    }),
  }));
  vi.doMock('$lib/subscriptionStatus', () => ({ isSubscriptionActiveStrict: vi.fn(() => true) }));
  return import('../src/routes/api/mesas/cozinha/+server.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('API: mesas/cozinha', () => {
  it('returns 401 without a bearer token', async () => {
    const state = baseState();
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ token: null }) });

    expect(response.status).toBe(401);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('returns 403 when the operator lacks kitchen permission', async () => {
    const state = baseState({
      accessContext: {
        isSubUser: true,
        ownerUserId: 'owner-1',
        permissions: { 'mesas.editar_itens': true, 'pedidos.cozinha': false },
      },
    });
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ body: { comandaId: COMANDA_ID, itemId: ITEM_ID } }) });

    expect(response.status).toBe(403);
    expect(state.queries).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('returns 403 when the owner lacks the Mesas addon even with ZeloMenu', async () => {
    const state = baseState({ rows: {
      ...baseState().rows,
      subscriptions: { ...baseState().rows.subscriptions, has_mesas_addon: false },
    } });
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ body: { comandaId: COMANDA_ID, itemId: ITEM_ID } }) });

    expect(response.status).toBe(403);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('materializes one owner-scoped comanda item with deterministic idempotency', async () => {
    const state = baseState();
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ body: { comandaId: COMANDA_ID, itemId: ITEM_ID } }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, source: 'mesa', orderId: 'order-1' });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: 'create_zelo_order',
      args: {
        p_session_id: null,
        p_idempotency_key: `mesa:${COMANDA_ID}:item:${ITEM_ID}`,
        p_snapshots: {
          empresaId: 'empresa-1',
          source: 'mesa',
          fulfillment: {
            type: 'mesa',
            mesaId: 'mesa-1',
            comandaId: COMANDA_ID,
            comandaItemId: ITEM_ID,
          },
          cart: {
            items: [{ productId: 42, productName: 'X-Burger', quantity: 2, unitPrice: 12.5, lineTotal: 25 }],
          },
        },
      },
    });

    for (const table of ['subscriptions', 'comandas', 'mesas', 'produtos', 'empresa_perfil']) {
      const query = state.queries.find((entry) => entry.table === table);
      expect(query, `missing query for ${table}`).toBeTruthy();
      expect(query.filters.some((filter) => (
        (filter.field === 'user_id' || filter.field === 'id_usuario') && filter.value === 'owner-1'
      ))).toBe(true);
    }
    expect(state.queries.find((entry) => entry.table === 'comandas').filters)
      .toContainEqual({ field: 'id', value: COMANDA_ID });
    expect(state.queries.find((entry) => entry.table === 'comanda_itens').filters)
      .toContainEqual({ field: 'id_comanda', value: COMANDA_ID });
  });

  it('rejects a closed comanda before touching item or order data', async () => {
    const state = baseState({ rows: { ...baseState().rows, comandas: { id: COMANDA_ID, id_mesa: 'mesa-1', status: 'fechada' } } });
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ body: { comandaId: COMANDA_ID, itemId: ITEM_ID } }) });

    expect(response.status).toBe(409);
    expect(state.queries.map((entry) => entry.table)).toEqual(['subscriptions', 'comandas']);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('does not leak the canonical RPC error detail to the browser', async () => {
    const state = baseState({ rpcError: { message: 'relation private_table does not exist' } });
    const { POST } = await loadWith(state);
    const response = await POST({ request: makeRequest({ body: { comandaId: COMANDA_ID, itemId: ITEM_ID } }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Não foi possível enviar o item à cozinha.');
    expect(body.error).not.toContain('private_table');
  });
});
