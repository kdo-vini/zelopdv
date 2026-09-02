/**
 * @file Ferramentas de leitura do negócio para o Zelinho Gerente.
 * Reaproveita o motor: snapshots diários, fetchers paginados, métricas puras
 * e narrativa de template. Nunca inventa número: tudo vem do banco.
 */
import { fetchSnapshots, fetchVendas, fetchVendasItens, fetchVendasPagamentos, fetchVendasTaxas } from '../../intelligence/fetchers.js';
import { computeDailyMetrics } from '../../intelligence/metrics.js';
import { templateNarrative } from '../../intelligence/narrative.js';
import { addDays, dayRangeUtc, localDateOf } from '../../intelligence/tz.js';

const PERIODOS = new Set(['hoje', 'ontem', 'semana', 'mes']);
const EMPTY_MIX = { pix: 0, dinheiro: 0, cartao: 0, vale_refeicao: 0, fiado: 0, outros: 0 };

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function periodBounds(periodo, today) {
  if (periodo === 'hoje') return { inicio: today, fim: today };
  if (periodo === 'ontem') { const d = addDays(today, -1); return { inicio: d, fim: d }; }
  if (periodo === 'semana') return { inicio: addDays(today, -6), fim: today };
  return { inicio: `${today.slice(0, 7)}-01`, fim: today };
}

function aggregateSnapshots(rows) {
  const mix = { ...EMPTY_MIX };
  const products = new Map();
  let receita = 0;
  let qtd = 0;
  let diasComVenda = 0;
  for (const row of rows) {
    receita += Number(row.receita_bruta || 0);
    qtd += Number(row.qtd_vendas || 0);
    if (Number(row.qtd_vendas || 0) > 0) diasComVenda += 1;
    const metrics = row.metrics || {};
    for (const key of Object.keys(mix)) mix[key] += Number(metrics.mix_pagamentos?.[key] || 0);
    for (const item of metrics.por_produto || []) {
      // O motor grava `qtd` (metrics.js aggregateByProduct); `quantidade` é aceito por tolerância.
      const current = products.get(item.nome) || { nome: item.nome, quantidade: 0, receita: 0 };
      current.quantidade += Number(item.qtd ?? item.quantidade ?? 0);
      current.receita += Number(item.receita || 0);
      products.set(item.nome, current);
    }
  }
  return { receita, qtd, diasComVenda, mix, products };
}

function finish({ periodo, inicio, fim, receita, qtd, diasComVenda, mix, products, fonte }) {
  const top = [...products.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, 5)
    .map((item) => ({ nome: item.nome, quantidade: round2(item.quantidade), receita: round2(item.receita) }));
  const mixRounded = Object.fromEntries(Object.entries(mix).map(([key, value]) => [key, round2(value)]));
  return {
    periodo,
    inicio,
    fim,
    dias_com_venda: diasComVenda,
    receita_bruta: round2(receita),
    qtd_vendas: qtd,
    ticket_medio: qtd > 0 ? round2(receita / qtd) : null,
    mix_pagamentos: mixRounded,
    top_produtos: top,
    fonte,
  };
}

async function resumoFromVendas(db, ownerUserId, periodo, inicio, fim) {
  const start = dayRangeUtc(inicio).startIso;
  const end = dayRangeUtc(fim).endIso;
  const vendas = await fetchVendas(db, ownerUserId, start, end);
  const ids = vendas.map((v) => v.id);
  const [itens, pagamentos, taxas] = ids.length
    ? await Promise.all([fetchVendasItens(db, ids), fetchVendasPagamentos(db, ids), fetchVendasTaxas(db, ids)])
    : [[], [], []];
  const metrics = computeDailyMetrics({ vendas, itens, pagamentos, taxas, saldoFiadoTotal: null });
  const products = new Map((metrics.por_produto || []).map((item) => [item.nome, { nome: item.nome, quantidade: Number(item.qtd ?? item.quantidade ?? 0), receita: Number(item.receita || 0) }]));
  return finish({ periodo, inicio, fim, receita: metrics.receita_bruta, qtd: metrics.qtd_vendas, diasComVenda: metrics.qtd_vendas > 0 ? 1 : 0, mix: metrics.mix_pagamentos || { ...EMPTY_MIX }, products, fonte: 'vendas' });
}

export async function resumoPeriodo(db, ownerUserId, { periodo }, { now = new Date() } = {}) {
  const key = String(periodo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!PERIODOS.has(key)) return { ok: false, error: 'Posso resumir hoje, ontem, semana ou mês.' };
  const today = localDateOf(now.toISOString());
  const { inicio, fim } = periodBounds(key, today);
  try {
    if (key === 'hoje') return { ok: true, data: await resumoFromVendas(db, ownerUserId, key, inicio, fim) };
    const snapshots = (await fetchSnapshots(db, ownerUserId, 62)).filter((row) => row.snapshot_date >= inicio && row.snapshot_date <= fim);
    if (key === 'ontem' && snapshots.length === 0) return { ok: true, data: await resumoFromVendas(db, ownerUserId, key, inicio, fim) };
    const agg = aggregateSnapshots(snapshots);
    return { ok: true, data: finish({ periodo: key, inicio, fim, ...agg, fonte: 'snapshots' }) };
  } catch (error) {
    console.error('[gerente/insights] resumoPeriodo:', error?.message || error);
    return { ok: false, error: 'Não consegui consultar as vendas agora.' };
  }
}

export async function sinaisAtivos(db, ownerUserId, { dias = 7 } = {}, { now = new Date() } = {}) {
  const today = localDateOf(now.toISOString());
  const since = addDays(today, -Math.max(1, Math.min(Number(dias) || 7, 30)));
  const { data, error } = await db
    .from('business_signals')
    .select('signal_date, type, severity, evidence, narrative')
    .eq('user_id', ownerUserId)
    .gte('signal_date', since)
    .order('signal_date', { ascending: false })
    .limit(10);
  if (error) return { ok: false, error: 'Não consegui consultar os avisos agora.' };
  return {
    ok: true,
    data: {
      sinais: (data || []).map((signal) => ({
        data: signal.signal_date,
        tipo: signal.type,
        severidade: signal.severity,
        texto: signal.narrative || templateNarrative(signal),
      })),
    },
  };
}
