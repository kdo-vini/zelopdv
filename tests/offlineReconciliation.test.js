import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../src/lib/offlineDb.js';
import { commitOperation, listOperations } from '../src/lib/offline/operations.js';
import { retryPendingOperations, reconcileOperation } from '../src/lib/offline/reconciliation.js';
beforeEach(async () => { await Promise.all(db.tables.map(table => table.clear())); });
const create = async (id, status, ownerUserId = 'owner') => {
  await commitOperation({ ownerUserId, operatorId: 'owner', deviceId: 'device', type: 'sale.create', operationId: id, entityId: id, payload: { total: 10 } });
  await db.offline_operations.update([ownerUserId, id], { status, nextAttemptAt: 9999999999999 });
};
it('manual retry preserves conflicts, in-flight reservations, and other stores', async () => {
  await create('a', 'pending'); await create('b', 'needs_auth'); await create('c', 'needs_review'); await create('d', 'inflight'); await create('e', 'needs_auth', 'other');
  await retryPendingOperations('owner');
  expect((await listOperations('owner')).map(row => row.status)).toEqual(['pending', 'pending', 'needs_review', 'inflight']);
  expect((await listOperations('other'))[0].status).toBe('needs_auth');
});
it('requires owner decision and genuine acknowledgement before clearing review', async () => {
  await create('a', 'needs_review');
  const request = vi.fn(async () => ({ operationId: 'wrong', status: 'applied', result: {} }));
  const input = { ownerUserId: 'owner', userId: 'owner', operationId: 'a', action: 'record_duplicate', note: 'Confirmed against original receipt', request };
  await expect(reconcileOperation({ ...input, userId: 'operator' })).rejects.toThrow('titular');
  expect(request).not.toHaveBeenCalled();
  await expect(reconcileOperation(input)).rejects.toThrow('Confirmação');
  expect((await listOperations('owner'))[0].status).toBe('needs_review');
  request.mockResolvedValue({ operationId: 'a', status: 'applied', result: { reconciled: true, action: 'record_duplicate' } });
  await reconcileOperation(input);
  expect((await listOperations('owner'))[0]).toMatchObject({ status: 'acked', result: { reconciled: true } });
});
