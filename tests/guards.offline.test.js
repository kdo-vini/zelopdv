import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cenário: rede fora no cold-start. O gate deve reusar o entitlement em cache
// (snapshot) em vez de expulsar o operador para /assinatura. Negativo confirmado
// pelo servidor continua redirecionando (coberto no outro arquivo de teste).

let db = {};
let authChange;

function makeQuery(table) {
  const query = {
    eq() { return query; },
    in() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      const entry = db[table];
      if (entry?.__hang) return new Promise(resolve => { entry.resolve = resolve; });
      if (entry?.__error) return { data: null, error: entry.__error };
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
    auth: { onAuthStateChange: (callback) => { authChange = callback; }, getSession: vi.fn(async () => ({ data: { session: db.__session || null } })) },
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
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


describe('offline identity boundaries', () => {
  it('resumes cached sub-user permissions when there is no live session and the device is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    try {
      const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
      saveEntitlementSnapshot({ userId: 'sub-1', ownerUserId: 'owner-1', isSubUser: true, permissions: { 'pdv.acessar': true } });
      const { ensureActiveSubscription } = await import('../src/lib/guards.js');
      const context = await ensureActiveSubscription();
      expect(context).toMatchObject({ userId: 'sub-1', fromCache: true, permissions: { 'pdv.acessar': true } });
      expect(context).not.toHaveProperty('access_token');
    } finally { vi.unstubAllGlobals(); }
  });
  it('confirmed revocation clears offline access even if the connection drops afterwards', async () => {
    db.__session = { user: { id: 'sub-1' } };
    db.access_users = { owner_user_id: 'owner-1', status: 'blocked', role_id: 'role' };
    const { saveEntitlementSnapshot, loadOfflineOperatingContext } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'sub-1', ownerUserId: 'owner-1', isSubUser: true });
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    expect(await ensureActiveSubscription()).toBeNull();
    expect(loadOfflineOperatingContext()).toBeNull();
  });
});

describe('online blackhole deadlines', () => {
  it.each(['access_users', 'subscriptions', 'empresa_perfil'])('resumes cached permissions after a hanging %s query without late redirects', async (table) => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    db.__session = { user: { id: 'owner-1' } };
    db[table] = { __hang: true };
    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1', permissions: { 'pdv.acessar': true } });
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const pending = ensureActiveSubscription({ requireProfile: table === 'empresa_perfil' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ userId: 'owner-1', fromCache: true, permissions: { 'pdv.acessar': true } });
    db[table].resolve({ data: null, error: { status: 403, message: 'Forbidden' } });
    await vi.advanceTimersByTimeAsync(1);
    expect(window.location.href).toBe('');
  });
  it('refuses a confirmed forbidden operator lookup instead of treating them as owner', async () => {
    db.__session = { user: { id: 'owner-1' } };
    db.access_users = { __error: { status: 403, message: 'Forbidden' } };
    db.subscriptions = { status: 'active', current_period_end: '2099-01-01' };
    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1' });
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    expect(await ensureActiveSubscription()).toBeNull();
  });
  it('discards an old account request after sign-out while the query hangs', async () => {
    vi.useFakeTimers();
    db.__session = { user: { id: 'owner-1' } };
    db.access_users = { __hang: true };
    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1' });
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const pending = ensureActiveSubscription();
    await vi.advanceTimersByTimeAsync(1);
    authChange('SIGNED_OUT', null);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBeNull();
    expect(window.location.href).toBe('');
  });
});

describe('local session absence and addon deadlines', () => {
  it('restores Pedidos offline only for a matching, unexpired menu entitlement', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { saveEntitlementSnapshot, ENTITLEMENT_GRACE_MS } = await import('../src/lib/offlineEntitlement.js');
    const { hasOrderingReviewAccess, hasKitchenQueueAccess, hasMesasAddon } = await import('../src/lib/guards.js');
    const ctx = { userId: 'operator-1', ownerUserId: 'owner-1', isSubUser: true, addons: { has_zelo_menu: true, has_mesas_addon: true } };
    saveEntitlementSnapshot(ctx);
    expect(await hasOrderingReviewAccess('operator-1')).toBe(true);
    expect(await hasKitchenQueueAccess('operator-1')).toBe(true);
    expect(await hasOrderingReviewAccess('owner-1')).toBe(true);
    expect(await hasMesasAddon('owner-1')).toBe(true);
    expect(await hasMesasAddon('different-user')).toBe(false);
    expect(await hasOrderingReviewAccess('different-user')).toBe(false);
    saveEntitlementSnapshot(ctx, Date.now() - ENTITLEMENT_GRACE_MS - 1);
    expect(await hasOrderingReviewAccess('operator-1')).toBe(false);
  });
  it('preserves Pedidos on network timeout and honors confirmed denial', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    db.access_users = { __hang: true };
    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1', addons: { has_zelo_menu: true } });
    const { hasOrderingReviewAccess } = await import('../src/lib/guards.js');
    const pending = hasOrderingReviewAccess('owner-1');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBe(true);
    db.access_users = null;
    db.subscriptions = { plan_tier: 'pdv', has_zelo_menu: false };
    expect(await hasOrderingReviewAccess('owner-1')).toBe(false);
    db.access_users = { __error: { status: 403, message: 'Forbidden' } };
    expect(await hasOrderingReviewAccess('owner-1')).toBe(false);
  });
  it('resumes local operating context without a token until explicit logout clears it', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { saveEntitlementSnapshot, clearEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1' });
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    expect(await ensureActiveSubscription()).toMatchObject({ userId: 'owner-1', fromCache: true });
    clearEntitlementSnapshot();
    expect(await ensureActiveSubscription()).toBeNull();
    expect(window.location.href).toBe('/login');
  });
  it('retains the cached Mesa addon after timeout but honors a confirmed denial', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    db.access_users = { __hang: true };
    const { saveEntitlementSnapshot } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner-1', ownerUserId: 'owner-1', addons: { has_mesas_addon: true } });
    const { hasMesasAddon } = await import('../src/lib/guards.js');
    const pending = hasMesasAddon('owner-1');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBe(true);
    db.access_users = { __error: { status: 403, message: 'Forbidden' } };
    expect(await hasMesasAddon('owner-1')).toBe(false);
  });
});
