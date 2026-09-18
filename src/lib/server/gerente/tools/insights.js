/**
 * @file Ferramentas de leitura do negócio para o Zelinho Gerente.
 * Reaproveita o motor: snapshots diários, fetchers paginados, métricas puras
 * e narrativa de template. Nunca inventa número: tudo vem do banco.
 */
import { fetchSnapshots, fetchVendas, fetchVendasItens, fetchVendasPagamentos, fetchVendasTaxas } from '../../intelligence/fetchers.js';
import { computeDailyMetrics } from '../../intelligence/metrics.js';
import { templateNarrative } from '../../intelligence/narrative.js';
import { addDays, dayRangeUtc, localDateOf } from '../../intelligence/tz.js';
import { SALES_CHANNELS, filterVendasByChannel } from '$lib/finance/salesChannel.js';

const PERIODOS = new Set(['hoje', 'ontem', 'semana', 'mes']);
const EMPTY_MIX = { pix: 0, dinheiro: 0, cartao: 0, vale_refeicao: 0, fiado: 0, outros: 0 };
const CANAL_IDS = new Set(SALES_CHANNELS.map((canal) => canal.id));

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function periodBounds(periodo, today) {
  if (periodo === 'hoje') return { inicio: today, fim: today };
  if (periodo === 'ontem') { const d = addDays(today, -1); return { inicio: d, fim: d }; }
  if (periodo === 'semana') return { inicio: addDays(today, -6), fim: today };
  return { inicio: `${today.slice(0, 7)}-01`, fim: today };
}

/**
 * Soma o `por_canal` de um dia ao acumulador. Snapshots gravados antes da
 * Task 16 não têm `metrics.por_canal` — o dia inteiro cai em `pdv`, mesmo
 * fallback do trigger `vendas_default_canal_origem`, para que a soma dos
 * canais continue batendo com a receita/qtd do dia.
 */
function mergePorCanalDia(acc, metrics, rowReceita, rowQtd) {
  const porCanalDia = metrics.por_canal && Object.keys(metrics.por_canal).length > 0
    ? metrics.por_canal
    : { pdv: { receita_bruta: rowReceita, qtd_vendas: rowQtd } };
  for (const [canalId, valores] of Object.entries(porCanalDia)) {
    const current = acc.get(canalId) || { receita_bruta: 0, qtd_vendas: 0 };
    current.receita_bruta = round2(current.receita_bruta + Number(valores.receita_bruta || 0));
    current.qtd_vendas += Number(valores.qtd_vendas || 0);
    acc.set(canalId, current);
  }
  return porCanalDia;
}

function aggregateSnapshots(rows, canal) {
  const mix = { ...EMPTY_MIX };
  const products = new Map();
  const porCanal = new Map();
  let receita = 0;
  let qtd = 0;
  let diasComVenda = 0;
  // Acumulador escopado a um único canal (usado só quando `canal` é passado).
  let receitaCanal = 0;
  let qtdCanal = 0;
  let diasComVendaCanal = 0;

  for (const row of rows) {
    const rowReceita = Number(row.receita_bruta || 0);
    const rowQtd = Number(row.qtd_vendas || 0);
    const metrics = row.metrics || {};

    const porCanalDia = mergePorCanalDia(porCanal, metrics, rowReceita, rowQtd);
    if (canal) {
      const valoresCanal = porCanalDia[canal] || { receita_bruta: 0, qtd_vendas: 0 };
      receitaCanal += Number(valoresCanal.receita_bruta || 0);
      qtdCanal += Number(valoresCanal.qtd_vendas || 0);
      if (Number(valoresCanal.qtd_vendas || 0) > 0) diasComVendaCanal += 1;
      continue;
    }

    receita += rowReceita;
    qtd += rowQtd;
    if (rowQtd > 0) diasComVenda += 1;
    for (const key of Object.keys(mix)) mix[key] += Number(metrics.mix_pagamentos?.[key] || 0);
    for (const item of metrics.por_produto || []) {
      // O motor grava `qtd` (metrics.js aggregateByProduct); `quantidade` é aceito por tolerância.
      const current = products.get(item.nome) || { nome: item.nome, quantidade: 0, receita: 0 };
      current.quantidade += Number(item.qtd ?? item.quantidade ?? 0);
      current.receita += Number(item.receita || 0);
      products.set(item.nome, current);
    }
  }

  const porCanalObj = Object.fromEntries(porCanal);
  if (canal) {
    // Mix e top produtos não são gravados por canal nos snapshots históricos
    // (Task 16 persiste só números agregados) — nunca inventamos essa
    // granularidade retroativamente, então ficam vazios num resumo filtrado.
    return { receita: receitaCanal, qtd: qtdCanal, diasComVenda: diasComVendaCanal, mix: { ...EMPTY_MIX }, products: new Map(), porCanal: { [canal]: porCanalObj[canal] || { receita_bruta: 0, qtd_vendas: 0 } } };
  }
  return { receita, qtd, diasComVenda, mix, products, porCanal: porCanalObj };
}

function finish({ periodo, inicio, fim, receita, qtd, diasComVenda, mix, products, fonte, porCanal }) {
  const top = [...products.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, 5)
    .map((item) => ({ nome: item.nome, quantidade: round2(item.quantidade), receita: round2(item.receita) }));
  const mixRounded = Object.fromEntries(Object.entries(mix).map(([key, value]) => [key, round2(value)]));
  const porCanalRounded = Object.fromEntries(
    Object.entries(porCanal || {}).map(([canalId, valores]) => [
      canalId,
      { receita_bruta: round2(valores?.receita_bruta), qtd_vendas: Number(valores?.qtd_vendas || 0) },
    ])
  );
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
    por_canal: porCanalRounded,
    fonte,
  };
}

async function resumoFromVendas(db, ownerUserId, periodo, inicio, fim, canal) {
  const start = dayRangeUtc(inicio).startIso;
  const end = dayRangeUtc(fim).endIso;
  const vendas = await fetchVendas(db, ownerUserId, start, end);
  const ids = vendas.map((v) => v.id);
  const [itens, pagamentos, taxas] = ids.length
    ? await Promise.all([fetchVendasItens(db, ids), fetchVendasPagamentos(db, ids), fetchVendasTaxas(db, ids)])
    : [[], [], []];

  // Quando `canal` é informado, recorta vendas/itens/pagamentos/taxas ANTES
  // de calcular a métrica, para que mix_pagamentos e top_produtos também
  // reflitam só aquele canal (hoje temos o dado bruto para isso).
  const vendasEscopo = canal ? filterVendasByChannel(vendas, canal) : vendas;
  const idsEscopo = canal ? new Set(vendasEscopo.map((v) => v.id)) : null;
  const itensEscopo = canal ? itens.filter((it) => idsEscopo.has(it.id_venda)) : itens;
  const pagamentosEscopo = canal ? pagamentos.filter((p) => idsEscopo.has(p.id_venda)) : pagamentos;
  const taxasEscopo = canal ? taxas.filter((t) => idsEscopo.has(t.id_venda)) : taxas;

  const metrics = computeDailyMetrics({ vendas: vendasEscopo, itens: itensEscopo, pagamentos: pagamentosEscopo, taxas: taxasEscopo, saldoFiadoTotal: null });
  const products = new Map((metrics.por_produto || []).map((item) => [item.nome, { nome: item.nome, quantidade: Number(item.qtd ?? item.quantidade ?? 0), receita: Number(item.receita || 0) }]));
  return finish({ periodo, inicio, fim, receita: metrics.receita_bruta, qtd: metrics.qtd_vendas, diasComVenda: metrics.qtd_vendas > 0 ? 1 : 0, mix: metrics.mix_pagamentos || { ...EMPTY_MIX }, products, fonte: 'vendas', porCanal: metrics.por_canal || {} });
}

export async function resumoPeriodo(db, ownerUserId, { periodo, canal } = {}, { now = new Date() } = {}) {
  const key = String(periodo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!PERIODOS.has(key)) return { ok: false, error: 'Posso resumir hoje, ontem, semana ou mês.' };
  if (canal && !CANAL_IDS.has(canal)) return { ok: false, error: 'Não conheço esse canal de venda.' };
  const today = localDateOf(now.toISOString());
  const { inicio, fim } = periodBounds(key, today);
  try {
    if (key === 'hoje') return { ok: true, data: await resumoFromVendas(db, ownerUserId, key, inicio, fim, canal) };
    const snapshots = (await fetchSnapshots(db, ownerUserId, 62)).filter((row) => row.snapshot_date >= inicio && row.snapshot_date <= fim);
    if (key === 'ontem' && snapshots.length === 0) return { ok: true, data: await resumoFromVendas(db, ownerUserId, key, inicio, fim, canal) };
    const agg = aggregateSnapshots(snapshots, canal);
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
