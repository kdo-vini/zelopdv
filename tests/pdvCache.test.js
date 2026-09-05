import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/lib/supabaseClient', () => ({ supabase: { from: query } }));
import { pdvCache } from '../src/lib/stores/pdvCache.js';
import { get } from 'svelte/store';

function response(result) {
  const chain = { select: () => chain, eq: () => chain, order: () => chain,
    range: () => Promise.resolve(result), then: (resolve) => Promise.resolve(result).then(resolve) };
  return chain;
}

function pagedDatabase(tables, beforeResponse = () => {}) {
  const calls = [];
  query.mockImplementation((table) => {
    const filters = [];
    const orders = [];
    let from = 0;
    let to = 999; // PostgREST's default cap, reproduced without network access.
    const chain = {
      select: () => chain,
      eq: (column, value) => { filters.push({ column, values: [value] }); return chain; },
      in: (column, values) => { filters.push({ column, values }); return chain; },
      order: (column) => { orders.push(column); return chain; },
      range: (start, end) => { from = start; to = end; return chain; },
      then: async (resolve, reject) => {
        const call = { table, filters, orders, from, to };
        calls.push(call);
        try {
          const failure = await beforeResponse(call);
          const rows = (tables[table] || []).filter((row) => filters.every(({ column, values }) => values.includes(row[column])));
          rows.sort((a, b) => {
            for (const column of orders) {
              if (a[column] < b[column]) return -1;
              if (a[column] > b[column]) return 1;
            }
            return 0;
          });
          return resolve(failure || { data: rows.slice(from, to + 1), error: null });
        } catch (error) { return reject(error); }
      },
    };
    return chain;
  });
  return calls;
}

const rows = (count, extra = {}) => Array.from({ length: count }, (_, index) => ({
  id: index + 1, id_usuario: 'owner-a', nome: 'Same name', ordem: 0, ...extra,
}));
beforeEach(() => {
  pdvCache.invalidateAll();
  pdvCache.setUserId('owner-a');
  query.mockReset();
});

describe('PDV memory cache', () => {
  it('does not reuse stale data after authorization or backend errors', async () => {
    query.mockReturnValueOnce(response({ data: [{ id: 1 }], error: null }));
    await pdvCache.getCategorias();
    const error = { code: '42501', message: 'permission denied' };
    query.mockReturnValueOnce(response({ data: null, error }));
    await expect(pdvCache.getCategorias(true)).rejects.toEqual(error);
  });

  it('caches an authoritative empty result', async () => {
    query.mockReturnValue(response({ data: [], error: null }));
    expect(await pdvCache.getCategorias()).toEqual([]);
    expect(await pdvCache.getCategorias()).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight response when the account changes', async () => {
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    const chain = { select: () => chain, eq: () => chain, order: () => chain, range: () => pending };
    query.mockReturnValueOnce(chain);
    const request = pdvCache.getCategorias();
    pdvCache.setUserId('owner-b');
    complete({ data: [{ id: 1, nome: 'Owner A' }], error: null });
    await expect(request).rejects.toThrow('Conta alterada');
    query.mockReturnValueOnce(response({ data: [{ id: 2, nome: 'Owner B' }], error: null }));
    expect(await pdvCache.getCategorias()).toEqual([{ id: 2, nome: 'Owner B' }]);
  });

  it.each(['getCategorias', 'getSubcategorias', 'getProdutos'])('loads all 1250 rows through %s, scoped and stably ordered', async (method) => {
    const table = { getCategorias: 'categorias', getSubcategorias: 'subcategorias', getProdutos: 'produtos' }[method];
    const expected = rows(1250, { ocultar_no_pdv: false });
    const calls = pagedDatabase({ [table]: [...expected, { ...expected[0], id: 9000, id_usuario: 'other-owner' }] });
    const result = await pdvCache[method]();
    expect(result.map((row) => row.id)).toEqual(expected.map((row) => row.id));
    const pages = calls.filter((call) => call.table === table);
    expect(pages.map(({ from, to }) => [from, to])).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(pages.every(({ orders, filters }) => orders.at(-1) === 'id' && filters.some((filter) => filter.column === 'id_usuario' && filter.values[0] === 'owner-a'))).toBe(true);
  });

  it('preserves the complete previous snapshot when page two fails', async () => {
    pagedDatabase({ categorias: rows(2) });
    await pdvCache.getCategorias();
    const previous = get(pdvCache).categorias;
    const error = { code: '08006', message: 'connection lost on page two' };
    pagedDatabase({ categorias: rows(1250) }, ({ from }) => from === 500 ? { data: null, error } : undefined);
    await expect(pdvCache.getCategorias(true)).rejects.toEqual(error);
    expect(get(pdvCache).categorias).toEqual(previous);
  });

  it.each([false, true])('discards pages after switching owner (including switch back: %s)', async (switchBack) => {
    const calls = pagedDatabase({ categorias: rows(1250) }, ({ from }) => {
      if (from === 500) {
        pdvCache.setUserId('owner-b');
        if (switchBack) pdvCache.setUserId('owner-a');
      }
    });
    await expect(pdvCache.getCategorias()).rejects.toThrow('Conta alterada');
    expect(calls).toHaveLength(2);
    expect(get(pdvCache).categorias.data).toEqual([]);
    expect(get(pdvCache).categorias.loadedAt).toBeNull();
  });

  it('paginates modifier groups and options, chunks all IN queries and resolves hidden linked products', async () => {
    const products = rows(1205, { ocultar_no_pdv: false });
    const groups = rows(1205, { nome: 'Extras', id_produto: 1 }).map((row) => ({ ...row, id: `g${String(row.id).padStart(4, '0')}` }));
    const options = rows(1205, { nome: 'Option', id_grupo: groups[0].id }).map((row) => ({ ...row, id: `o${String(row.id).padStart(4, '0')}` }));
    const links = options.map((option, index) => ({ id_usuario: 'owner-a', id_opcao: option.id, id_produto: index + 5000 }));
    const hidden = rows(1205, { ocultar_no_pdv: true, preco: 4 }).map((row, index) => ({ ...row, id: index + 5000, nome: `Hidden ${index}` }));
    const calls = pagedDatabase({ produtos: [...products, ...hidden], zelomenu_modifier_groups: groups,
      zelomenu_modifier_options: options, zelomenu_modifier_option_products: links });
    const result = await pdvCache.getProdutos();
    expect(result).toHaveLength(1205);
    expect(result[0].modifierGroups).toHaveLength(1205);
    const actualOptions = result[0].modifierGroups.find((group) => group.id === groups[0].id).options;
    expect(actualOptions).toHaveLength(1205);
    expect(actualOptions.at(-1).linkedProduct).toMatchObject({ name: 'Hidden 1204', price: 4, available: true });
    expect(calls.every(({ filters, to, from }) => to - from === 499 && filters.every((filter) => filter.values.length <= 100))).toBe(true);
    expect(calls.every(({ filters }) => filters.some((filter) => filter.column === 'id_usuario' && filter.values[0] === 'owner-a'))).toBe(true);
  });

  it('does not publish products when the second modifier page fails', async () => {
    const error = { code: '08006', message: 'modifier page unavailable' };
    pagedDatabase({ produtos: rows(1, { ocultar_no_pdv: false }),
      zelomenu_modifier_groups: rows(1250, { id_produto: 1 }) }, ({ table, from }) =>
      table === 'zelomenu_modifier_groups' && from === 500 ? { data: null, error } : undefined);
    await expect(pdvCache.getProdutos()).rejects.toEqual(error);
    expect(get(pdvCache).produtos).toEqual({ data: [], loadedAt: null });
  });

  it('requires an owner before querying the catalog', async () => {
    pdvCache.invalidateAll();
    await expect(pdvCache.getProdutos()).rejects.toThrow('Identifique a conta');
    expect(query).not.toHaveBeenCalled();
  });
});
