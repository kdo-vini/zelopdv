import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { resumoPeriodo, sinaisAtivos } from '../src/lib/server/gerente/tools/insights.js';

// 2026-09-02 15:00 UTC = 12:00 em São Paulo (quarta-feira)
const now = new Date('2026-09-02T15:00:00Z');

const snapshots = [
  // `por_produto` segue o formato gravado pelo motor (metrics.js aggregateByProduct): { id_produto, nome, qtd, receita }
  { snapshot_date: '2026-09-01', receita_bruta: 1240, receita_realizada: 1200, qtd_vendas: 38, ticket_medio: 32.63, metrics: { mix_pagamentos: { pix: 760, dinheiro: 200, cartao: 280, vale_refeicao: 0, fiado: 0, outros: 0 }, por_produto: [{ id_produto: 1, nome: 'X-Bacon', qtd: 14, receita: 420 }, { id_produto: 2, nome: 'Refri 2L', qtd: 9, receita: 126 }] } },
  { snapshot_date: '2026-08-31', receita_bruta: 900, receita_realizada: 900, qtd_vendas: 30, ticket_medio: 30, metrics: { mix_pagamentos: { pix: 500, dinheiro: 100, cartao: 300, vale_refeicao: 0, fiado: 0, outros: 0 }, por_produto: [{ id_produto: 1, nome: 'X-Bacon', qtd: 10, receita: 300 }] } },
  { snapshot_date: '2026-08-20', receita_bruta: 500, receita_realizada: 500, qtd_vendas: 10, ticket_medio: 50, metrics: { mix_pagamentos: { pix: 500, dinheiro: 0, cartao: 0, vale_refeicao: 0, fiado: 0, outros: 0 }, por_produto: [] } },
];

describe('resumoPeriodo', () => {
  it('ontem usa o snapshot do dia anterior', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'ontem' }, { now });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ periodo: 'ontem', inicio: '2026-09-01', fim: '2026-09-01', receita_bruta: 1240, qtd_vendas: 38, ticket_medio: 32.63, fonte: 'snapshots' });
    expect(result.data.top_produtos[0]).toEqual({ nome: 'X-Bacon', quantidade: 14, receita: 420 });
  });

  it('semana soma os últimos 7 dias e agrega produtos', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'semana' }, { now });
    expect(result.data).toMatchObject({ inicio: '2026-08-27', fim: '2026-09-02', receita_bruta: 2140, qtd_vendas: 68, dias_com_venda: 2 });
    expect(result.data.ticket_medio).toBeCloseTo(31.47, 2);
    expect(result.data.top_produtos[0]).toEqual({ nome: 'X-Bacon', quantidade: 24, receita: 720 });
    expect(result.data.mix_pagamentos.pix).toBe(1260);
  });

  it('mes começa no dia 1 e ignora snapshots fora do intervalo', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'mes' }, { now });
    expect(result.data).toMatchObject({ inicio: '2026-09-01', fim: '2026-09-02', receita_bruta: 1240, qtd_vendas: 38 });
  });

  it('hoje calcula a partir das vendas do dia', async () => {
    const vendas = [{ id: 1, valor_total: 50, forma_pagamento: 'pix', created_at: '2026-09-02T13:00:00Z' }, { id: 2, valor_total: 30, forma_pagamento: 'dinheiro', created_at: '2026-09-02T14:00:00Z' }];
    const db = makeDb({ tables: {
      vendas: [{ data: vendas, error: null }],
      vendas_itens: [{ data: [{ id_venda: 1, id_produto: 5, nome_produto_na_venda: 'Pudim', quantidade: 2, preco_unitario_na_venda: 25 }], error: null }],
      vendas_pagamentos: [{ data: [], error: null }],
      vendas_taxas_plataforma: [{ data: [], error: null }],
    } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(result.data).toMatchObject({ periodo: 'hoje', inicio: '2026-09-02', fim: '2026-09-02', receita_bruta: 80, qtd_vendas: 2, ticket_medio: 40, fonte: 'vendas' });
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id_usuario', value: 'owner-1' }]));
  });

  it('rejeita período desconhecido', async () => {
    const result = await resumoPeriodo(makeDb(), 'owner-1', { periodo: 'ano' }, { now });
    expect(result).toEqual({ ok: false, error: 'Posso resumir hoje, ontem, semana ou mês.' });
  });
});

describe('sinaisAtivos', () => {
  it('devolve sinais recentes com texto da narrativa ou template', async () => {
    const db = makeDb({ tables: { business_signals: [{ data: [
      { signal_date: '2026-09-01', type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical', evidence: { produto_nome: 'Refri 2L', vendas_7d: 9 }, narrative: 'Refri 2L zerou com 9 vendas na semana.' },
      { signal_date: '2026-08-31', type: 'CAIXA_LEFT_OPEN', severity: 'attention', evidence: { horas_aberto: 20 }, narrative: null },
    ], error: null }] } });
    const result = await sinaisAtivos(db, 'owner-1', { dias: 7 }, { now });
    expect(result.ok).toBe(true);
    expect(result.data.sinais[0]).toEqual({ data: '2026-09-01', tipo: 'STOCK_ZERO_WITH_DEMAND', severidade: 'critical', texto: 'Refri 2L zerou com 9 vendas na semana.' });
    expect(typeof result.data.sinais[1].texto).toBe('string');
    expect(result.data.sinais[1].texto.length).toBeGreaterThan(0);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'user_id', value: 'owner-1' }, { op: 'gte', field: 'signal_date', value: '2026-08-26' }]));
  });
});
