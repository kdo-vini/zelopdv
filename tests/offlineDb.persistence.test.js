import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  db, atualizarCacheProdutos, buscarProdutosLocal, atualizarCacheCategorias,
  buscarCategoriasLocal, atualizarCacheSubcategorias, buscarSubcategoriasLocal,
  syncVendasPendentes, contarVendasPendentes,
  listarItensPizzaPendentes,
} from '../src/lib/offlineDb.js';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

describe('persistent offline catalog', () => {
  it.each([
    ['produtos', atualizarCacheProdutos, (owner) => buscarProdutosLocal('', owner)],
    ['categorias', atualizarCacheCategorias, buscarCategoriasLocal],
    ['subcategorias', atualizarCacheSubcategorias, buscarSubcategoriasLocal],
  ])('%s never returns another owner or unscoped legacy rows', async (name, save, read) => {
    await db[name].add({ id: 99, nome: 'Legacy' });
    expect(await read('owner-b')).toEqual([]);
    await save([{ id: 1, nome: 'Private catalog' }], 'owner-a');
    expect(await read('owner-a')).toEqual([expect.objectContaining({ id: 1 })]);
    expect(await read('owner-b')).toEqual([]);
    expect(await read()).toEqual([]);
    await save([], 'owner-a');
    expect(await read('owner-a')).toEqual([]);
  });

  it('keeps the previous catalog if replacement fails', async () => {
    await atualizarCacheProdutos([{ id: 1, nome: 'Existing' }], 'owner-a');
    await expect(atualizarCacheProdutos([{ id: 2 }, { id: 2 }], 'owner-a')).rejects.toThrow();
    expect(await buscarProdutosLocal('', 'owner-a')).toEqual([expect.objectContaining({ id: 1 })]);
  });
});

describe('offline replay', () => {
  it('reserves only pending pizza items from the same owner', async () => {
    const pizzaItem = { id_produto: 1, quantidade: 2, pizza: { stockProductId: 9 } };
    await db.vendas_pendentes.bulkAdd([
      { ownerUserId: 'owner-a', status: 'aguardando', payload: { itens: [pizzaItem, { id_produto: 5 }] } },
      { ownerUserId: 'owner-b', status: 'aguardando', payload: { itens: [pizzaItem] } },
      { ownerUserId: 'owner-a', status: 'sincronizada', payload: { itens: [pizzaItem] } },
      { status: 'aguardando', payload: { itens: [pizzaItem] } }
    ]);
    expect(await listarItensPizzaPendentes('owner-a')).toEqual([pizzaItem]);
    expect(await listarItensPizzaPendentes(null)).toEqual([]);
  });
  it('persists the legacy idempotency key before a request with an uncertain result', async () => {
    const id = await db.vendas_pendentes.add({
      ownerUserId: 'owner-a', status: 'aguardando', createdAt: '2026-09-01T10:00:00Z',
      payload: { valor_total: 10 },
    });
    const persistedKeys = [];
    const rpc = vi.fn(async (_name, { p_payload }) => {
      const persisted = await db.vendas_pendentes.get(id);
      persistedKeys.push([persisted.payload.client_sale_id, p_payload.client_sale_id]);
      return { error: new TypeError('Failed to fetch') };
    });
    await syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' });
    await syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(persistedKeys).toHaveLength(2);
    for (const [persisted, submitted] of persistedKeys) expect(persisted).toBe(submitted);
    expect(rpc.mock.calls[0][1].p_payload.client_sale_id).toBeTruthy();
    expect(rpc.mock.calls[0][1].p_payload.client_sale_id).toBe(rpc.mock.calls[1][1].p_payload.client_sale_id);
    expect(await db.vendas_pendentes.get(id)).toBeDefined();
  });

  it('concurrent replay persists one idempotency key for the same legacy record', async () => {
    const id = await db.vendas_pendentes.add({ ownerUserId: 'owner-a', status: 'aguardando', payload: { valor_total: 10 } });
    const rpc = vi.fn().mockResolvedValue({ error: new TypeError('Failed to fetch') });
    await Promise.all([
      syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' }),
      syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' }),
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
    const keys = rpc.mock.calls.map(([, { p_payload }]) => p_payload.client_sale_id);
    expect(new Set(keys).size).toBe(1);
    expect((await db.vendas_pendentes.get(id)).payload.client_sale_id).toBe(keys[0]);
  });

  it('retains unowned and other-owner sales without replaying into the active tenant', async () => {
    await db.vendas_pendentes.bulkAdd([
      { status: 'aguardando', ownerUserId: 'owner-b', payload: { client_sale_id: 'b' } },
      { status: 'aguardando', payload: { client_sale_id: 'unknown' } },
    ]);
    const rpc = vi.fn().mockResolvedValue({ data: { id: 12 } });
    expect(await syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' })).toEqual({ success: 0, fail: 0, skipped: 2 });
    expect(await syncVendasPendentes({ rpc })).toEqual({ success: 0, fail: 0, skipped: 2 });
    expect(rpc).not.toHaveBeenCalled();
    expect(await db.vendas_pendentes.count()).toBe(2);
    expect(await contarVendasPendentes('owner-a')).toBe(0);
    expect(await contarVendasPendentes('owner-b')).toBe(1);
  });

  it('removes only a sale acknowledged with a persisted id', async () => {
    const id = await db.vendas_pendentes.add({ status: 'aguardando', ownerUserId: 'owner-a', payload: { client_sale_id: 'stable' } });
    const rpc = vi.fn().mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { id: 42 } });
    await syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' });
    expect(await db.vendas_pendentes.get(id)).toBeDefined();
    await syncVendasPendentes({ rpc }, { ownerUserId: 'owner-a' });
    expect(await db.vendas_pendentes.get(id)).toBeUndefined();
  });
});
