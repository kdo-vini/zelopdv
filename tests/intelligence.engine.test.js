import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDaily } from '../src/lib/server/intelligence/engine.js';
import * as fetchers from '../src/lib/server/intelligence/fetchers.js';

// ── Mock Supabase client ────────────────────────────────────────────────
const mockDb = {};

// ── Fixtures ─────────────────────────────────────────────────────────────
function makeVenda(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    id_usuario: overrides.userId ?? 'u1',
    valor_total: overrides.valorTotal ?? 1000,
    forma_pagamento: overrides.forma ?? 'pix',
    created_at: overrides.createdAt ?? '2026-07-09T15:00:00.000Z',
    valor_desconto: overrides.desconto ?? 0,
    tipo_pedido: overrides.tipoPedido ?? null,
    taxa_entrega: overrides.taxaEntrega ?? 0,
  };
}

function makeSnapshot(overrides = {}) {
  const date = overrides.date ?? '2026-07-08';
  const receita = overrides.receitaBruta ?? 1000;
  const qtd = overrides.qtd ?? 40;
  return {
    user_id: overrides.userId ?? 'u1',
    snapshot_date: date,
    receita_bruta: receita,
    receita_realizada: receita,
    qtd_vendas: qtd,
    ticket_medio: qtd > 0 ? receita / qtd : null,
    fiado_saldo_total: overrides.fiadoSaldo ?? null,
    metrics: {
      receita_bruta: receita,
      receita_realizada: receita,
      qtd_vendas: qtd,
      ticket_medio: qtd > 0 ? receita / qtd : null,
      fiado_emitido: 0,
      fiado_saldo_total: overrides.fiadoSaldo ?? null,
      descontos: 0,
      taxa_entrega: 0,
      custos_plataforma: 0,
      mix_pagamentos: { pix: receita, dinheiro: 0, cartao: 0, fiado: 0, outros: 0 },
      por_produto: [],
      por_hora: new Array(24).fill(0),
      backfilled: false,
    },
    engine_version: 'v1.0.0',
    computed_at: '2026-07-09T04:00:00.000Z',
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('runDaily', () => {
  it('processa empresa habilitada', async () => {
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([
      { id: 'u1' },
    ]);
    vi.spyOn(fetchers, 'fetchVendas').mockResolvedValue([
      makeVenda({ id: 1, valorTotal: 1000, createdAt: '2026-07-10T15:00:00.000Z' }),
      makeVenda({ id: 2, valorTotal: 2000, createdAt: '2026-07-10T16:00:00.000Z' }),
    ]);
    vi.spyOn(fetchers, 'fetchVendasItens').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasPagamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasTaxas').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixaFechamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchProdutosEstoque').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixasAbertos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchTopDevedores').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchSaldoFiadoTotal').mockResolvedValue(0);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(true);
    vi.spyOn(fetchers, 'upsertSnapshot').mockResolvedValue(undefined);
    vi.spyOn(fetchers, 'fetchSnapshots').mockResolvedValue([
      makeSnapshot({ date: '2026-07-08', receitaBruta: 1000, qtd: 40 }),
      makeSnapshot({ date: '2026-07-07', receitaBruta: 1000, qtd: 40 }),
      makeSnapshot({ date: '2026-07-06', receitaBruta: 1000, qtd: 40 }),
      makeSnapshot({ date: '2026-07-05', receitaBruta: 1000, qtd: 40 }),
      makeSnapshot({ date: '2026-07-04', receitaBruta: 1000, qtd: 40 }),
    ]);
    vi.spyOn(fetchers, 'insertSignals').mockResolvedValue({ inserted: 0, errors: 0 });
    vi.spyOn(fetchers, 'fetchLastSignalDates').mockResolvedValue(new Map());
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    const result = await runDaily(mockDb, '2026-07-10');
    expect(result.companies_scanned).toBe(1);
    expect(result.companies_processed).toBe(1);
    expect(result.companies_failed).toBe(0);
  });

  it('não processa quando não há empresas elegíveis', async () => {
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([]);
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    const result = await runDaily(mockDb, '2026-07-10');
    expect(result.companies_scanned).toBe(0);
    expect(result.companies_processed).toBe(0);
  });

  it('reprocessamento idempotente (upsert não duplica)', async () => {
    const upsertCalls = [];
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([
      { id: 'u1' },
    ]);
    vi.spyOn(fetchers, 'fetchVendas').mockResolvedValue([
      makeVenda({ id: 1, valorTotal: 1000, createdAt: '2026-07-10T15:00:00.000Z' }),
    ]);
    vi.spyOn(fetchers, 'fetchVendasItens').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasPagamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasTaxas').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixaFechamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchProdutosEstoque').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixasAbertos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchTopDevedores').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchSaldoFiadoTotal').mockResolvedValue(0);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(true);
    vi.spyOn(fetchers, 'upsertSnapshot').mockImplementation(async (snap) => {
      upsertCalls.push(snap);
    });
    vi.spyOn(fetchers, 'fetchSnapshots').mockResolvedValue([
      makeSnapshot({ date: '2026-07-08', receitaBruta: 1000, qtd: 40 }),
    ]);
    vi.spyOn(fetchers, 'insertSignals').mockResolvedValue({ inserted: 1, errors: 0 });
    vi.spyOn(fetchers, 'fetchLastSignalDates').mockResolvedValue(new Map());
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    // Primeira execução
    await runDaily(mockDb, '2026-07-10');
    const firstRunCalls = upsertCalls.length;

    // Segunda execução (mesma data)
    upsertCalls.length = 0;
    await runDaily(mockDb, '2026-07-10');
    const secondRunCalls = upsertCalls.length;

    // Ambas as execuções devem upsert 3 snapshots (D-3, D-2, D-1)
    expect(firstRunCalls).toBe(3);
    expect(secondRunCalls).toBe(3);
  });

  it('isola erro de uma empresa sem afetar outras', async () => {
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([
      { id: 'u1' },
      { id: 'u2' },
    ]);
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    // u1 falha
    vi.spyOn(fetchers, 'fetchVendas')
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValue([
        makeVenda({ id: 3, userId: 'u2', valorTotal: 500, createdAt: '2026-07-10T15:00:00.000Z' }),
      ]);

    // u2 ok — precisamos mockar os outros fetchers
    vi.spyOn(fetchers, 'fetchVendasItens').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasPagamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasTaxas').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixaFechamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchProdutosEstoque').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixasAbertos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchTopDevedores').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchSaldoFiadoTotal').mockResolvedValue(0);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(true);
    vi.spyOn(fetchers, 'upsertSnapshot').mockResolvedValue(undefined);
    vi.spyOn(fetchers, 'fetchSnapshots').mockResolvedValue([]);
    vi.spyOn(fetchers, 'insertSignals').mockResolvedValue({ inserted: 0, errors: 0 });
    vi.spyOn(fetchers, 'fetchLastSignalDates').mockResolvedValue(new Map());

    const result = await runDaily(mockDb, '2026-07-10');
    expect(result.companies_scanned).toBe(2);
    expect(result.companies_failed).toBe(1);
    expect(result.companies_processed).toBe(1); // u2 processa mesmo com erro em u1
    expect(result.errors.length).toBe(1);
  });

  it('A empresa B não vaza dados para empresa A (multi-tenant)', async () => {
    let vendasCalls = [];
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([
      { id: 'u_a' },
      { id: 'u_b' },
    ]);
    vi.spyOn(fetchers, 'fetchVendas').mockImplementation(async (db, userId) => {
      vendasCalls.push(userId);
      if (userId === 'u_a') {
        return [makeVenda({ id: 1, userId: 'u_a', valorTotal: 1000, createdAt: '2026-07-10T15:00:00.000Z' })];
      }
      return [makeVenda({ id: 2, userId: 'u_b', valorTotal: 2000, createdAt: '2026-07-10T15:00:00.000Z' })];
    });
    vi.spyOn(fetchers, 'fetchVendasItens').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasPagamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasTaxas').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixaFechamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchProdutosEstoque').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixasAbertos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchTopDevedores').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchSaldoFiadoTotal').mockResolvedValue(0);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(true);
    vi.spyOn(fetchers, 'upsertSnapshot').mockResolvedValue(undefined);
    vi.spyOn(fetchers, 'fetchSnapshots').mockResolvedValue([]);
    vi.spyOn(fetchers, 'insertSignals').mockResolvedValue({ inserted: 0, errors: 0 });
    vi.spyOn(fetchers, 'fetchLastSignalDates').mockResolvedValue(new Map());
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    await runDaily(mockDb, '2026-07-10');
    expect(vendasCalls).toEqual(['u_a', 'u_b']);
  });

  it('pula empresa inativa (sem venda em 7 dias) antes do pipeline', async () => {
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([{ id: 'u1' }]);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(false);
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);
    const fetchVendasSpy = vi.spyOn(fetchers, 'fetchVendas').mockResolvedValue([]);

    const result = await runDaily(mockDb, '2026-07-10');
    expect(result.companies_skipped).toBe(1);
    expect(result.companies_processed).toBe(0);
    // Gate barato: o pipeline pesado nem começa
    expect(fetchVendasSpy).not.toHaveBeenCalled();
  });

  it('backfill: primeira execução (sem snapshots) computa 56 dias', async () => {
    const upsertCalls = [];
    vi.spyOn(fetchers, 'fetchEligibleSubscribedCompanies').mockResolvedValue([{ id: 'u1' }]);
    vi.spyOn(fetchers, 'hasRecentSales').mockResolvedValue(true);
    vi.spyOn(fetchers, 'fetchVendas').mockResolvedValue([
      makeVenda({ id: 1, valorTotal: 1000, createdAt: '2026-07-10T15:00:00.000Z' }),
    ]);
    vi.spyOn(fetchers, 'fetchVendasItens').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasPagamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchVendasTaxas').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixaFechamentos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchProdutosEstoque').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchCaixasAbertos').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchTopDevedores').mockResolvedValue([]);
    vi.spyOn(fetchers, 'fetchSaldoFiadoTotal').mockResolvedValue(250);
    vi.spyOn(fetchers, 'upsertSnapshot').mockImplementation(async (db, snap) => {
      upsertCalls.push(snap);
    });
    vi.spyOn(fetchers, 'fetchSnapshots').mockResolvedValue([]);
    vi.spyOn(fetchers, 'insertSignals').mockResolvedValue({ inserted: 0, errors: 0 });
    vi.spyOn(fetchers, 'fetchLastSignalDates').mockResolvedValue(new Map());
    vi.spyOn(fetchers, 'insertIntelligenceRun').mockResolvedValue(1);
    vi.spyOn(fetchers, 'updateIntelligenceRun').mockResolvedValue(undefined);

    const result = await runDaily(mockDb, '2026-07-10');
    expect(result.companies_processed).toBe(1);
    expect(upsertCalls.length).toBe(56);

    // Dia-alvo: computação normal, carrega o saldo de fiado atual
    const target = upsertCalls.find((s) => s.snapshot_date === '2026-07-10');
    expect(target.metrics.backfilled).toBe(false);
    expect(target.fiado_saldo_total).toBe(250);

    // Dias passados: marcados como backfill e SEM a coluna fiado_saldo_total
    // (o upsert preserva o valor histórico em vez de sobrescrever)
    const past = upsertCalls.find((s) => s.snapshot_date === '2026-07-01');
    expect(past.metrics.backfilled).toBe(true);
    expect(past.metrics.fiado_saldo_total).toBeNull();
    expect('fiado_saldo_total' in past).toBe(false);
  });
});
