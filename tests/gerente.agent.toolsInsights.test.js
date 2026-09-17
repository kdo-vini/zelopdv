import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { resumoPeriodo, sinaisAtivos } from '../src/lib/server/gerente/tools/insights.js';

// 2026-09-02 15:00 UTC = 12:00 em São Paulo (quarta-feira)
const now = new Date('2026-09-02T15:00:00Z');

const snapshots = [
  // `por_produto` segue o formato gravado pelo motor (metrics.js aggregateByProduct): { id_produto, nome, qtd, receita }
  // `2026-09-01` já tem `por_canal` (gravado pela Task 16); os outros dois são snapshots "antigos" sem essa dimensão.
  { snapshot_date: '2026-09-01', receita_bruta: 1240, receita_realizada: 1200, qtd_vendas: 38, ticket_medio: 32.63, metrics: { mix_pagamentos: { pix: 760, dinheiro: 200, cartao: 280, vale_refeicao: 0, fiado: 0, outros: 0 }, por_produto: [{ id_produto: 1, nome: 'X-Bacon', qtd: 14, receita: 420 }, { id_produto: 2, nome: 'Refri 2L', qtd: 9, receita: 126 }], por_canal: { pdv: { receita_bruta: 1040, qtd_vendas: 30 }, ifood: { receita_bruta: 200, qtd_vendas: 8 } } } },
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

  it('rejeita canal desconhecido', async () => {
    const result = await resumoPeriodo(makeDb(), 'owner-1', { periodo: 'hoje', canal: 'rappi' }, { now });
    expect(result).toEqual({ ok: false, error: 'Não conheço esse canal de venda.' });
  });

  it('semana traz por_canal, com fallback pdv para o snapshot sem essa dimensão', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'semana' }, { now });
    // 2026-09-01 já tem por_canal (pdv 1040 + ifood 200); 2026-08-31 é legado
    // e cai inteiro em pdv (900) — nunca some pra ifood por conta própria.
    expect(result.data.por_canal).toEqual({
      pdv: { receita_bruta: 1940, qtd_vendas: 60 },
      ifood: { receita_bruta: 200, qtd_vendas: 8 },
    });
  });

  it('semana com canal=ifood escopa receita/quantidade sem inventar mix ou top_produtos', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'semana', canal: 'ifood' }, { now });
    expect(result.data).toMatchObject({ receita_bruta: 200, qtd_vendas: 8, dias_com_venda: 1 });
    expect(result.data.por_canal).toEqual({ ifood: { receita_bruta: 200, qtd_vendas: 8 } });
    expect(result.data.top_produtos).toEqual([]);
    expect(result.data.mix_pagamentos).toEqual({ pix: 0, dinheiro: 0, cartao: 0, vale_refeicao: 0, fiado: 0, outros: 0 });
  });

  it('semana com canal sem nenhuma venda devolve zero, não erro', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'semana', canal: 'zelomenu' }, { now });
    expect(result.data).toMatchObject({ receita_bruta: 0, qtd_vendas: 0, dias_com_venda: 0, ticket_medio: null });
  });

  it('hoje calcula por_canal e escopa tudo (receita, itens, mix) quando canal=ifood', async () => {
    const vendas = [
      { id: 1, valor_total: 50, forma_pagamento: 'pix', created_at: '2026-09-02T13:00:00Z', canal_origem: 'ifood' },
      { id: 2, valor_total: 30, forma_pagamento: 'dinheiro', created_at: '2026-09-02T14:00:00Z', canal_origem: 'pdv' },
    ];
    const db = makeDb({ tables: {
      vendas: [{ data: vendas, error: null }],
      vendas_itens: [{ data: [
        { id_venda: 1, id_produto: 5, nome_produto_na_venda: 'Pudim', quantidade: 2, preco_unitario_na_venda: 25 },
        { id_venda: 2, id_produto: 6, nome_produto_na_venda: 'Refri', quantidade: 1, preco_unitario_na_venda: 30 },
      ], error: null }],
      vendas_pagamentos: [{ data: [], error: null }],
      vendas_taxas_plataforma: [{ data: [], error: null }],
    } });

    const total = await resumoPeriodo(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(total.data.por_canal).toEqual({
      ifood: { receita_bruta: 50, qtd_vendas: 1 },
      pdv: { receita_bruta: 30, qtd_vendas: 1 },
    });

    const db2 = makeDb({ tables: {
      vendas: [{ data: vendas, error: null }],
      vendas_itens: [{ data: [
        { id_venda: 1, id_produto: 5, nome_produto_na_venda: 'Pudim', quantidade: 2, preco_unitario_na_venda: 25 },
        { id_venda: 2, id_produto: 6, nome_produto_na_venda: 'Refri', quantidade: 1, preco_unitario_na_venda: 30 },
      ], error: null }],
      vendas_pagamentos: [{ data: [], error: null }],
      vendas_taxas_plataforma: [{ data: [], error: null }],
    } });
    const ifood = await resumoPeriodo(db2, 'owner-1', { periodo: 'hoje', canal: 'ifood' }, { now });
    expect(ifood.data).toMatchObject({ receita_bruta: 50, qtd_vendas: 1, ticket_medio: 50 });
    expect(ifood.data.top_produtos).toEqual([{ nome: 'Pudim', quantidade: 2, receita: 50 }]);
    expect(ifood.data.por_canal).toEqual({ ifood: { receita_bruta: 50, qtd_vendas: 1 } });
  });

  it('nenhum resultado de por_canal expõe nome de cliente, telefone ou endereço', async () => {
    const db = makeDb({ tables: { business_daily_snapshots: [{ data: snapshots, error: null }] } });
    const result = await resumoPeriodo(db, 'owner-1', { periodo: 'semana' }, { now });
    expect(JSON.stringify(result.data)).not.toMatch(/telefone|endereco|address|customer|phone/i);
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
