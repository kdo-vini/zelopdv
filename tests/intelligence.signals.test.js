import { describe, it, expect } from 'vitest';
import { detectSignals } from '../src/lib/server/intelligence/signals.js';
import { makeSnapshot, makeFechamento, makeProduto, zeroMetrics } from './helpers/intelligenceFixtures.js';

/**
 * Constrói um DetectorContext para testes.
 * targetDate default = 2026-07-09 (quinta).
 */
function buildCtx(overrides = {}) {
  return {
    targetDate: overrides.targetDate ?? '2026-07-09',
    today: overrides.today ?? zeroMetrics(),
    history: overrides.history ?? [],
    fechamentos: overrides.fechamentos ?? [],
    produtosEstoque: overrides.produtosEstoque ?? [],
    caixasAbertos: overrides.caixasAbertos ?? [],
    topDevedores: overrides.topDevedores ?? [],
    nowIso: overrides.nowIso ?? '2026-07-09T15:00:00.000Z',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Cria N snapshots para o mesmo weekday com receitas crescentes */
function makeWeekdayRevenues(receitas, targetDate = '2026-07-09', options = {}) {
  const snapshots = [];
  let currentDate = targetDate;
  for (const r of receitas) {
    const [y, m, dd] = currentDate.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, dd - 7, 12, 0, 0));
    const dateStr = prev.toISOString().slice(0, 10);
    snapshots.push(makeSnapshot({
      date: dateStr,
      receitaBruta: r,
      qtd: Math.round(r / 25) || 0,
      userId: options.userId,
    }));
    currentDate = dateStr;
  }
  return snapshots;
}

describe('S1 — REVENUE_BELOW_WEEKDAY_AVG', () => {
  it('emite sinal quando faturamento cai 15%+ abaixo da média do mesmo weekday', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 800, qtd_vendas: 30 },
      history,
    });
    const signals = detectSignals(ctx);
    const s1 = signals.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG');
    expect(s1).toBeDefined();
    expect(s1.severity).toBe('attention');
    expect(s1.confidence).toBeGreaterThan(0.5);
    expect(s1.evidence.delta_pct).toBeLessThan(-0.15);
    expect(s1.evidence.delta_pct).toBeGreaterThan(-0.30);
  });

  it('emite critical quando delta ≤ -0.30', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 300, qtd_vendas: 10 },
      history,
    });
    const signals = detectSignals(ctx);
    const s1 = signals.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG');
    expect(s1).toBeDefined();
    expect(s1.severity).toBe('critical');
    expect(s1.evidence.delta_pct).toBeLessThan(-0.30);
  });

  it('retorna null com amostra histórica insuficiente', () => {
    const history = makeWeekdayRevenues([1000]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 600, qtd_vendas: 20 },
      history,
    });
    const signals = detectSignals(ctx);
    const s1 = signals.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG');
    expect(s1).toBeUndefined();
  });

  it('retorna null em dia provavelmente fechado', () => {
    const history = makeWeekdayRevenues([0, 0, 0, 1000, 0, 0, 0, 0]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 0, qtd_vendas: 0 },
      history,
    });
    const signals = detectSignals(ctx);
    const s1 = signals.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG');
    expect(s1).toBeUndefined();
  });

  it('não gera NaN mesmo com 0 vendas históricas', () => {
    const history = makeWeekdayRevenues([0, 0, 0, 0, 0]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 0, qtd_vendas: 0 },
      history,
    });
    const signals = detectSignals(ctx);
    for (const s of signals) {
      expect(s.evidence.delta_pct == null || Number.isFinite(s.evidence.delta_pct)).toBe(true);
      expect(Number.isFinite(s.confidence)).toBe(true);
    }
  });

  it('isola entre duas empresas', () => {
    const historyA = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000], '2026-07-09', { userId: 'u1' });
    const historyB = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000], '2026-07-09', { userId: 'u2' });
    const ctxA = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 600, qtd_vendas: 20 },
      history: historyA,
    });
    const ctxB = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 1000, qtd_vendas: 40 },
      history: historyB,
    });
    const signalsA = detectSignals(ctxA);
    const signalsB = detectSignals(ctxB);
    expect(signalsA.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG')).toBeDefined();
    expect(signalsB.find((s) => s.type === 'REVENUE_BELOW_WEEKDAY_AVG')).toBeUndefined();
  });
});

describe('S2 — REVENUE_ABOVE_WEEKDAY_AVG', () => {
  it('emite sinal quando faturamento sobe 20%+ acima da média', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000]);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 1500, qtd_vendas: 60 },
      history,
    });
    const signals = detectSignals(ctx);
    const s2 = signals.find((s) => s.type === 'REVENUE_ABOVE_WEEKDAY_AVG');
    expect(s2).toBeDefined();
    expect(s2.evidence.delta_pct).toBeGreaterThan(0.20);
  });

  it('não emite sinal com amostra insuficiente', () => {
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 1500, qtd_vendas: 60 },
      history: makeWeekdayRevenues([1000]),
    });
    expect(detectSignals(ctx).find((s) => s.type === 'REVENUE_ABOVE_WEEKDAY_AVG')).toBeUndefined();
  });
});

describe('S3 — AVG_TICKET_DOWN', () => {
  it('emite sinal quando ticket médio cai 10%+ com volume estável', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000])
      .map((s) => ({ ...s, ticket_medio: 25, qtd_vendas: s.receita_bruta / 25 }));
    // Hoje: volume estável (qtd≈40), ticket caiu 10%
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 900, qtd_vendas: 40, ticket_medio: 22.5 },
      history,
    });
    const s3 = detectSignals(ctx).find((s) => s.type === 'AVG_TICKET_DOWN');
    expect(s3).toBeDefined();
  });

  it('não emite quando qtd vendas está abaixo do mínimo', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000])
      .map((s) => ({ ...s, ticket_medio: 25, qtd_vendas: s.receita_bruta / 25 }));
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 250, qtd_vendas: 5, ticket_medio: 50 },
      history,
    });
    const s3 = detectSignals(ctx).find((s) => s.type === 'AVG_TICKET_DOWN');
    expect(s3).toBeUndefined();
  });

  it('não emite quando qtd cresce muito compensando ticket', () => {
    const history = makeWeekdayRevenues([1000, 1100, 900, 1050, 950, 1000])
      .map((s) => ({ ...s, ticket_medio: 25, qtd_vendas: s.receita_bruta / 25 }));
    // Hoje: ticket caiu mas qtd cresceu bastante (delta_qtd ≥ 0.10)
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 500, qtd_vendas: 50, ticket_medio: 10 },
      history,
    });
    const s3 = detectSignals(ctx).find((s) => s.type === 'AVG_TICKET_DOWN');
    expect(s3).toBeUndefined();
  });
});

describe('S4 — PRODUCT_SALES_DROP', () => {
  function makeProductSnapshots(values, targetDate) {
    return values.map((v) => {
      const snap = makeSnapshot({
        date: v.date,
        receitaBruta: v.produtos.reduce((s, p) => s + p.receita, 0),
        qtd: v.produtos.reduce((s, p) => s + p.qtd, 0),
      });
      snap.metrics.por_produto = v.produtos.map((p) => ({
        id_produto: p.id, nome: p.nome, qtd: p.qtd, receita: p.receita,
      }));
      return snap;
    });
  }

  it('emite sinal para produto com queda de vendas', () => {
    const targetDate = '2026-07-09';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const daysAgo = (n) => new Date(Date.UTC(y, m - 1, dd - n, 12, 0, 0)).toISOString().slice(0, 10);
    const produtos = [];
    for (let i = 1; i <= 35; i++) {
      const date = daysAgo(i);
      const qtd = i <= 7 ? 2 : 10;
      produtos.push({ date, produtos: [{ id: 1, nome: 'X-Tudo', qtd, receita: qtd * 30 }] });
    }
    const history = makeProductSnapshots(produtos, targetDate);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 60, qtd_vendas: 2 },
      history,
    });
    const s4 = detectSignals(ctx).find((s) => s.type === 'PRODUCT_SALES_DROP');
    expect(s4).toBeDefined();
    expect(s4.evidence.id_produto).toBe(1);
    expect(s4.evidence.delta_pct).toBeLessThan(-0.30);
  });

  it('não emite para produto com insuficientes dias com venda', () => {
    const targetDate = '2026-07-09';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const daysAgo = (n) => new Date(Date.UTC(y, m - 1, dd - n, 12, 0, 0)).toISOString().slice(0, 10);
    const produtos = [];
    for (let i = 1; i <= 35; i++) {
      const date = daysAgo(i);
      const diasComVenda = [1, 2, 3, 4];
      const qtd = diasComVenda.includes(i) && i <= 28 ? 10 : 0;
      produtos.push({ date, produtos: [{ id: 2, nome: 'Produto Raro', qtd, receita: qtd * 30 }] });
    }
    const history = makeProductSnapshots(produtos, targetDate);
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 60, qtd_vendas: 2 },
      history,
    });
    const s4 = detectSignals(ctx).filter((s) => s.type === 'PRODUCT_SALES_DROP' && s.evidence.id_produto === 2);
    expect(s4.length).toBe(0);
  });
});

describe('S10 — STOCK_ZERO_WITH_DEMAND', () => {
  it('emite sinal para produto com estoque zero e demanda', () => {
    const targetDate = '2026-07-09';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const produtosEstoque = [makeProduto({ id: 1, nome: 'Coca 2L', estoque: 0 })];
    const history = [];
    for (let i = 1; i <= 7; i++) {
      const date = new Date(Date.UTC(y, m - 1, dd - i, 12, 0, 0)).toISOString().slice(0, 10);
      const snap = makeSnapshot({ date, receitaBruta: 75, qtd: 3 });
      snap.metrics.por_produto = [{ id_produto: 1, nome: 'Coca 2L', qtd: 3, receita: 24 }];
      history.push(snap);
    }
    const ctx = buildCtx({ today: zeroMetrics(), history, produtosEstoque });
    const s10 = detectSignals(ctx).find((s) => s.type === 'STOCK_ZERO_WITH_DEMAND');
    expect(s10).toBeDefined();
    expect(s10.evidence.id_produto).toBe(1);
  });

  it('supressão: S10 suprime S4 do mesmo produto', () => {
    const targetDate = '2026-07-15';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const produtosEstoque = [makeProduto({ id: 1, nome: 'Coca 2L', estoque: 0 })];
    const history = [];
    for (let i = 1; i <= 35; i++) {
      const date = new Date(Date.UTC(y, m - 1, dd - i, 12, 0, 0)).toISOString().slice(0, 10);
      const qtd = i <= 7 ? 2 : 10;
      const snap = makeSnapshot({ date, receitaBruta: qtd * 30, qtd });
      snap.metrics.por_produto = [
        { id_produto: 1, nome: 'Coca 2L', qtd, receita: qtd * 8 },
        { id_produto: 2, nome: 'X-Tudo', qtd: 5, receita: 150 },
      ];
      history.push(snap);
    }
    const ctx = buildCtx({
      targetDate,
      today: { ...zeroMetrics(), receita_bruta: 60, qtd_vendas: 2 },
      history,
      produtosEstoque,
    });
    const signals = detectSignals(ctx);
    expect(signals.find((s) => s.type === 'STOCK_ZERO_WITH_DEMAND')).toBeDefined();
    expect(signals.find(
      (s) => s.type === 'PRODUCT_SALES_DROP' && s.evidence.id_produto === 1
    )).toBeUndefined();
  });
});

describe('S9 — STOCK_COVERAGE_LOW', () => {
  it('emite sinal para produto com estoque baixo e consumo consistente', () => {
    const targetDate = '2026-07-09';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const produtosEstoque = [makeProduto({ id: 1, nome: 'Coca 2L', estoque: 5 })];
    const history = [];
    for (let i = 1; i <= 14; i++) {
      const date = new Date(Date.UTC(y, m - 1, dd - i, 12, 0, 0)).toISOString().slice(0, 10);
      const snap = makeSnapshot({ date, receitaBruta: 75, qtd: 3 });
      snap.metrics.por_produto = [{ id_produto: 1, nome: 'Coca 2L', qtd: 3, receita: 24 }];
      history.push(snap);
    }
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 75, qtd_vendas: 3 },
      history,
      produtosEstoque,
    });
    const s9 = detectSignals(ctx).find((s) => s.type === 'STOCK_COVERAGE_LOW');
    expect(s9).toBeDefined();
    expect(s9.evidence.coverage_days).toBeLessThanOrEqual(2);
    expect(s9.dedupe_key).toBe('STOCK_COVERAGE_LOW:1');
  });

  it('não emite sinal para produto com estoque suficiente', () => {
    const targetDate = '2026-07-09';
    const [y, m, dd] = targetDate.split('-').map(Number);
    const produtosEstoque = [makeProduto({ id: 1, nome: 'Coca 2L', estoque: 100 })];
    const history = [];
    for (let i = 1; i <= 14; i++) {
      const date = new Date(Date.UTC(y, m - 1, dd - i, 12, 0, 0)).toISOString().slice(0, 10);
      const snap = makeSnapshot({ date, receitaBruta: 75, qtd: 3 });
      snap.metrics.por_produto = [{ id_produto: 1, nome: 'Coca 2L', qtd: 3, receita: 24 }];
      history.push(snap);
    }
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 75, qtd_vendas: 3 },
      history,
      produtosEstoque,
    });
    expect(detectSignals(ctx).find((s) => s.type === 'STOCK_COVERAGE_LOW')).toBeUndefined();
  });
});

describe('S5 — TOP_PRODUCT_CONCENTRATION', () => {
  it('emite sinal quando top produto concentra >50% da receita', () => {
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 1000, qtd_vendas: 50 },
      history: [
        makeSnapshot({ date: '2026-07-08', receitaBruta: 500, qtd: 25 }),
        makeSnapshot({ date: '2026-07-07', receitaBruta: 500, qtd: 25 }),
      ].map((s) => {
        s.metrics.por_produto = [
          { id_produto: 1, nome: 'X-Tudo', qtd: 30, receita: 750 },
          { id_produto: 2, nome: 'Coca', qtd: 20, receita: 250 },
        ];
        return s;
      }),
    });
    const s5 = detectSignals(ctx).find((s) => s.type === 'TOP_PRODUCT_CONCENTRATION');
    expect(s5).toBeDefined();
    expect(s5.evidence.id_produto).toBe(1);
  });
});

describe('S7 — FIADO_ISSUED_SHARE_HIGH', () => {
  it('emite sinal quando fiado >15% da receita', () => {
    const ctx = buildCtx({
      today: { ...zeroMetrics(), receita_bruta: 200, qtd_vendas: 8 },
      history: [
        makeSnapshot({ date: '2026-07-08', receitaBruta: 1000, qtd: 40 }),
        makeSnapshot({ date: '2026-07-07', receitaBruta: 800, qtd: 32 }),
      ].map((s) => {
        s.metrics.fiado_emitido = 300;
        return s;
      }),
      topDevedores: [{ nome: 'João', saldo_fiado: 250 }],
    });
    const s7 = detectSignals(ctx).find((s) => s.type === 'FIADO_ISSUED_SHARE_HIGH');
    expect(s7).toBeDefined();
    expect(s7.evidence.share_pct).toBeGreaterThan(0.15);
  });
});

describe('S8 — CASH_DIFFERENCE_RECURRING', () => {
  it('emite sinal quando ≥4 de 10 fechamentos têm diferença >R$5', () => {
    const fechamentos = Array.from({ length: 10 }, (_, i) =>
      makeFechamento({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, diferenca: i < 5 ? 10 : 1 })
    );
    const ctx = buildCtx({
      today: zeroMetrics(),
      history: [makeSnapshot({ date: '2026-07-09', receitaBruta: 0, qtd: 0 })],
      fechamentos,
    });
    const s8 = detectSignals(ctx).find((s) => s.type === 'CASH_DIFFERENCE_RECURRING');
    expect(s8).toBeDefined();
    expect(s8.evidence.n_with_difference).toBeGreaterThanOrEqual(4);
  });
});

describe('S11 — CAIXA_LEFT_OPEN', () => {
  it('emite sinal quando caixa está aberto há ≥16 horas', () => {
    const ctx = buildCtx({
      today: zeroMetrics(),
      history: [makeSnapshot({ date: '2026-07-08', receitaBruta: 0, qtd: 0 })],
      caixasAbertos: [{ id: 1, data_abertura: '2026-07-08T20:00:00.000Z', valor_inicial: 100 }],
      nowIso: '2026-07-09T15:00:00.000Z',
    });
    const s11 = detectSignals(ctx).find((s) => s.type === 'CAIXA_LEFT_OPEN');
    expect(s11).toBeDefined();
    expect(s11.evidence.horas_aberto).toBeGreaterThanOrEqual(16);
  });
});

describe('empresa sem histórico', () => {
  it('não gera sinais para empresa sem histórico', () => {
    const signals = detectSignals(buildCtx({ history: [] }));
    expect(signals.length).toBe(0);
  });
});

describe('divisão por zero', () => {
  it('nenhum sinal gera NaN ou Infinity em confidence ou evidence', () => {
    const ctx = buildCtx({
      today: zeroMetrics(),
      history: [
        makeSnapshot({ date: '2026-07-08', receitaBruta: 0, qtd: 0 }),
        makeSnapshot({ date: '2026-07-07', receitaBruta: 0, qtd: 0 }),
        makeSnapshot({ date: '2026-07-06', receitaBruta: 0, qtd: 0 }),
        makeSnapshot({ date: '2026-07-05', receitaBruta: 100, qtd: 4 }),
      ],
    });
    const signals = detectSignals(ctx);
    for (const s of signals) {
      expect(Number.isFinite(s.confidence)).toBe(true);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      for (const [k, v] of Object.entries(s.evidence)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v)).toBe(true, `evidence.${k} is not finite`);
        }
      }
    }
  });
});
