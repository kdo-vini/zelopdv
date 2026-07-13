import { describe, expect, it } from 'vitest';
import { buildActiveSignalsContext, buildCatalogSalesContext, buildMonthOverMonthContext, buildPeakHoursContext, buildRecentDaysContext, buildStockContext } from '../src/lib/server/assistant/businessContext.js';

describe('assistant business context', () => {
  describe('buildActiveSignalsContext', () => {
    it('keeps only the most recent signal_date and excludes muted types, humanizing severity', () => {
      const signals = [
        { type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical', signal_date: '2026-07-09', narrative: 'X-Bacon zerou o estoque.' },
        { type: 'REVENUE_ABOVE_WEEKDAY_AVG', severity: 'info', signal_date: '2026-07-09' },
        { type: 'FIADO_ISSUED_SHARE_HIGH', severity: 'attention', signal_date: '2026-07-09' },
        { type: 'CASH_DIFFERENCE_RECURRING', severity: 'critical', signal_date: '2026-07-08' }, // older day — excluded
      ];

      const result = buildActiveSignalsContext({ signals, mutedTypes: ['FIADO_ISSUED_SHARE_HIGH'] });

      expect(result).toEqual([
        { severidade: 'Precisa de você', narrativa: 'X-Bacon zerou o estoque.' },
        { severidade: 'Pra saber', narrativa: expect.stringContaining('R$') },
      ]);
    });

    it('falls back to templateNarrative when the row has no stored narrative', () => {
      const result = buildActiveSignalsContext({
        signals: [{ type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical', signal_date: '2026-07-09', evidence: { nome_produto: 'Coxinha', estoque_atual: 0, dias_com_venda_7d: 5, consumo_diario_medio_7d: 3 } }],
      });

      expect(result[0].narrativa).toContain('Coxinha');
    });

    it('returns an empty list when there are no signals', () => {
      expect(buildActiveSignalsContext({ signals: [] })).toEqual([]);
    });
  });
  describe('buildRecentDaysContext', () => {
    // 2026-07-09 is a Thursday; "yesterday" from that reference is 2026-07-08 (Wednesday).
    const todayIso = '2026-07-09T15:00:00.000Z';

    function saleOn(localDate, valor) {
      return { created_at: `${localDate}T18:00:00.000Z`, valor_total: valor };
    }

    it('reports yesterday and a same-weekday average from prior weeks, excluding today and yesterday', () => {
      const vendas = [
        saleOn('2026-07-08', 100), // yesterday (Wednesday)
        saleOn('2026-07-01', 60), // last Wednesday
        saleOn('2026-06-24', 40), // Wednesday before that
        saleOn('2026-07-07', 200), // Tuesday — different weekday, only counts toward the general daily average
        saleOn('2026-07-09', 999), // "today" — must be excluded entirely
      ];

      const result = buildRecentDaysContext({ vendas, todayIso });

      expect(result.ontem).toEqual({ data: '2026-07-08', receita: 100, quantidade: 1 });
      expect(result.media_mesmo_dia_semana).toEqual({ receita: 50, quantidade: 1, dias_considerados: 2 });
      expect(result.media_diaria_periodo).toEqual({ receita: 100, quantidade: 1, dias_considerados: 3 });
    });

    it('returns a zeroed yesterday and null averages when there is no sales history', () => {
      const result = buildRecentDaysContext({ vendas: [], todayIso });

      expect(result.ontem).toEqual({ data: '2026-07-08', receita: 0, quantidade: 0 });
      expect(result.media_mesmo_dia_semana).toBeNull();
      expect(result.media_diaria_periodo).toBeNull();
    });
  });

  describe('buildPeakHoursContext', () => {
    // America/Sao_Paulo is UTC-3 with no DST, so 18:00Z = 15h local, 22:00Z = 19h local.
    function saleAt(isoHourUtc) {
      return { created_at: `2026-07-08T${isoHourUtc}:00:00.000Z`, valor_total: 10 };
    }

    it('ranks local hours by sale count and reports each hour\'s share of the total', () => {
      const vendas = [saleAt('18'), saleAt('18'), saleAt('18'), saleAt('22'), saleAt('22'), saleAt('12')];

      const result = buildPeakHoursContext({ vendas });

      expect(result.top_horarios).toEqual([
        { hora: 15, vendas: 3, participacao: 0.5 },
        { hora: 19, vendas: 2, participacao: 0.33 },
        { hora: 9, vendas: 1, participacao: 0.17 },
      ]);
    });

    it('returns null when there is no sales history', () => {
      expect(buildPeakHoursContext({ vendas: [] })).toBeNull();
    });
  });

  describe('buildMonthOverMonthContext', () => {
    it('computes revenue and expense deltas against the previous month', () => {
      const result = buildMonthOverMonthContext({
        receitaMesAtual: 1200, receitaMesAnterior: 1000,
        despesasMesAtual: 300, despesasMesAnterior: 400,
      });

      expect(result).toEqual({
        receita_mes_atual: 1200, receita_mes_anterior: 1000, delta_receita_pct: 0.2,
        despesas_mes_atual: 300, despesas_mes_anterior: 400, delta_despesas_pct: -0.25,
      });
    });

    it('reports a null delta instead of dividing by zero when there is no prior-month data', () => {
      const result = buildMonthOverMonthContext({ receitaMesAtual: 500, receitaMesAnterior: 0, despesasMesAtual: 100, despesasMesAnterior: 0 });

      expect(result.delta_receita_pct).toBeNull();
      expect(result.delta_despesas_pct).toBeNull();
    });
  });
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
