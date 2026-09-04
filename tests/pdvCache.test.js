import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/lib/supabaseClient', () => ({ supabase: { from: query } }));
import { pdvCache } from '../src/lib/stores/pdvCache.js';

function response(result) {
  const chain = { select: () => chain, order: () => Promise.resolve(result) };
  return chain;
}
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
    const chain = { select: () => chain, order: () => pending };
    query.mockReturnValueOnce(chain);
    const request = pdvCache.getCategorias();
    pdvCache.setUserId('owner-b');
    complete({ data: [{ id: 1, nome: 'Owner A' }], error: null });
    await expect(request).rejects.toThrow('Conta alterada');
    query.mockReturnValueOnce(response({ data: [{ id: 2, nome: 'Owner B' }], error: null }));
    expect(await pdvCache.getCategorias()).toEqual([{ id: 2, nome: 'Owner B' }]);
  });
});
