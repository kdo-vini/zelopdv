import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cenário: rede fora no cold-start. O gate deve reusar o entitlement em cache
// (snapshot) em vez de expulsar o operador para /assinatura. Negativo confirmado
// pelo servidor continua redirecionando (coberto no outro arquivo de teste).

let db = {};

function makeQuery(table) {
  const query = {
    eq() { return query; },
    in() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      const entry = db[table];
      if (entry && entry.__networkError) {
        return { data: null, error: { message: 'Failed to fetch' } };
      }
      return { data: entry ?? null, error: null };
    },
  };
  return query;
}

vi.mock('../src/lib/supabaseClient.js', () => {
  const supabase = {
    auth: { getSession: vi.fn(async () => ({ data: { session: db.__session || null } })) },
    from: vi.fn((table) => ({ select: () => makeQuery(table) })),
  };
  return { supabase, hasSupabaseConfig: true };
});

const originalWindow = global.window;

function makeLocalStorageStub() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

beforeEach(() => {
  db = { __session: null };
  global.window = { location: { href: '' } };
  global.localStorage = makeLocalStorageStub();
});

afterEach(() => {
  global.window = originalWindow;
  delete global.localStorage;
  vi.resetModules();
  vi.clearAllMocks();
});

describe('ensureActiveSubscription — offline tolerance', () => {
  it('falls back to the cached entitlement when the subscription query fails by network', async () => {
    db.__session = { user: { id: 'owner-1', email: 'owner@test.com' } };
    db.access_users = null; // no sub-user
    db.subscriptions = { __networkError: true };

    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', email: 'owner@test.com', ownerUserId: 'owner-1', isSubUser: false, roleId: null });

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();

    expect(res).toMatchObject({ userId: 'owner-1', ownerUserId: 'owner-1', isSubUser: false });
    expect(global.window.location.href).toBe('');
  });

  it('still redirects when network fails AND there is no cached entitlement', async () => {
    db.__session = { user: { id: 'owner-1', email: 'owner@test.com' } };
    db.access_users = null;
    db.subscriptions = { __networkError: true };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();

    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/assinatura?msg=subscribe');
  });

  it('persists a snapshot after a successful online validation', async () => {
    db.__session = { user: { id: 'owner-1', email: 'owner@test.com' } };
    db.access_users = null;
    db.subscriptions = { user_id: 'owner-1', status: 'active', current_period_end: '2099-01-01T00:00:00.000Z' };

    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    await ensureActiveSubscription();

    const { loadEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    expect(loadEntitlementSnapshot('owner-1')).toMatchObject({ userId: 'owner-1', isSubUser: false });
  });
});
