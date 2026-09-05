import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db, atualizarCatalogoOffline, buscarProdutosLocal } from '../src/lib/offlineDb.js';
import { commitOperation, listOperations, saveSnapshot, readSnapshot, saveDraft, readDraft, migrateLegacyOperations } from '../src/lib/offline/operations.js';
import { exportRecovery, importRecovery } from '../src/lib/offline/recovery.js';
import { createSyncCoordinator } from '../src/lib/offline/synchronizer.js';

beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())); });
const input = (id = 'one', extra = {}) => ({ ownerUserId: 'owner', operatorId: 'operator', deviceId: 'device', type: 'sale.create', entityId: id, operationId: id, payload: { total: 10 }, ...extra });
const ack = op => ({ results: [{ operationId: op.operationId, status: 'applied', result: { id: 12 } }] });

it('replays 1000 durable sales across two coordinators without duplicating uncertain results', async () => {
  for (let index = 0; index < 1000; index++) await commitOperation(input(`stress-${index}`));
  db.close(); await db.open();
  const remote = new Map();
  const lost = new Set();
  let time = Date.now();
  const transport = async ([op]) => {
    const already = remote.has(op.operationId);
    if (!already) remote.set(op.operationId, op.payload);
    if (Number(op.operationId.split('-')[1]) % 20 === 0 && !lost.has(op.operationId)) {
      lost.add(op.operationId); throw new TypeError('Response lost after commit');
    }
    return { results: [{ operationId: op.operationId, status: already ? 'already_applied' : 'applied', result: { id: op.operationId } }] };
  };
  const a = createSyncCoordinator({ ownerUserId: 'owner', transport, now: () => time });
  const b = createSyncCoordinator({ ownerUserId: 'owner', transport, now: () => time });
  try {
    await Promise.all([a.syncNow(), b.syncNow()]);
    time += 10000;
    await Promise.all([a.syncNow(), b.syncNow()]);
    const rows = await listOperations('owner');
    expect(rows).toHaveLength(1000);
    expect(rows.every(row => row.status === 'acked')).toBe(true);
    expect(remote.size).toBe(1000);
    expect(lost.size).toBe(50);
  } finally { a.stop(); b.stop(); }
}, 120000);

it('durably stores an immutable intention and projection together, deduplicating retries', async () => {
  const op = await commitOperation(input('one', { projection: { total: 10 } }));
  db.close(); await db.open();
  expect((await listOperations('owner'))[0].operationId).toBe(op.operationId);
  expect(await listOperations('other')).toEqual([]);
  await commitOperation(input());
  expect(await listOperations('owner')).toHaveLength(1);
  await expect(commitOperation(input('one', { payload: { total: 20 } }))).rejects.toThrow();
  expect((await db.offline_entities.get(['owner', 'sale', 'one'])).value).toEqual({ total: 10 });
});

it('scopes snapshots and drafts to owner and operator', async () => {
  await saveSnapshot('owner', 'catalog', { items: [1] });
  await saveDraft('owner', 'operator', 'cart', { items: [2] });
  expect(await readSnapshot('other', 'catalog')).toBeNull();
  expect(await readDraft('owner', 'other', 'cart')).toBeNull();
  expect(await readDraft('owner', 'operator', 'cart')).toEqual({ items: [2] });
});

it('retries uncertain response with original identity and validates acknowledgements', async () => {
  await commitOperation(input());
  let time = 1000;
  const transport = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async ([op]) => ack(op));
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport, now: () => time, random: () => 0.5 });
  await sync.syncNow();
  expect((await listOperations('owner'))[0].status).toBe('pending');
  time += 10000; await sync.syncNow();
  expect((await listOperations('owner'))[0].status).toBe('acked');
  expect(transport.mock.calls[0][0][0].operationId).toBe(transport.mock.calls[1][0][0].operationId);
  sync.stop();
});

it('two tabs never submit the same operation concurrently', async () => {
  await commitOperation(input());
  const transport = vi.fn(async ([op]) => { await new Promise(r => setTimeout(r, 15)); return ack(op); });
  const a = createSyncCoordinator({ ownerUserId: 'owner', transport });
  const b = createSyncCoordinator({ ownerUserId: 'owner', transport });
  await Promise.all([a.syncNow(), b.syncNow()]);
  expect(transport).toHaveBeenCalledTimes(1);
  a.stop(); b.stop();
});

it('a reviewed dependency blocks only its descendants', async () => {
  await commitOperation(input('one'));
  await commitOperation(input('two', { dependencies: ['one'] }));
  await commitOperation(input('three'));
  const transport = vi.fn(async ([op]) => op.operationId === 'one' ? { results: [{ operationId: 'one', status: 'needs_review', result: { reason: 'conflict' } }] } : ack(op));
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport });
  await sync.syncNow();
  expect((await listOperations('owner')).map(o => [o.operationId, o.status])).toEqual([['one', 'needs_review'], ['two', 'pending'], ['three', 'acked']]);
  sync.stop();
});

it('refuses mismatched acknowledgement and preserves pending record', async () => {
  await commitOperation(input());
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport: async () => ack({ operationId: 'wrong' }) });
  await sync.syncNow();
  expect((await listOperations('owner'))[0].status).toBe('pending');
  sync.stop();
});

it('clears the draft and publishes snapshot only on successful local commit', async () => {
  await saveDraft('owner', 'operator', 'cart', { items: [1] });
  await commitOperation(input('one', { projection: { key: 'cash', value: { total: 10 } }, clearDraft: { operatorId: 'operator', key: 'cart' } }));
  expect(await readSnapshot('owner', 'cash')).toEqual({ total: 10 });
  expect(await readDraft('owner', 'operator', 'cart')).toBeNull();
});

it('projection failure rolls back sale, sequence and draft deletion together', async () => {
  await saveDraft('owner', 'operator', 'cart', { items: [1] });
  await expect(commitOperation(input('one', { projection: { key: 'cash', update() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); } }, clearDraft: { operatorId: 'operator', key: 'cart' } }))).rejects.toThrow('Quota exceeded');
  expect(await listOperations('owner')).toEqual([]);
  expect(await readDraft('owner', 'operator', 'cart')).toEqual({ items: [1] });
  expect(await readSnapshot('owner', 'cash')).toBeNull();
});

it('concurrent projections preserve both edits in one owner snapshot', async () => {
  await saveSnapshot('owner', 'cash', { total: 0 });
  await Promise.all(['one', 'two'].map(id => commitOperation(input(id, { projection: { key: 'cash', update: old => ({ total: old.total + 10 }) } }))));
  expect(await readSnapshot('owner', 'cash')).toEqual({ total: 20 });
});

it('catalog replacement and applied-operation boundary are atomic and reject a stale refresh', async () => {
  await atualizarCatalogoOffline([{ id: 1, estoque_atual: 10 }], 'owner', [], []);
  await expect(atualizarCatalogoOffline([{ id: 2 }, { id: 2 }], 'owner', ['wrong'], [])).rejects.toThrow();
  expect((await buscarProdutosLocal('', 'owner'))[0].estoque_atual).toBe(10);
  expect(await readSnapshot('owner', 'catalog.includedOperations')).toEqual([]);
  await commitOperation(input());
  expect(await atualizarCatalogoOffline([{ id: 1, estoque_atual: 4 }], 'owner', [], [])).toBe(false);
  expect((await buscarProdutosLocal('', 'owner'))[0].estoque_atual).toBe(10);
});

it('stopping during first request never sends remaining operations', async () => {
  for (let i = 0; i < 4; i++) await commitOperation(input(String(i)));
  let sync;
  const transport = vi.fn(async ([op]) => { sync.stop(); return ack(op); });
  sync = createSyncCoordinator({ ownerUserId: 'owner', transport });
  await sync.syncNow();
  expect(transport.mock.calls.length).toBeLessThanOrEqual(2);
  expect((await listOperations('owner')).filter(o => o.status === 'pending').length).toBeGreaterThanOrEqual(2);
});

it('expired tab reservation recovers and same-entity writes stay ordered', async () => {
  await commitOperation(input('one', { entityId: 'shared' }));
  await commitOperation(input('two', { entityId: 'shared' }));
  await db.offline_operations.update(['owner', 'one'], { status: 'inflight', leaseId: 'dead-tab', leaseUntil: 1 });
  const seen = [];
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport: async ([op]) => { seen.push(op.operationId); return ack(op); } });
  await sync.syncNow();
  expect(seen).toEqual(['one', 'two']);
  sync.stop();
});

it.each([[401, 'needs_auth'], [403, 'needs_review'], [429, 'pending'], [503, 'pending']])('classifies HTTP %s durably', async (code, expected) => {
  await commitOperation(input());
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport: async () => { throw Object.assign(new Error('error'), { status: code, retryAfter: '120' }); } });
  await sync.syncNow();
  const [op] = await listOperations('owner');
  expect(op.status).toBe(expected);
  expect(op.nextAttemptAt).toBeGreaterThan(Date.now() + 110000);
  sync.stop();
});

it('a hanging transport is bounded and keeps intent for retry', async () => {
  await commitOperation(input());
  const sync = createSyncCoordinator({ ownerUserId: 'owner', timeoutMs: 5, transport: () => new Promise(() => {}) });
  await sync.syncNow();
  expect((await listOperations('owner'))[0].status).toBe('pending');
  sync.stop();
});

it('uses confirmed predecessor revision on first dispatch, preserving it after uncertain reply', async () => {
  await commitOperation(input('one', { entityId: 'shared', type: 'mesa.open' }));
  await commitOperation(input('two', { entityId: 'shared', type: 'mesa.close', dependencies: ['one'], baseRevision: 1 }));
  let time = 0;
  const transport = vi.fn(async ([op]) => {
    if (op.operationId === 'one') return { results: [{ operationId: 'one', status: 'applied', result: { revision: 4 } }] };
    throw new TypeError('Failed to fetch');
  });
  const sync = createSyncCoordinator({ ownerUserId: 'owner', transport, now: () => time });
  await sync.syncNow(); time = 10000; await sync.syncNow();
  expect(transport.mock.calls.filter(([rows]) => rows[0].operationId === 'two').map(([rows]) => rows[0].baseRevision)).toEqual([4, 4]);
  sync.stop();
});

it('legacy migration keeps identity, payload and time without claiming unknown records', async () => {
  const payload = { client_sale_id: 'legacy-key', valor_total: 11 };
  await db.vendas_pendentes.bulkAdd([
    { ownerUserId: 'owner', operatorUserId: 'operator', payload, createdAt: '2026-09-01T00:00:00Z', status: 'aguardando' },
    { payload: { valor_total: 12 }, status: 'aguardando' },
    { ownerUserId: 'other', payload, status: 'aguardando' },
  ]);
  await Promise.all([migrateLegacyOperations('owner'), migrateLegacyOperations('owner')]);
  const [op] = await listOperations('owner');
  expect(op.payload).toEqual(payload);
  expect(op.operationId).toBe('legacy-key');
  expect(op.occurredAt).toBe('2026-09-01T00:00:00Z');
  expect(await listOperations('owner')).toHaveLength(1);
  expect(await db.vendas_pendentes.where('status').equals('aguardando').count()).toBe(2);
});

it('recovery backup is encrypted, refuses another owner and imports stable IDs', async () => {
  await commitOperation(input());
  const backup = await exportRecovery('owner', 'a-long-recovery-password');
  expect(JSON.stringify(backup)).not.toContain('operator');
  await expect(importRecovery('other', 'a-long-recovery-password', backup)).rejects.toThrow();
  await expect(importRecovery('owner', 'wrong-password-here', backup)).rejects.toThrow();
  await db.offline_operations.clear();
  expect(await importRecovery('owner', 'a-long-recovery-password', backup)).toEqual({ imported: 1 });
  expect((await listOperations('owner'))[0].operationId).toBe('one');
  expect(await importRecovery('owner', 'a-long-recovery-password', backup)).toEqual({ imported: 0 });
});
