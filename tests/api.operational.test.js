import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest({ token = 'token-1', body = {}, origin = null } = {}) {
  return {
    headers: {
      get(name) {
        const key = name.toLowerCase();
        if (key === 'authorization') return token ? `Bearer ${token}` : null;
        if (key === 'origin') return origin;
        return null;
      },
    },
    json: vi.fn(async () => body),
  };
}

function makeSupabase(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user || null }, error: state.authError || null })),
      admin: {
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
    from(table) {
      const query = {
        table,
        operation: 'select',
        payload: null,
        select() { return query; },
        eq() { return query; },
        neq() { return query; },
        in() { return query; },
        or() { return query; },
        ilike() { return query; },
        gte() { return query; },
        lte() { return query; },
        order() { return query; },
        limit() { return query; },
        insert(payload) { query.operation = 'insert'; query.payload = payload; return query; },
        update(payload) { query.operation = 'update'; query.payload = payload; return query; },
        delete() { query.operation = 'delete'; return query; },
        maybeSingle() { return Promise.resolve(state.maybeSingle?.[table] || { data: null, error: null }); },
        single() {
          return Promise.resolve(state.single?.[table] || state.maybeSingle?.[table] || { data: null, error: null });
        },
        then(resolve, reject) {
          const result = state.results?.[table]?.[query.operation]
            || state.results?.[table]?.select
            || { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      state.queries.push(query);
      return query;
    },
  };
}

async function loadModule(path, state, extraMocks = {}) {
  vi.resetModules();
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabase(state) }));
  for (const [name, factory] of Object.entries(extraMocks)) vi.doMock(name, factory);
  return import(path);
}

function activeSubscription() {
  return {
    data: {
      has_acessos_addon: true,
      has_mesas_addon: true,
      has_zelo_menu: true,
      plan_tier: 'pdv',
      status: 'active',
      current_period_end: '2099-12-31T00:00:00.000Z',
      manually_extended_until: null,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('operational products API', () => {
  it('rejects missing bearer tokens and disallowed origins', async () => {
    const state = { user: { id: 'owner-1' }, queries: [], results: {} };
    const { GET, OPTIONS } = await loadModule('../src/routes/api/produtos/+server.js', state);

    expect((await GET({ request: makeRequest({ token: null }), url: new URL('https://app.test/api/produtos') })).status).toBe(401);
    expect(OPTIONS({ request: makeRequest({ origin: 'https://evil.example' }) }).status).toBe(403);
  });

  it('returns only owner products and forwards the visibility filter', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      results: { produtos: { select: { data: [{ id: 1, nome: 'Café' }], error: null } } },
    };
    const { GET } = await loadModule('../src/routes/api/produtos/+server.js', state);
    const response = await GET({ request: makeRequest(), url: new URL('https://app.test/api/produtos?onlyVisible=true') });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: 1, nome: 'Café' }] });
    expect(state.queries[0].table).toBe('produtos');
  });

  it('does not expose raw database errors', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      results: { produtos: { select: { data: null, error: { message: 'secret relation detail' } } } },
    };
    const { GET } = await loadModule('../src/routes/api/produtos/+server.js', state);
    const response = await GET({ request: makeRequest(), url: new URL('https://app.test/api/produtos') });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Erro ao carregar produtos.' });
  });
});

describe('admin PIN API', () => {
  function loadAdminPin(state, context = { isSubUser: false, ownerUserId: state.user?.id }) {
    return loadModule('../src/routes/api/auth/admin-pin/+server.js', state, {
      '$lib/server/accessControl': () => ({ getServerAccessContext: vi.fn(async () => context) }),
    });
  }

  it('returns PIN status without exposing the stored PIN', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234' }, error: null } },
      results: {},
    };
    const { GET } = await loadAdminPin(state);
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: true, canSet: true });
  });

  it('verifies the PIN server-side and rejects incorrect values', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234' }, error: null } },
      results: {},
    };
    const { POST } = await loadAdminPin(state);
    expect((await POST({ request: makeRequest({ body: { action: 'verify', pin: '1234' } }) })).status).toBe(200);
    const wrong = await POST({ request: makeRequest({ body: { action: 'verify', pin: '9999' } }) });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'PIN incorreto.' });
  });

  it('allows only the owner to set the company PIN', async () => {
    const ownerState = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { user_id: 'owner-1' }, error: null } },
      results: {},
    };
    const { POST: ownerPost } = await loadAdminPin(ownerState);
    expect((await ownerPost({ request: makeRequest({ body: { action: 'set', pin: '5678' } }) })).status).toBe(200);
    const update = ownerState.queries.find((query) => query.table === 'empresa_perfil' && query.operation === 'update');
    expect(update.payload).toEqual({ pin_admin: '5678' });

    const subState = {
      user: { id: 'sub-1' },
      queries: [],
      maybeSingle: {},
      results: {},
    };
    const { POST: subPost } = await loadAdminPin(subState, { isSubUser: true, ownerUserId: 'owner-1' });
    expect((await subPost({ request: makeRequest({ body: { action: 'set', pin: '5678' } }) })).status).toBe(403);
    expect(subState.queries.some((query) => query.operation === 'update')).toBe(false);
  });
});

describe('access roles API', () => {
  function loadRoles(state) {
    return loadModule('../src/routes/api/access/roles/+server.js', state, {
      '$lib/server/accessControl': () => ({ logServerAuditAction: vi.fn() }),
      '$lib/subscriptionStatus': () => ({ isSubscriptionActiveStrict: vi.fn(() => state.subscriptionActive !== false) }),
    });
  }

  it('requires authentication and an active add-on', async () => {
    const unauthenticated = { user: null, queries: [], maybeSingle: { subscriptions: activeSubscription() }, results: {} };
    const { GET: getUnauth } = await loadRoles(unauthenticated);
    expect((await getUnauth({ request: makeRequest({ token: null }) })).status).toBe(401);

    const inactive = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { subscriptions: { data: { ...activeSubscription().data, has_acessos_addon: false }, error: null } },
      results: {},
    };
    const { GET } = await loadRoles(inactive);
    expect((await GET({ request: makeRequest() })).status).toBe(403);
  });

  it('lists roles scoped to the authenticated owner', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { subscriptions: activeSubscription() },
      results: { access_roles: { select: { data: [{ id: 'role-1', name: 'Caixa' }], error: null } } },
    };
    const { GET } = await loadRoles(state);
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roles: [{ id: 'role-1', name: 'Caixa' }] });
    expect(state.queries.find((query) => query.table === 'access_roles')).toBeTruthy();
  });

  it('validates role names and creates a role with an auditable payload', async () => {
    const audit = vi.fn();
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { subscriptions: activeSubscription() },
      single: { access_roles: { data: { id: 'role-new', name: 'Caixa Noite', permissions: {} }, error: null } },
      results: {},
    };
    const { POST } = await loadModule('../src/routes/api/access/roles/+server.js', state, {
      '$lib/server/accessControl': () => ({ logServerAuditAction: audit }),
      '$lib/subscriptionStatus': () => ({ isSubscriptionActiveStrict: () => true }),
    });

    expect((await POST({ request: makeRequest({ body: { name: ' ' } }) })).status).toBe(400);
    const response = await POST({ request: makeRequest({ body: { name: 'Caixa Noite', permissions: { 'pdv.acessar': true } } }) });
    expect(response.status).toBe(201);
    const insert = state.queries.find((query) => query.table === 'access_roles' && query.operation === 'insert');
    expect(insert.payload).toMatchObject({ owner_user_id: 'owner-1', name: 'Caixa Noite' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.role_created' }));
  });
});

describe('access activation API', () => {
  function loadActivation(state) {
    return loadModule('../src/routes/api/access/activate/+server.js', state, {
      '$lib/server/accessControl': () => ({ logServerAuditAction: vi.fn() }),
    });
  }

  it('is a safe no-op for an ordinary owner', async () => {
    const state = { user: { id: 'owner-1', email: 'owner@example.com', user_metadata: {} }, queries: [], maybeSingle: {}, results: {} };
    const { POST } = await loadActivation(state);
    const response = await POST({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activated: false, reason: 'not_invited' });
  });

  it('blocks removed invitations and activates pending rows idempotently', async () => {
    const removed = {
      user: { id: 'sub-1', email: 'sub@test.com', user_metadata: { owner_user_id: 'owner-1' } },
      queries: [],
      maybeSingle: { access_users: { data: { id: 'invite-1', status: 'removed', role_id: 'role-1', auth_user_id: null }, error: null } },
      results: {},
    };
    const { POST: blocked } = await loadActivation(removed);
    expect((await blocked({ request: makeRequest() })).status).toBe(403);

    const active = {
      user: { id: 'sub-1', email: 'sub@test.com', user_metadata: { owner_user_id: 'owner-1' } },
      queries: [],
      maybeSingle: { access_users: { data: { id: 'invite-1', status: 'active', role_id: 'role-1', auth_user_id: 'sub-1' }, error: null } },
      results: {},
    };
    const { POST } = await loadActivation(active);
    const response = await POST({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activated: true, alreadyActive: true });
  });
});

describe('account lifecycle APIs', () => {
  function loadAccount(path, state, stripeMock = { stripe: null }) {
    return loadModule(path, state, {
      '$lib/server/stripe': () => stripeMock,
    });
  }

  it('rejects deletion without authentication and subuser deletion', async () => {
    const state = { user: null, queries: [], maybeSingle: {}, results: {} };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);
    expect((await POST({ request: makeRequest({ token: null }) })).status).toBe(401);

    const subuserState = {
      user: { id: 'sub-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: null, error: null } },
      results: {},
    };
    const { POST: subuserDelete } = await loadAccount('../src/routes/api/account/delete/+server.js', subuserState);
    expect((await subuserDelete({ request: makeRequest() })).status).toBe(403);
  });

  it('schedules deletion for the owner and clears it on reactivation', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: { data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' }, error: null },
        subscriptions: { data: { provider_subscription_id: null, payment_provider: null }, error: null },
      },
      results: {},
    };
    const { POST: deleteAccount } = await loadAccount('../src/routes/api/account/delete/+server.js', state);
    const scheduled = await deleteAccount({ request: makeRequest() });
    expect(scheduled.status).toBe(200);
    expect((await scheduled.json()).graceDays).toBe(14);

    const { POST: reactivate } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state);
    const response = await reactivate({ request: makeRequest() });
    expect(response.status).toBe(200);
    const updates = state.queries.filter((query) => query.operation === 'update');
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the local deletion schedule when Stripe resume fails', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: { data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' }, error: null },
        subscriptions: { data: { provider_subscription_id: 'sub-stripe-1', payment_provider: 'stripe', status: 'active' }, error: null },
      },
      results: {},
    };
    const stripeUpdate = vi.fn(async () => { throw new Error('Stripe unavailable'); });
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Não foi possível reativar a assinatura agora. Tente novamente.',
    });
    expect(stripeUpdate).toHaveBeenCalledWith('sub-stripe-1', { cancel_at_period_end: false });
    expect(state.queries.filter((query) => query.operation === 'update')).toHaveLength(0);
  });
});
