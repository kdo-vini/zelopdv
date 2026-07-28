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

describe('hasKitchenQueueAccess', () => {
  it('does not grant the kitchen queue from the Mesas add-on alone', async () => {
    // Regressão do fallback D-100: a fila de preparo só é alimentada pelo motor
    // canônico zelo_orders (domínio ZeloMenu). Um cliente só-Mesas não tem
    // produtor de pedido, então precisa deixar de ver o item Cozinha.
    db.subscriptions = [
      { user_id: 'mesas-only', plan_tier: 'pdv', has_zelo_menu: false, has_mesas_addon: true },
    ];

    const { hasKitchenQueueAccess } = await import('../src/lib/guards.js');

    await expect(hasKitchenQueueAccess('mesas-only')).resolves.toBe(false);
  });

  it('allows a PDV owner only when the ZeloMenu entitlement is active', async () => {
    db.subscriptions = [
      { user_id: 'menu-1', plan_tier: 'pdv', has_zelo_menu: true, has_mesas_addon: false },
      { user_id: 'plain-1', plan_tier: 'pdv', has_zelo_menu: false, has_mesas_addon: false },
    ];

    const { hasKitchenQueueAccess } = await import('../src/lib/guards.js');

    await expect(hasKitchenQueueAccess('menu-1')).resolves.toBe(true);
    await expect(hasKitchenQueueAccess('plain-1')).resolves.toBe(false);
  });

  it('allows plans that include ZeloMenu by product policy', async () => {
    db.subscriptions = [
      { user_id: 'chat-1', plan_tier: 'chat', has_zelo_menu: false },
      { user_id: 'bundle-1', plan_tier: 'bundle', has_zelo_menu: false },
    ];

    const { hasKitchenQueueAccess } = await import('../src/lib/guards.js');

    await expect(hasKitchenQueueAccess('chat-1')).resolves.toBe(true);
    await expect(hasKitchenQueueAccess('bundle-1')).resolves.toBe(true);
  });

  it('matches hasOrderingReviewAccess for every plan/flag combination', async () => {
    // As duas capabilities são idênticas hoje de propósito (mesmo domínio
    // ZeloMenu). Este teste é o guarda-corpo: se uma divergir sem a outra,
    // quebra aqui em vez de virar bug de entitlement em produção.
    const combos = [];
    for (const plan_tier of ['pdv', 'chat', 'bundle', null]) {
      for (const has_zelo_menu of [true, false]) {
        for (const has_mesas_addon of [true, false]) {
          combos.push({ plan_tier, has_zelo_menu, has_mesas_addon });
        }
      }
    }
    db.subscriptions = combos.map((combo, i) => ({ user_id: `u-${i}`, ...combo }));

    const { hasKitchenQueueAccess, hasOrderingReviewAccess } = await import('../src/lib/guards.js');

    for (let i = 0; i < combos.length; i += 1) {
      const kitchen = await hasKitchenQueueAccess(`u-${i}`);
      const review = await hasOrderingReviewAccess(`u-${i}`);
      expect(kitchen, `combo ${JSON.stringify(combos[i])}`).toBe(review);
    }
  });
});

