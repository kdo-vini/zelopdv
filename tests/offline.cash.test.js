import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../src/lib/offlineDb.js';
import { saveSnapshot, readSnapshot } from '../src/lib/offline/operations.js';
import { loadCashSnapshot } from '../src/lib/finance/offlineCash.js';
beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())); });
function client(dataByTable) {
  return { from(table) { const q = { then: resolve => Promise.resolve({ data: dataByTable[table] || [], error: null }).then(resolve) }; for (const m of ['select','eq','is','order','limit','range','in']) q[m] = () => q; return q; } };
}
it('resolves the acknowledged local shift and reads other-device sales', async () => {
  await saveSnapshot('owner', 'caixa.aberto', { id: 'local-uuid', valor_inicial: 10 });
  await db.offline_operations.add({ ownerUserId: 'owner', operationId: 'open', type: 'caixa.open', entityId: 'local-uuid', status: 'acked', sequence: 1, result: { id: 4 } });
  const snapshot = await loadCashSnapshot(client({ caixas: [{ id: 4, valor_inicial: 10 }], vendas: [{ id: 7, valor_total: 22 }] }), 'owner');
  expect(snapshot.caixa.id).toBe(4); expect(snapshot.vendas[0].id).toBe(7);
});
it('discovers the next online shift after a synchronized close', async () => {
  await saveSnapshot('owner', 'caixa.aberto', { id: 4, data_fechamento: '2026-09-01' });
  const snapshot = await loadCashSnapshot(client({ caixas: [{ id: 5, valor_inicial: 0 }] }), 'owner');
  expect(snapshot.caixa.id).toBe(5);
  expect((await readSnapshot('owner', 'caixa.aberto')).id).toBe(5);
});
it('does not overwrite an unsynchronized locally closed shift', async () => {
  await saveSnapshot('owner', 'caixa.aberto', { id: 4, data_fechamento: '2026-09-01' });
  await db.offline_operations.add({ ownerUserId: 'owner', operationId: 'close', type: 'caixa.close', entityId: '4', status: 'pending', sequence: 1, payload: { id_caixa: 4 } });
  const snapshot = await loadCashSnapshot(client({ caixas: [{ id: 4 }] }), 'owner');
  expect(snapshot.caixa).toBeNull(); expect(snapshot.provisional).toBe(true);
});
