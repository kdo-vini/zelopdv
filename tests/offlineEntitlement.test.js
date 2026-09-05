import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveEntitlementSnapshot,
  loadEntitlementSnapshot,
  clearEntitlementSnapshot,
  ENTITLEMENT_GRACE_MS
} from '../src/lib/offlineEntitlement.js';

function makeLocalStorageStub() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

beforeEach(() => {
  global.localStorage = makeLocalStorageStub();
});

afterEach(() => {
  delete global.localStorage;
});

describe('offlineEntitlement', () => {
  const ctx = { userId: 'owner-1', email: 'a@b.com', ownerUserId: 'owner-1', isSubUser: false, roleId: null };

  it('round-trips a saved snapshot for the same user within the grace window', () => {
    saveEntitlementSnapshot(ctx, 1000);
    const snap = loadEntitlementSnapshot('owner-1', 1000 + 60_000);
    expect(snap).toMatchObject({ userId: 'owner-1', ownerUserId: 'owner-1', isSubUser: false, fromCache: true });
  });

  it('returns null when the snapshot belongs to a different user', () => {
    saveEntitlementSnapshot(ctx, 1000);
    expect(loadEntitlementSnapshot('someone-else', 2000)).toBeNull();
  });

  it('expires the snapshot once past the grace window', () => {
    saveEntitlementSnapshot(ctx, 1000);
    const justInside = loadEntitlementSnapshot('owner-1', 1000 + ENTITLEMENT_GRACE_MS - 1);
    const justOutside = loadEntitlementSnapshot('owner-1', 1000 + ENTITLEMENT_GRACE_MS + 1);
    expect(justInside).not.toBeNull();
    expect(justOutside).toBeNull();
  });

  it('preserves sub-user identity (owner + role) in the snapshot', () => {
    saveEntitlementSnapshot(
      { userId: 'sub-1', email: 'caixa@x.com', ownerUserId: 'owner-9', isSubUser: true, roleId: 'role-caixa' },
      5000
    );
    const snap = loadEntitlementSnapshot('sub-1', 6000);
    expect(snap).toMatchObject({ userId: 'sub-1', ownerUserId: 'owner-9', isSubUser: true, roleId: 'role-caixa' });
  });

  it('clears the snapshot', () => {
    saveEntitlementSnapshot(ctx, 1000);
    clearEntitlementSnapshot();
    expect(loadEntitlementSnapshot('owner-1', 2000)).toBeNull();
  });

  it('no-ops without localStorage instead of throwing', () => {
    delete global.localStorage;
    expect(() => saveEntitlementSnapshot(ctx, 1000)).not.toThrow();
    expect(loadEntitlementSnapshot('owner-1', 2000)).toBeNull();
  });
});

describe('offline resume and revocation', () => {
  it('resumes the last verified local identity without fabricating a token', async () => {
    const { loadOfflineOperatingContext } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'sub', ownerUserId: 'owner', isSubUser: true, permissions: { 'pdv.acessar': true }, addons: { has_mesas_addon: true } }, 1000);
    expect(loadOfflineOperatingContext(2000)).toMatchObject({ userId: 'sub', permissions: { 'pdv.acessar': true }, addons: { has_mesas_addon: true } });
    expect(loadOfflineOperatingContext(2000)).not.toHaveProperty('access_token');
    clearEntitlementSnapshot();
    expect(loadOfflineOperatingContext(2000)).toBeNull();
  });
  it('rejects clock rollback instead of extending the seven-day grace', async () => {
    const { loadOfflineOperatingContext } = await import('../src/lib/offlineEntitlement.js');
    saveEntitlementSnapshot({ userId: 'owner', ownerUserId: 'owner' }, 10000);
    expect(loadOfflineOperatingContext(1000)).toBeNull();
  });
});
