import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let db = {};

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every(({ field, value }) => row?.[field] === value));
}

function makeQuery(table, initialRows) {
  const rows = Array.isArray(initialRows)
    ? initialRows
    : initialRows == null
      ? []
      : [initialRows];
  const state = { filters: [] };

  const query = {
    eq(field, value) {
      state.filters.push({ field, value });
      return query;
    },
    in() { return query; },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      const filtered = applyFilters(rows, state.filters);
      return { data: filtered[0] ?? null, error: null };
    },
  };

  return query;
}

vi.mock('../src/lib/supabaseClient.js', () => {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: db.__session || null } })),
    },
    from: vi.fn((table) => ({
      select: () => makeQuery(table, db[table]),
    })),
  };

  return { supabase, hasSupabaseConfig: true };
});

const originalWindow = global.window;

beforeEach(() => {
  db = { __session: null };
  global.window = { location: { href: '' } };
});

afterEach(() => {
  global.window = originalWindow;
  vi.resetModules();
  vi.clearAllMocks();
});

describe('ensureActiveSubscription', () => {
  it('redirects to /login when no session', async () => {
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();

    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/login');
  });

  it('redirects owner to /perfil when profile is incomplete and requireProfile=true', async () => {
    db.__session = { user: { id: 'owner-1', email: 'owner@test.com' } };
    db.access_users = [];
    db.empresa_perfil = { user_id: 'owner-1', nome_exibicao: '', documento: '', contato: '', largura_bobina: '80mm' };
    db.subscriptions = { user_id: 'owner-1', status: 'active', current_period_end: '2099-01-01T00:00:00.000Z' };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription({ requireProfile: true });

    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/perfil');
  });

  it('returns owner access context when subscription is active and profile is ok', async () => {
    db.__session = { user: { id: 'owner-1', email: 'owner@test.com' } };
    db.access_users = [];
    db.empresa_perfil = { user_id: 'owner-1', nome_exibicao: 'Loja', documento: '52998224725', contato: '11999999999', largura_bobina: '80mm' };
    db.subscriptions = { user_id: 'owner-1', status: 'active', current_period_end: '2099-01-01T00:00:00.000Z' };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription({ requireProfile: true });

    expect(res).toEqual({
      userId: 'owner-1',
      email: 'owner@test.com',
      ownerUserId: 'owner-1',
      isSubUser: false,
      roleId: null,
      permissions: null,
      addons: { has_mesas_addon: false, has_acessos_addon: false, has_zelo_menu: false },
    });
    expect(global.window.location.href).toBe('');
  });

  it('returns sub-user context when owner subscription and add-on are active', async () => {
    db.__session = { user: { id: 'sub-1', email: 'caixa@test.com' } };
    db.access_users = [
      { auth_user_id: 'sub-1', owner_user_id: 'owner-1', role_id: 'role-caixa', status: 'active' },
    ];
    db.subscriptions = { user_id: 'owner-1', plan_tier: 'bundle', status: 'active', current_period_end: '2099-01-01T00:00:00.000Z', has_acessos_addon: true };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription({ requireProfile: true });

    expect(res).toEqual({
      userId: 'sub-1',
      email: 'caixa@test.com',
      ownerUserId: 'owner-1',
      isSubUser: true,
      roleId: 'role-caixa',
      permissions: {},
      addons: { has_mesas_addon: false, has_acessos_addon: true, has_zelo_menu: true },
    });
    expect(global.window.location.href).toBe('');
  });

  it('blocks sub-user when owner add-on is inactive', async () => {
    db.__session = { user: { id: 'sub-1', email: 'caixa@test.com' } };
    db.access_users = [
      { auth_user_id: 'sub-1', owner_user_id: 'owner-1', role_id: 'role-caixa', status: 'active' },
    ];
    db.subscriptions = { user_id: 'owner-1', status: 'active', current_period_end: '2099-01-01T00:00:00.000Z', has_acessos_addon: false };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();

    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/assinatura?msg=addon_required');
  });

  it('blocks sub-user when owner subscription is expired', async () => {
    db.__session = { user: { id: 'sub-1', email: 'caixa@test.com' } };
    db.access_users = [
      { auth_user_id: 'sub-1', owner_user_id: 'owner-1', role_id: 'role-caixa', status: 'active' },
    ];
    db.subscriptions = { user_id: 'owner-1', status: 'canceled', current_period_end: '2020-01-01T00:00:00.000Z', has_acessos_addon: true };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();

    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/assinatura?msg=addon_required');
  });
});
