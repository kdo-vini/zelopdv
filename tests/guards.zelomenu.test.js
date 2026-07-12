import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db = {};

function makeQuery(table) {
  const state = { filters: [] };
  const query = {
    eq(field, value) {
      state.filters.push({ field, value });
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      const rows = Array.isArray(db[table]) ? db[table] : [db[table]].filter(Boolean);
      const data = rows.find((row) =>
        state.filters.every(({ field, value }) => row?.[field] === value),
      );
      return { data: data || null, error: null };
    },
  };
  return query;
}

vi.mock('../src/lib/supabaseClient.js', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn((table) => ({
      select: () => makeQuery(table),
    })),
  },
  hasSupabaseConfig: true,
}));

beforeEach(() => {
  db = { access_users: [], subscriptions: [] };
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('hasZeloMenuAccess', () => {
  it('allows a PDV owner only when the ZeloMenu entitlement is active', async () => {
    db.subscriptions = [
      { user_id: 'owner-1', plan_tier: 'pdv', has_zelo_menu: true },
      { user_id: 'owner-2', plan_tier: 'pdv', has_zelo_menu: false },
    ];

    const { hasZeloMenuAccess } = await import('../src/lib/guards.js');

    await expect(hasZeloMenuAccess('owner-1')).resolves.toBe(true);
    await expect(hasZeloMenuAccess('owner-2')).resolves.toBe(false);
  });

  it('inherits the owner entitlement for an active sub-user', async () => {
    db.access_users = [
      { auth_user_id: 'sub-1', owner_user_id: 'owner-1', status: 'active' },
    ];
    db.subscriptions = [
      { user_id: 'owner-1', plan_tier: 'pdv', has_zelo_menu: true },
    ];

    const { hasZeloMenuAccess } = await import('../src/lib/guards.js');

    await expect(hasZeloMenuAccess('sub-1')).resolves.toBe(true);
  });

  it('allows plans that include ZeloMenu by product policy', async () => {
    db.subscriptions = [
      { user_id: 'chat-1', plan_tier: 'chat', has_zelo_menu: false },
      { user_id: 'bundle-1', plan_tier: 'bundle', has_zelo_menu: false },
    ];

    const { hasZeloMenuAccess } = await import('../src/lib/guards.js');

    await expect(hasZeloMenuAccess('chat-1')).resolves.toBe(true);
    await expect(hasZeloMenuAccess('bundle-1')).resolves.toBe(true);
  });
});

describe('hasPedidosAddon', () => {
  it('treats ZeloMenu as the current Pedidos + Cozinha entitlement', async () => {
    db.subscriptions = [
      { user_id: 'menu-owner', plan_tier: 'pdv', has_zelo_menu: true, has_pedidos_addon: false },
      { user_id: 'legacy-owner', plan_tier: 'pdv', has_zelo_menu: false, has_pedidos_addon: true },
    ];

    const { hasPedidosAddon } = await import('../src/lib/guards.js');

    await expect(hasPedidosAddon('menu-owner')).resolves.toBe(true);
    await expect(hasPedidosAddon('legacy-owner')).resolves.toBe(true);
  });
});
