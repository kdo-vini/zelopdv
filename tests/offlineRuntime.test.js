import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { db } from '../src/lib/offlineDb.js';
import { saveSnapshot, listOperations } from '../src/lib/offline/operations.js';
vi.mock('../src/lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'operator' }, access_token: 'fixture' } } }) } } }));
vi.mock('../src/lib/stores/offlineStatus.js', async () => {
  const { writable } = await import('svelte/store');
  return { offlineStatus: writable({ connection: 'online', pendingCount: 0, reviewCount: 0 }), setOfflineStatus: vi.fn() };
});
import { startOfflineRuntime, stopOfflineRuntime, submitOfflineOperation, submitOnlineOperation, isOfflineWriteActive, getOfflineContext, readOperationalSnapshot, offlineRequest } from '../src/lib/offline/runtime.js';
/** Offline operation is now a per-device opt-in: the bootstrap snapshot alone
 * no longer enables it, the local readiness marker written by the explicit
 * preparation has to be there too. */
async function prepareDeviceFixture(owner = 'owner', operator = 'operator') {
  await saveSnapshot(owner, `readiness:${operator}`, { catalog: true, cash: true, completedAt: Date.now() });
}
beforeEach(async () => { stopOfflineRuntime(); await Promise.all(db.tables.map(t => t.clear())); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))); });
afterEach(() => { stopOfflineRuntime(); vi.unstubAllGlobals(); });
it('does not revoke a prepared device or request bootstrap when physically offline', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await prepareDeviceFixture();
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now() });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(fetch).not.toHaveBeenCalled();
  expect(getOfflineContext().enabled).toBe(true);
});
it('restores prepared context without network and commits a sale before any RPC', async () => {
  await prepareDeviceFixture();
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now(), isPrimaryDevice: true });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(getOfflineContext().enabled).toBe(true);
  const operation = await submitOfflineOperation('sale.create', 'sale-1', { valor_total: 10 }, { operationId: 'sale-1' });
  expect(operation.operationId).toBe('sale-1');
  expect((await listOperations('owner'))[0].payload.valor_total).toBe(10);
});
it('does not enable a different operator or expired preparation snapshot', async () => {
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'other', validatedAt: Date.now() });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  await expect(submitOfflineOperation('sale.create', 'sale-1', {})).rejects.toThrow();
  expect(await listOperations('owner')).toEqual([]);
});
it('registers an online order device without running the full offline preparation', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, registered: false, ownerUserId: 'owner', operatorId: 'operator' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, registered: true, subscriptionActive: true, ownerUserId: 'owner', operatorId: 'operator' }), { status: 200 }));
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  const operation = await submitOnlineOperation('order.create', 'order-1', { total: 10 }, { operationId: 'order-1' });
  expect(operation.operationId).toBe('order-1');
  expect(getOfflineContext()).toMatchObject({ enabled: false, registered: true });
  expect(fetch).toHaveBeenLastCalledWith('/api/offline/bootstrap', expect.objectContaining({ method: 'POST' }));
});
it('revalidates subscription access before an online order on a registered device', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, registered: true, subscriptionActive: true, ownerUserId: 'owner', operatorId: 'operator' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, registered: true, subscriptionActive: false, ownerUserId: 'owner', operatorId: 'operator' }), { status: 200 }));
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  await expect(submitOnlineOperation('order.create', 'expired-order', { total: 10 }, { operationId: 'expired-order' }))
    .rejects.toThrow('assinatura ativa');
  expect(await listOperations('owner')).toEqual([]);
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/offline/bootstrap?deviceId='), expect.any(Object));
});
it('does not acknowledge a forbidden local payment for a restricted operator', async () => {
  await prepareDeviceFixture();
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', isSubUser: true, permissions: { 'mesas.acessar': true }, validatedAt: Date.now() });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator', isSubUser: true });
  await expect(submitOfflineOperation('mesa.payment.add', 'mesa1', { valor: 5 })).rejects.toThrow('permissão');
  expect(await listOperations('owner')).toEqual([]);
});
it('never returns an old tenant snapshot after identity changes during refresh', async () => {
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now() });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  await saveSnapshot('owner', 'private', { name: 'A' });
  await expect(readOperationalSnapshot('private', async () => { stopOfflineRuntime(); return { name: 'old' }; }, { refresh: true })).rejects.toThrow('Conta alterada');
});
it('exposes an actionable server rejection instead of calling it a network failure', async () => {
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Comanda alterada em outro aparelho.', code: 'REVISION_CONFLICT' }), { status: 409 }));
  await expect(offlineRequest('/api/mesas/close')).rejects.toMatchObject({ message: 'Comanda alterada em outro aparelho.', status: 409, code: 'REVISION_CONFLICT' });
});

it('preserves the verified offline authorization when an online browser has no refreshable session', async () => {
  const { supabase } = await import('../src/lib/supabaseClient');
  const getSession = vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null } });
  vi.stubGlobal('navigator', { onLine: true });
  try {
    await prepareDeviceFixture();
    await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now() });
    await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
    await expect(offlineRequest('/api/offline/bootstrap')).rejects.toMatchObject({ status: 401, localAuth: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(getOfflineContext().enabled).toBe(true);
    await submitOfflineOperation('sale.create', 'offline-token-expired', { valor_total: 10 }, { operationId: 'offline-token-expired' });
    expect((await listOperations('owner'))[0].status).toBe('pending');
  } finally { getSession.mockRestore(); }
});

it('does not enrol a device in offline operation just because the store enabled it', async () => {
  // The device was registered for durable delivery (an online manual order does
  // this) but nobody prepared it in Perfil > Integrações. It must keep the
  // online write paths it had before the offline feature existed.
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({
    enabled: true, registered: true, subscriptionActive: true, isPrimaryDevice: false,
    ownerUserId: 'owner', operatorId: 'operator'
  }), { status: 200 }));
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(getOfflineContext()).toMatchObject({ enabled: false, storeOfflineEnabled: true, preparedHere: false, registered: true });
  expect(isOfflineWriteActive()).toBe(false);
  await expect(submitOfflineOperation('sale.create', 'sale-x', { valor_total: 10 })).rejects.toThrow('Prepare este aparelho');
});

it('joins offline operation only for the device that completed the preparation', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({
    enabled: true, registered: true, subscriptionActive: true, ownerUserId: 'owner', operatorId: 'operator'
  }), { status: 200 }));
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(getOfflineContext().enabled).toBe(false);
  await prepareDeviceFixture();
  stopOfflineRuntime();
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(getOfflineContext()).toMatchObject({ enabled: true, preparedHere: true });
});

it('keeps a prepared but connected device on the online write path', async () => {
  // The primary-device rule protects offline cash turns. A connected secondary
  // device must never be pushed into the queue by it.
  const { setOfflineStatus, offlineStatus } = await import('../src/lib/stores/offlineStatus.js');
  vi.stubGlobal('navigator', { onLine: true });
  await prepareDeviceFixture();
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now(), isPrimaryDevice: false });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(getOfflineContext().enabled).toBe(true);
  expect(isOfflineWriteActive()).toBe(false);
  // Losing the network hands the same device back to the durable queue.
  vi.stubGlobal('navigator', { onLine: false });
  expect(isOfflineWriteActive()).toBe(true);
  // A non-primary device still may not own a cash turn while offline.
  await expect(submitOfflineOperation('caixa.open', 'turn-1', { valor_inicial: 0 })).rejects.toThrow('aparelho principal');
  expect(offlineStatus).toBeDefined();
  expect(setOfflineStatus).toBeDefined();
});

it('queues while unsynced work is still pending so an offline turn keeps its order', async () => {
  const { offlineStatus } = await import('../src/lib/stores/offlineStatus.js');
  vi.stubGlobal('navigator', { onLine: true });
  await prepareDeviceFixture();
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now(), isPrimaryDevice: true });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(isOfflineWriteActive()).toBe(false);
  offlineStatus.set({ connection: 'online', pendingCount: 1, reviewCount: 0 });
  expect(isOfflineWriteActive()).toBe(true);
});
