import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), catalog: vi.fn(), cash: vi.fn(), mesas: vi.fn(), rows: vi.fn(), products: vi.fn() }));
vi.mock('../src/lib/stores/pdvCache.js', () => ({ pdvCache: { setUserId: vi.fn(), getProdutos: mocks.products, getCategorias: async () => [], getSubcategorias: async () => [] } }));
vi.mock('../src/lib/offlineDb.js', () => ({ atualizarCatalogoOffline: mocks.catalog, atualizarCacheCategorias: vi.fn(), atualizarCacheSubcategorias: vi.fn() }));
vi.mock('../src/lib/offline/operations.js', () => ({ listOperations: mocks.rows, saveSnapshot: mocks.save }));
vi.mock('../src/lib/offline/mesas.js', () => ({ loadMesaState: mocks.mesas }));
vi.mock('../src/lib/finance/offlineCash.js', () => ({ loadCashSnapshot: mocks.cash }));
import { prepareOperationalData } from '../src/lib/offline/preparation.js';
const context = { ownerUserId: 'owner', userId: 'operator', isSubUser: true, permissions: { 'pdv.vender': true } };
const client = { from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { nome_exibicao: 'Loja' } }) }; return q; } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.catalog.mockResolvedValue(true); mocks.rows.mockResolvedValue([]);
  mocks.cash.mockResolvedValue({ caixa: null, provisional: false }); mocks.products.mockResolvedValue([{ id: 1 }]);
});
it('marks prepared only after durable catalog and current cash snapshot, respecting Mesa permission', async () => {
  await prepareOperationalData(client, context, () => {});
  expect(mocks.catalog).toHaveBeenCalledWith([{ id: 1 }], 'owner', [], []);
  expect(mocks.mesas).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenLastCalledWith('owner', 'readiness:operator', expect.objectContaining({ catalog: true, cash: true, mesas: false }));
});
it('does not advertise readiness when pending operations prevent a safe catalog refresh', async () => {
  mocks.catalog.mockResolvedValue(false);
  await expect(prepareOperationalData(client, context, () => {})).rejects.toThrow('Sincronize');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('does not advertise preparation with a provisional cash snapshot or changed identity', async () => {
  mocks.cash.mockResolvedValue({ provisional: true });
  await expect(prepareOperationalData(client, context, () => {})).rejects.toThrow('turno');
  expect(mocks.save.mock.calls.some(([, key]) => key.startsWith('readiness:'))).toBe(false);
  await expect(prepareOperationalData(client, context, () => { throw new Error('Conta alterada'); })).rejects.toThrow('Conta alterada');
});
