import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { db } from '../src/lib/offlineDb.js';
import { saveSnapshot, listOperations } from '../src/lib/offline/operations.js';
vi.mock('../src/lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'operator' }, access_token: 'fixture' } } }) } } }));
vi.mock('../src/lib/stores/offlineStatus.js', () => ({ setOfflineStatus: vi.fn() }));
import { startOfflineRuntime, stopOfflineRuntime, submitOfflineOperation, submitOnlineOperation, getOfflineContext, readOperationalSnapshot, offlineRequest } from '../src/lib/offline/runtime.js';
beforeEach(async () => { stopOfflineRuntime(); await Promise.all(db.tables.map(t => t.clear())); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))); });
afterEach(() => { stopOfflineRuntime(); vi.unstubAllGlobals(); });
it('does not revoke a prepared device or request bootstrap when physically offline', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now() });
  await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
  expect(fetch).not.toHaveBeenCalled();
  expect(getOfflineContext().enabled).toBe(true);
});
it('restores prepared context without network and commits a sale before any RPC', async () => {
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
    await saveSnapshot('owner', 'bootstrap:operator', { enabled: true, ownerUserId: 'owner', userId: 'operator', validatedAt: Date.now() });
    await startOfflineRuntime({ ownerUserId: 'owner', userId: 'operator' });
    await expect(offlineRequest('/api/offline/bootstrap')).rejects.toMatchObject({ status: 401, localAuth: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(getOfflineContext().enabled).toBe(true);
    await submitOfflineOperation('sale.create', 'offline-token-expired', { valor_total: 10 }, { operationId: 'offline-token-expired' });
    expect((await listOperations('owner'))[0].status).toBe('pending');
  } finally { getSession.mockRestore(); }
});
