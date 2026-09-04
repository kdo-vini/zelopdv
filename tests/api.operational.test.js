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
    rpc(name, args) {
      state.rpcCalls ||= [];
      state.rpcCalls.push({ name, args });
      state.events?.push(`rpc:${name}`);
      const configured = state.rpcResults?.[name];
      if (Array.isArray(configured)) {
        return Promise.resolve(configured.shift() || { data: null, error: null });
      }
      return Promise.resolve(configured || { data: null, error: null });
    },
    from(table) {
      const query = {
        table,
        operation: 'select',
        payload: null,
        filters: [],
        select() { return query; },
        eq(column, value) { query.filters.push({ method: 'eq', column, value }); return query; },
        is(column, value) { query.filters.push({ method: 'is', column, value }); return query; },
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
        maybeSingle() {
          const sequence = state.maybeSingleSequence?.[table];
          if (sequence?.length) return Promise.resolve(sequence.shift());
          return Promise.resolve(
            state.maybeSingleByOperation?.[table]?.[query.operation]
              || state.maybeSingle?.[table]
              || { data: null, error: null },
          );
        },
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

describe('admin subscription edits', () => {
  it('persists the Acessos add-on and ends manual extensions when canceling', async () => {
    const state = {
      user: { id: 'admin-user' }, queries: [], results: {},
      maybeSingle: {
        super_admins: { data: { id: 'admin-1', is_active: true }, error: null },
        subscriptions: { data: { id: 'sub-current', user_id: 'owner-1', current_period_end: '2099-01-01' }, error: null },
      },
    };
    const { POST } = await loadModule('../src/routes/api/admin/billing/update-user-subscription/+server.js', state);
    const response = await POST({ request: makeRequest({ body: {
      userId: 'owner-1', subscription: { status: 'canceled', has_acessos_addon: false },
    } }) });
    expect(response.status).toBe(200);
    expect(state.queries.find((q) => q.table === 'subscriptions' && q.operation === 'update').payload)
      .toMatchObject({ has_acessos_addon: false, manually_extended_until: null, cancel_at_period_end: false });
    expect(state.queries.find((q) => q.table === 'subscriptions' && q.operation === 'update').filters)
      .toContainEqual({ method: 'eq', column: 'id', value: 'sub-current' });
  });
  it('does not report an expired reactivation as success or change the profile before validation', async () => {
    const state = { user: { id: 'admin-user' }, queries: [], results: {}, maybeSingle: {
      super_admins: { data: { id: 'admin-1', is_active: true }, error: null },
      subscriptions: { data: { id: 'old-sub', status: 'canceled', current_period_end: '2020-01-01', manually_extended_until: null }, error: null },
    } };
    const { POST } = await loadModule('../src/routes/api/admin/billing/update-user-subscription/+server.js', state);
    const response = await POST({ request: makeRequest({ body: { userId: 'owner-1', subscriptionId: 'old-sub',
      profile: { nome_exibicao: 'Loja' }, subscription: { status: 'active' },
    } }) });
    expect(response.status).toBe(409);
    expect(state.queries.some((q) => q.operation === 'update')).toBe(false);
  });
  it('rejects a selected subscription outside the requested owner', async () => {
    const state = { user: { id: 'admin-user' }, queries: [], results: {}, maybeSingle: {
      super_admins: { data: { id: 'admin-1', is_active: true }, error: null },
      subscriptions: { data: null, error: null },
    } };
    const { POST } = await loadModule('../src/routes/api/admin/billing/update-user-subscription/+server.js', state);
    const response = await POST({ request: makeRequest({ body: { userId: 'owner-1', subscriptionId: 'other-owner-sub', subscription: { status: 'active' } } }) });
    expect(response.status).toBe(404);
    expect(state.queries.find((q) => q.table === 'subscriptions').filters).toEqual(expect.arrayContaining([
      { method: 'eq', column: 'user_id', value: 'owner-1' }, { method: 'eq', column: 'id', value: 'other-owner-sub' },
    ]));
  });
  it('blocks expired reactivation from the status endpoint too', async () => {
    const state = { user: { id: 'admin-user' }, queries: [], results: {}, maybeSingle: {
      super_admins: { data: { id: 'admin-1', is_active: true }, error: null },
      subscriptions: { data: { id: 'expired', status: 'canceled', current_period_end: '2020-01-01' }, error: null },
    } };
    const { POST } = await loadModule('../src/routes/api/admin/billing/update-status/+server.js', state);
    const response = await POST({ request: makeRequest({ body: { subscriptionId: 'expired', status: 'active' } }) });
    expect(response.status).toBe(409);
    expect(state.queries.some((q) => q.operation === 'update')).toBe(false);
  });
});

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
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234', pin_enabled: true }, error: null } },
      results: {},
    };
    const { GET } = await loadAdminPin(state);
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: true, enabled: true, canSet: true });
  });

  it('returns a disabled PIN without exposing the stored value', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: null, pin_enabled: false }, error: null } },
      results: {},
    };
    const { GET } = await loadAdminPin(state);
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: false, enabled: false, canSet: true });
  });

  it('verifies the PIN server-side and rejects incorrect values', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234', pin_enabled: true }, error: null } },
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
    const response = await ownerPost({ request: makeRequest({ body: { action: 'set', pin: '5678' } }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, configured: true, enabled: true });
    const update = ownerState.queries.find((query) => query.table === 'empresa_perfil' && query.operation === 'update');
    expect(update.payload).toEqual({ pin_admin: '5678', pin_enabled: true });

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

  it('disables the PIN only after verifying the current owner PIN', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234', pin_enabled: true }, error: null } },
      maybeSingleByOperation: { empresa_perfil: { update: { data: { user_id: 'owner-1' }, error: null } } },
      results: {},
    };
    const { POST } = await loadAdminPin(state);

    const wrong = await POST({ request: makeRequest({ body: { action: 'disable', currentPin: '9999' } }) });
    expect(wrong.status).toBe(401);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);

    const response = await POST({ request: makeRequest({ body: { action: 'disable', currentPin: '1234' } }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, configured: false, enabled: false });
    const update = state.queries.find((query) => query.table === 'empresa_perfil' && query.operation === 'update');
    expect(update.payload).toEqual({ pin_admin: null, pin_enabled: false });
  });

  it('allows the owner to skip setup without creating a default PIN', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: null, pin_enabled: true }, error: null } },
      maybeSingleByOperation: { empresa_perfil: { update: { data: { user_id: 'owner-1' }, error: null } } },
      results: {},
    };
    const { POST } = await loadAdminPin(state);
    const response = await POST({ request: makeRequest({ body: { action: 'disable' } }) });

    expect(response.status).toBe(200);
    const update = state.queries.find((query) => query.table === 'empresa_perfil' && query.operation === 'update');
    expect(update.payload).toEqual({ pin_admin: null, pin_enabled: false });
  });

  it('does not allow a sub-user to disable the company PIN', async () => {
    const state = {
      user: { id: 'sub-1' },
      queries: [],
      maybeSingle: { empresa_perfil: { data: { pin_admin: '1234', pin_enabled: true }, error: null } },
      results: {},
    };
    const { POST } = await loadAdminPin(state, { isSubUser: true, ownerUserId: 'owner-1' });
    const response = await POST({ request: makeRequest({ body: { action: 'disable', currentPin: '1234' } }) });

    expect(response.status).toBe(403);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
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

  it('returns an existing schedule idempotently and reactivates it through the fenced RPCs', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
        complete_account_deletion_reactivation: { data: true, error: null },
      },
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
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      'begin_account_deletion_reactivation',
      'complete_account_deletion_reactivation',
    ]);
    expect(state.queries.filter((query) => query.operation === 'update')).toHaveLength(0);
  });

  it('keeps the local deletion schedule when Stripe resume fails', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
      },
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
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
    expect(state.queries.filter((query) => query.operation === 'update')).toHaveLength(0);
  });

  it('refuses to reschedule deletion after the purge has been claimed', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: '2099-01-01T00:00:00Z',
            deletion_purge_token: 'claim-1',
            deletion_reactivation_token: null,
          },
          error: null,
        },
        subscriptions: {
          data: { provider_subscription_id: 'sub-stripe-1', payment_provider: 'stripe' },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(409);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('does not mistake a profile lookup failure for a non-owner during scheduling', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: { data: null, error: { message: 'database unavailable' } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(500);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('returns a conflict when the purge claims the account while deletion is being scheduled', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_purge_token: null },
          error: null,
        },
        subscriptions: { data: null, error: null },
      },
      maybeSingleByOperation: {
        empresa_perfil: { update: { data: null, error: null } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(409);
    const update = state.queries.find((query) => query.operation === 'update');
    expect(update.filters).toContainEqual({
      method: 'is',
      column: 'deletion_purge_token',
      value: null,
    });
    expect(update.filters).toContainEqual({
      method: 'is',
      column: 'deletion_scheduled_at',
      value: null,
    });
  });

  it('accepts a concurrent deletion schedule as an idempotent success after the CAS loses', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingleSequence: {
        empresa_perfil: [
          {
            data: {
              id: 'profile-1',
              deletion_scheduled_at: null,
              deletion_purge_token: null,
              deletion_reactivation_token: null,
            },
            error: null,
          },
          { data: null, error: null },
          { data: { deletion_scheduled_at: '2099-01-01T00:00:00Z' }, error: null },
        ],
      },
      maybeSingle: {
        subscriptions: { data: null, error: null },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      scheduledAt: '2099-01-01T00:00:00Z',
      alreadyScheduled: true,
    });
  });

  it('refuses to reactivate an account after the purge has been claimed', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: {
          data: null,
          error: { code: 'PURGE_IN_PROGRESS', message: 'purge in progress' },
        },
      },
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(409);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('returns a server error when the profile lookup fails during reactivation', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: { data: null, error: { message: 'database unavailable' } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(500);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('returns a conflict before Stripe when another reactivation owns the fence', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: {
          data: null,
          error: { code: 'REACTIVATION_IN_PROGRESS', message: 'reactivation in progress' },
        },
      },
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(409);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
  });

  it('treats an existing deletion schedule as an idempotent success without touching Stripe', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: '2099-01-01T00:00:00Z',
            deletion_purge_token: null,
            deletion_reactivation_token: null,
          },
          error: null,
        },
        subscriptions: {
          data: { provider_subscription_id: 'sub-stripe-1', payment_provider: 'stripe' },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    expect((await response.json()).scheduledAt).toBe('2099-01-01T00:00:00Z');
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.queries.some((query) => query.table === 'subscriptions')).toBe(false);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('fails closed when the subscription lookup fails before scheduling deletion', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: null,
            deletion_purge_token: null,
            deletion_reactivation_token: null,
          },
          error: null,
        },
        subscriptions: { data: null, error: { message: 'database unavailable' } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(500);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('does not schedule a Stripe deletion when the Stripe client is unavailable', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: null,
            deletion_purge_token: null,
            deletion_reactivation_token: null,
          },
          error: null,
        },
        subscriptions: {
          data: { provider_subscription_id: 'sub-stripe-1', payment_provider: 'stripe' },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(503);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('schedules only while purge and reactivation fences are both absent', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      maybeSingle: {
        empresa_perfil: {
          data: {
            id: 'profile-1',
            deletion_scheduled_at: null,
            deletion_purge_token: null,
            deletion_reactivation_token: null,
          },
          error: null,
        },
        subscriptions: { data: null, error: null },
      },
      maybeSingleByOperation: {
        empresa_perfil: { update: { data: { id: 'profile-1' }, error: null } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/delete/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    const update = state.queries.find((query) => query.operation === 'update');
    expect(update.filters).toContainEqual({
      method: 'is',
      column: 'deletion_reactivation_token',
      value: null,
    });
  });

  it('fails closed when the subscription lookup fails before reactivation begins', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
          error: null,
        },
        subscriptions: { data: null, error: { message: 'database unavailable' } },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(500);
    expect(state.rpcCalls).toHaveLength(0);
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it('begins reactivation before Stripe and completes it only after Stripe succeeds', async () => {
    const events = [];
    const stripeUpdate = vi.fn(async () => { events.push('stripe:update'); });
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      events,
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
        complete_account_deletion_reactivation: { data: true, error: null },
      },
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    expect(events).toEqual([
      'rpc:begin_account_deletion_reactivation',
      'stripe:update',
      'rpc:complete_account_deletion_reactivation',
    ]);
    expect(state.rpcCalls).toEqual([
      {
        name: 'begin_account_deletion_reactivation',
        args: { p_empresa_id: 'profile-1', p_user_id: 'owner-1' },
      },
      {
        name: 'complete_account_deletion_reactivation',
        args: {
          p_empresa_id: 'profile-1',
          p_user_id: 'owner-1',
          p_reactivation_token: 'reactivation-1',
        },
      },
    ]);
    expect(state.queries.some((query) => query.operation === 'update')).toBe(false);
  });

  it('treats a null begin token as an idempotent success when the schedule was already cleared', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: null, error: null },
      },
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, alreadyActive: true });
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
  });

  it('fails closed before Stripe when the begin RPC has an unexpected error', async () => {
    const stripeUpdate = vi.fn(async () => ({}));
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: {
          data: null,
          error: { code: 'XX000', message: 'database unavailable' },
        },
      },
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(500);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
  });

  it('keeps the reactivation fence after an ambiguous Stripe failure', async () => {
    const stripeUpdate = vi.fn(async () => { throw new Error('connection reset'); });
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
      },
      maybeSingle: {
        empresa_perfil: {
          data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
          error: null,
        },
        subscriptions: {
          data: {
            provider_subscription_id: 'sub-stripe-1',
            payment_provider: 'stripe',
            status: 'active',
          },
          error: null,
        },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state, {
      stripe: { subscriptions: { update: stripeUpdate } },
    });

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(502);
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['begin_account_deletion_reactivation']);
  });

  it('accepts an idempotent completion when another request already cleared the schedule', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
        complete_account_deletion_reactivation: { data: false, error: null },
      },
      maybeSingleSequence: {
        empresa_perfil: [
          {
            data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
            error: null,
          },
          { data: { deletion_scheduled_at: null }, error: null },
        ],
      },
      maybeSingle: {
        subscriptions: { data: null, error: null },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, alreadyActive: true });
  });

  it('returns a conflict when completion loses ownership and deletion is still scheduled', async () => {
    const state = {
      user: { id: 'owner-1' },
      queries: [],
      rpcCalls: [],
      rpcResults: {
        begin_account_deletion_reactivation: { data: 'reactivation-1', error: null },
        complete_account_deletion_reactivation: { data: false, error: null },
      },
      maybeSingleSequence: {
        empresa_perfil: [
          {
            data: { id: 'profile-1', deletion_scheduled_at: '2099-01-01T00:00:00Z' },
            error: null,
          },
          { data: { deletion_scheduled_at: '2099-01-01T00:00:00Z' }, error: null },
        ],
      },
      maybeSingle: {
        subscriptions: { data: null, error: null },
      },
      results: {},
    };
    const { POST } = await loadAccount('../src/routes/api/account/reactivate/+server.js', state);

    const response = await POST({ request: makeRequest() });

    expect(response.status).toBe(409);
  });
});
