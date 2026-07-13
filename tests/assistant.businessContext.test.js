import { describe, expect, it } from 'vitest';
import { buildCatalogSalesContext, buildStockContext } from '../src/lib/server/assistant/businessContext.js';

describe('assistant business context', () => {
  it('derives a category average from all registered sale items', () => {
    const context = buildCatalogSalesContext({
      vendas: [
        { id: 1, valor_total: 20, forma_pagamento: 'pix' },
        { id: 2, valor_total: 30, forma_pagamento: 'dinheiro' },
      ],
      itens: [
        { id_venda: 1, id_produto: 11, nome_produto_na_venda: 'Coxinha', quantidade: 4, preco_unitario_na_venda: 3 },
        { id_venda: 1, id_produto: 12, nome_produto_na_venda: 'Refrigerante', quantidade: 1, preco_unitario_na_venda: 8 },
        { id_venda: 2, id_produto: 11, nome_produto_na_venda: 'Coxinha', quantidade: 2, preco_unitario_na_venda: 3 },
        { id_venda: 2, id_produto: 12, nome_produto_na_venda: 'Refrigerante', quantidade: 3, preco_unitario_na_venda: 8 },
      ],
      pagamentos: [],
      produtos: [
        { id: 11, nome: 'Coxinha', id_categoria: 1 },
        { id: 12, nome: 'Refrigerante', id_categoria: 2 },
      ],
      categorias: [{ id: 1, nome: 'Salgados' }, { id: 2, nome: 'Bebidas' }],
    });

    expect(context.catalogo).toEqual({ produtos_cadastrados: 2, categorias_cadastradas: 2, produtos_sem_categoria: 0 });
    expect(context.categorias).toContainEqual(expect.objectContaining({
      nome: 'Salgados', unidades_vendidas_30d: 6, media_unidades_por_venda: 3,
    }));
    expect(context.itens_vendidos).toEqual(expect.objectContaining({ unidades_registradas: 10, media_itens_por_venda: 5 }));
  });

  it('builds an auditable aggregate when real category labels share a term', () => {
    const context = buildCatalogSalesContext({
      vendas: [{ id: 1, valor_total: 18, forma_pagamento: 'pix' }, { id: 2, valor_total: 12, forma_pagamento: 'pix' }],
      itens: [
        { id_venda: 1, id_produto: 11, nome_produto_na_venda: 'Coxinha', quantidade: 4, preco_unitario_na_venda: 3 },
        { id_venda: 2, id_produto: 12, nome_produto_na_venda: 'Bolinha de queijo', quantidade: 2, preco_unitario_na_venda: 3 },
      ],
      produtos: [
        { id: 11, nome: 'Coxinha', id_categoria: 1 },
        { id: 12, nome: 'Bolinha de queijo', id_categoria: 2 },
      ],
      categorias: [{ id: 1, nome: 'Salgados Grandes' }, { id: 2, nome: 'Salgado Mini' }],
    });

    expect(context.grupos_de_categorias).toContainEqual({
      termo: 'salgado',
      categorias: ['Salgado Mini', 'Salgados Grandes'],
      unidades_vendidas_30d: 6,
      receita_30d: 18,
      media_unidades_por_venda: 3,
    });
  });

  it('does not infer categories from product names when a product is uncategorized', () => {
    const context = buildCatalogSalesContext({
      vendas: [{ id: 1, valor_total: 10, forma_pagamento: 'pix' }],
      itens: [{ id_venda: 1, id_produto: 11, nome_produto_na_venda: 'Cento de salgados', quantidade: 1, preco_unitario_na_venda: 10 }],
      produtos: [{ id: 11, nome: 'Cento de salgados', id_categoria: null }],
      categorias: [],
    });

    expect(context.categorias).toEqual([]);
    expect(context.catalogo.produtos_sem_categoria).toBe(1);
  });

  it('uses a category shared balance instead of an individual product balance', () => {
    const stock = buildStockContext({
      categorias: [{ id: 1, nome: 'Salgados', controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 18 }],
      produtos: [
        { nome: 'Coxinha', id_categoria: 1, controlar_estoque: true, estoque_atual: 999 },
        { nome: 'Refrigerante', id_categoria: null, controlar_estoque: true, estoque_atual: 4 },
      ],
    });

    expect(stock).toEqual([
      { nome: 'Refrigerante', estoque_atual: 4, origem: 'produto' },
      { nome: 'Salgados', estoque_atual: 18, origem: 'categoria_compartilhada' },
    ]);
  });
});
