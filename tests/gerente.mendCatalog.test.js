import { describe, expect, it, vi } from 'vitest';
import { handleMendCatalogAction, summarizeDeleteResult } from '../src/lib/server/gerente/mendCatalog.js';

vi.mock('../src/lib/server/gerente/phoneLinks.js', () => ({
  resolveOwnerByPhone: vi.fn(async () => 'owner-1'),
  completePairing: vi.fn(async () => ({ ok: true, ownerUserId: 'owner-1' })),
}));

vi.mock('../src/lib/server/gerente/tools/catalog.js', () => ({
  buscarProduto: vi.fn(async () => ({
    ok: true,
    data: { produtos: [{ id: 9, nome: 'Mini pizza' }] },
  })),
  prepararExclusaoCatalogo: vi.fn(async () => ({
    ok: true,
    data: {
      produto_ids: [9],
      categoria_ids: [],
      excluir: [{ id: 9, nome: 'Mini pizza' }],
      arquivar: [],
    },
  })),
  excluirCatalogo: vi.fn(async () => ({
    ok: true,
    data: { excluidos: [{ id: 9 }], arquivados: [], categorias_excluidas: [] },
    before: {},
  })),
}));

vi.mock('../src/lib/subscriptionStatus.js', () => ({
  isSubscriptionActiveStrict: () => true,
}));

describe('handleMendCatalogAction', () => {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [{ status: 'active' }], error: null }),
          }),
        }),
      }),
    }),
  };

  it('searches products for a paired owner', async () => {
    const result = await handleMendCatalogAction({
      db,
      action: 'search',
      phone: '11999999999',
      termo: 'mini pizza',
    });
    expect(result.ok).toBe(true);
    expect(result.produtos[0].nome).toBe('Mini pizza');
  });

  it('summarizes delete results for Mend copy', () => {
    expect(
      summarizeDeleteResult({
        excluidos: [1],
        arquivados: [2, 3],
        categorias_excluidas: [],
      }),
    ).toContain('1 produto(s) excluído(s)');
  });
});
