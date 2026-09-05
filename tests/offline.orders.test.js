import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../src/lib/offlineDb.js';
import { commitOperation, saveSnapshot, listOperations, confirmOperation } from '../src/lib/offline/operations.js';
const runtime = vi.hoisted(() => ({
  context: { enabled: true, registered: true, ownerUserId: 'owner', userId: 'operator' },
  online: vi.fn()
}));
vi.mock('../src/lib/offline/runtime.js', () => ({
  getOfflineContext: () => runtime.context,
  submitOfflineOperation: (type, entityId, payload, options) => {
    if (!runtime.context.enabled) throw new Error('offline not enabled');
    return commitOperation({ ...options, type, entityId, payload, ownerUserId: 'owner', operatorId: 'operator', deviceId: 'device' });
  },
  submitOnlineOperation: runtime.online
}));
import { createManualOrder, loadLocalOrders, buildManualOrderPayload, mergeLocalOrders } from '../src/lib/offline/orders.js';
import { createSyncCoordinator } from '../src/lib/offline/synchronizer.js';
const input = { items: [{ productId: 1, name: 'Lanche', quantity: 2, unitPrice: 12.35, modifiers: [{ groupName: 'Extra', selectedOptions: [{ optionName: 'Queijo' }] }] }], deliveryFee: 3.5 };
beforeEach(async () => {
  runtime.context = { enabled: true, registered: true, ownerUserId: 'owner', userId: 'operator' };
  runtime.online.mockReset();
  await Promise.all(db.tables.map(table => table.clear()));
});
it('accepts omitted customer/payment fields and calculates total with freight in cents', () => {
  expect(buildManualOrderPayload(input)).toMatchObject({ subtotal: 24.7, total: 28.2, customer: {}, payment: {}, deliveryFee: 3.5 });
  expect(() => buildManualOrderPayload({ items: [] })).toThrow();
  expect(() => buildManualOrderPayload({ ...input, deliveryFee: -1 })).toThrow();
  expect(() => buildManualOrderPayload({ items: [{ ...input.items[0], quantity: 0 }] })).toThrow();
});
it('commits a durable local order and retries the same intention without duplication', async () => {
  await createManualOrder(input, { operationId: 'intent' });
  await createManualOrder(input, { operationId: 'intent' });
  expect(await listOperations('owner')).toHaveLength(1);
  const rows = await loadLocalOrders('owner');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 'intent', total: 28.2, localOnly: true, source: 'manual' });
  expect(await loadLocalOrders('another-owner')).toEqual([]);
  await expect(createManualOrder(input, { operationId: 'intent', ownerUserId: 'another-owner' })).rejects.toThrow();
});
it('creates an online manual order without requiring full offline preparation', async () => {
  runtime.context = { enabled: false, ownerUserId: 'owner', userId: 'operator' };
  runtime.online.mockImplementation((type, entityId, payload, options) => commitOperation({
    ...options, type, entityId, payload, ownerUserId: 'owner', operatorId: 'operator', deviceId: 'online-device'
  }));
  const order = await createManualOrder(input, { operationId: 'online-intent' });
  expect(runtime.online).toHaveBeenCalledWith('order.create', 'online-intent', expect.any(Object), expect.objectContaining({ operationId: 'online-intent' }));
  expect(order).toMatchObject({ id: 'online-intent', localOnly: true, total: 28.2 });
});
it('reconciles remote IDs without duplicating or resurrecting a completed order', async () => {
  await createManualOrder(input, { operationId: 'intent' });
  await confirmOperation('owner', 'intent', { operationId: 'intent', status: 'applied', result: { id: 'remote-id' } });
  const operations = await listOperations('owner');
  expect(mergeLocalOrders([{ id: 'remote-id', status: 'accepted' }], operations)).toHaveLength(1);
  expect(mergeLocalOrders([], operations, ['intent'])).toEqual([]);
  await saveSnapshot('owner', 'orders:queue', { orders: [], reconciled: ['intent'] });
  expect(await loadLocalOrders('owner')).toEqual([]);
});
it('preserves the same order after a lost response and clears its draft atomically', async () => {
  await db.offline_drafts.put({ ownerUserId: 'owner', operatorId: 'operator', key: 'manual-order', value: input });
  await createManualOrder(input, { operationId: 'intent' });
  expect(await db.offline_drafts.count()).toBe(0);
  let calls = 0;
  const applied = new Set();
  let now = Date.now();
  const sync = createSyncCoordinator({ ownerUserId: 'owner', now: () => now, transport: async ([op]) => {
    applied.add(op.operationId);
    if (++calls === 1) throw new Error('Connection lost after server commit');
    return { results: [{ operationId: op.operationId, status: 'already_applied', result: { id: 'remote-id' } }] };
  } });
  await sync.syncNow();
  expect((await loadLocalOrders('owner'))[0].id).toBe('intent');
  now += 10000;
  await sync.syncNow();
  expect(applied.size).toBe(1);
  expect((await loadLocalOrders('owner'))[0].id).toBe('remote-id');
  sync.stop();
});
it('keeps the draft and previous intention when saving a changed payload under the same id fails', async () => {
  await createManualOrder(input, { operationId: 'intent' });
  await db.offline_drafts.put({ ownerUserId: 'owner', operatorId: 'operator', key: 'manual-order', value: input });
  await expect(createManualOrder({ ...input, deliveryFee: 99 }, { operationId: 'intent' })).rejects.toThrow();
  expect(await db.offline_drafts.count()).toBe(1);
  expect((await loadLocalOrders('owner'))[0].total).toBe(28.2);
});
it('retains a rejected price snapshot with the server reason for review', async () => {
  await createManualOrder(input, { operationId: 'intent' });
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport: async () => ({ results: [{
    operationId: 'intent', status: 'needs_review', result: { error: 'PRODUCT_PRICE_CHANGED' }
  }] }) });
  await sync.syncNow();
  const [op] = await listOperations('owner');
  expect(op.status).toBe('needs_review');
  expect(op.lastError.message).toBe('PRODUCT_PRICE_CHANGED');
  expect((await loadLocalOrders('owner'))[0].total).toBe(28.2);
  sync.stop();
});
