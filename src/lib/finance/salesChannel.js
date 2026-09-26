/**
 * Centralizes canal_origem (Task 14) presentation for reports: filter
 * options, badge label/color, and per-channel comparative aggregation.
 *
 * Commission/net revenue is only meaningful for channels where
 * vendas_taxas_plataforma is actually populated. iFood sales are
 * materialized by `materialize_ifood_sale_v1`, which deliberately never
 * writes a taxa row (see docs/CURRENT.md Task 14) — so iFood commission and
 * net must render as "Indisponível", never as R$ 0,00 (that would imply the
 * platform charges nothing).
 *
 * Colors: CSS vars for UI (`swatch` / `textColor`); resolved hex only for
 * PDF/canvas via chartColors.js (mirrors `--chart-channel-*` in src/themes/derived.css).
 */

import { CHART_COLORS } from '$lib/theme/chartColors.js';

export function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export const SALES_CHANNELS = Object.freeze([
  Object.freeze({
    id: 'pdv',
    label: 'PDV',
    swatch: 'var(--chart-channel-pdv)',
    textColor: 'var(--chart-channel-pdv)',
    get hex() { return CHART_COLORS.channelPdv; },
  }),
  Object.freeze({
    id: 'zelomenu',
    label: 'ZeloMenu',
    swatch: 'var(--chart-channel-zelomenu)',
    textColor: 'var(--chart-channel-zelomenu)',
    get hex() { return CHART_COLORS.channelZelomenu; },
  }),
  Object.freeze({
    id: 'zelochat',
    label: 'ZeloChat',
    swatch: 'var(--chart-channel-zelochat)',
    textColor: 'var(--chart-channel-zelochat)',
    get hex() { return CHART_COLORS.channelZelochat; },
  }),
  Object.freeze({
    id: 'mesa',
    label: 'Mesas',
    swatch: 'var(--chart-channel-mesa)',
    textColor: 'var(--chart-channel-mesa)',
    get hex() { return CHART_COLORS.channelMesa; },
  }),
  Object.freeze({
    id: 'manual',
    label: 'Manual',
    swatch: 'var(--chart-channel-manual)',
    textColor: 'var(--chart-channel-manual)',
    get hex() { return CHART_COLORS.channelManual; },
  }),
  Object.freeze({
    id: 'ifood',
    label: 'iFood',
    swatch: 'var(--chart-channel-ifood)',
    textColor: 'var(--chart-channel-ifood)',
    get hex() { return CHART_COLORS.channelIfood; },
  }),
]);

const DEFAULT_CHANNEL = SALES_CHANNELS[0];
const CHANNEL_BY_ID = new Map(SALES_CHANNELS.map((channel) => [channel.id, channel]));

/** Matches the `Todos|PDV|ZeloMenu|ZeloChat|Mesas|Manual|iFood` filter contract. */
export const SALES_CHANNEL_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Todos' }),
  ...SALES_CHANNELS.map((channel) => Object.freeze({ value: channel.id, label: channel.label })),
]);

/**
 * Channels for which `vendas_taxas_plataforma` is never populated, so
 * commission/net must be reported as unavailable instead of zero.
 */
export const CHANNELS_WITHOUT_COMMISSION_DATA = Object.freeze(new Set(['ifood']));

export const COMMISSION_UNAVAILABLE_LABEL = 'Indisponível';

/** Falls back to `pdv` for null/unknown values — same default the DB trigger uses. */
export function normalizeSalesChannel(canalOrigem) {
  const id = String(canalOrigem || '').trim().toLowerCase();
  return CHANNEL_BY_ID.has(id) ? id : DEFAULT_CHANNEL.id;
}

export function getChannelVisual(canalOrigem) {
  return CHANNEL_BY_ID.get(normalizeSalesChannel(canalOrigem)) || DEFAULT_CHANNEL;
}

export function getChannelLabel(canalOrigem) {
  return getChannelVisual(canalOrigem).label;
}

export function channelHasCommissionData(canalOrigem) {
  return !CHANNELS_WITHOUT_COMMISSION_DATA.has(normalizeSalesChannel(canalOrigem));
}

/** id_venda -> canal_origem (normalized), used to join taxas/estornos to a channel. */
export function buildVendaChannelMap(vendas = []) {
  const map = new Map();
  for (const venda of vendas || []) {
    if (venda?.id == null) continue;
    map.set(venda.id, normalizeSalesChannel(venda.canal_origem));
  }
  return map;
}

export function filterVendasByChannel(vendas = [], channelFilter = '') {
  if (!channelFilter) return vendas || [];
  const normalizedFilter = normalizeSalesChannel(channelFilter);
  return (vendas || []).filter((venda) => normalizeSalesChannel(venda?.canal_origem) === normalizedFilter);
}

/**
 * Scopes rows that join to vendas via `id_venda` (pagamentos, itens, taxas)
 * to the same channel filter used on the sales list / KPIs.
 */
export function filterRelatedByChannel(rows = [], vendas = [], channelFilter = '', idKey = 'id_venda') {
  if (!channelFilter) return rows || [];
  const ids = new Set(filterVendasByChannel(vendas, channelFilter).map((venda) => venda?.id));
  return (rows || []).filter((row) => ids.has(row?.[idKey]));
}

/**
 * One comparative card per channel that has at least one sale: quantity,
 * gross total, average ticket, commission/net (null = "Indisponível" when
 * the channel never gets platform-fee rows) and applied reversals.
 *
 * @param {Array} vendas - rows with `id`, `valor_total`, `canal_origem`.
 * @param {{ taxasPlataforma?: Array, estornos?: Array }} [context]
 * @returns {Array<{canal, label, swatch, textColor, hex, qtd, bruto, ticketMedio, comissao: number|null, liquido: number|null, estornosQtd, estornosValor}>}
 */
export function summarizeSalesByChannel(vendas = [], { taxasPlataforma = [], estornos = [] } = {}) {
  const channelByVendaId = buildVendaChannelMap(vendas);
  const byChannel = new Map();

  for (const venda of vendas || []) {
    const canal = normalizeSalesChannel(venda?.canal_origem);
    const acc = byChannel.get(canal) || {
      canal,
      qtd: 0,
      bruto: 0,
      comissao: channelHasCommissionData(canal) ? 0 : null,
      estornosQtd: 0,
      estornosValor: 0,
    };
    acc.qtd += 1;
    acc.bruto = money(acc.bruto + Number(venda?.valor_total || 0));
    byChannel.set(canal, acc);
  }

  for (const taxa of taxasPlataforma || []) {
    const canal = channelByVendaId.get(taxa?.id_venda);
    if (!canal) continue;
    const acc = byChannel.get(canal);
    if (!acc || acc.comissao === null) continue;
    acc.comissao = money(acc.comissao + Number(taxa?.valor_taxa || 0));
  }

  for (const estorno of estornos || []) {
    if (estorno?.status !== 'applied') continue;
    const canal = channelByVendaId.get(estorno?.id_venda);
    if (!canal) continue;
    const acc = byChannel.get(canal);
    if (!acc) continue;
    acc.estornosQtd += 1;
    acc.estornosValor = money(acc.estornosValor + Number(estorno?.valor_estornado || 0));
  }

  return SALES_CHANNELS
    .map((channel) => byChannel.get(channel.id))
    .filter(Boolean)
    .map((acc) => {
      const visual = getChannelVisual(acc.canal);
      return {
        canal: acc.canal,
        label: visual.label,
        swatch: visual.swatch,
        textColor: visual.textColor,
        hex: visual.hex,
        qtd: acc.qtd,
        bruto: acc.bruto,
        ticketMedio: acc.qtd > 0 ? money(acc.bruto / acc.qtd) : 0,
        comissao: acc.comissao,
        liquido: acc.comissao === null ? null : money(acc.bruto - acc.comissao),
        estornosQtd: acc.estornosQtd,
        estornosValor: acc.estornosValor,
      };
    });
}

/**
 * Aggregates `vendas_estornos` rows, optionally scoped to a single channel.
 * `applied` rows count towards quantity/value; `pending_review` rows are
 * surfaced separately and never summed into `valor` (their amount is not
 * settled yet).
 */
export function summarizeEstornos(estornos = [], { channelByVendaId = new Map(), channelFilter = '' } = {}) {
  const normalizedFilter = channelFilter ? normalizeSalesChannel(channelFilter) : '';
  let qtd = 0;
  let valor = 0;
  let pendentes = 0;

  for (const estorno of estornos || []) {
    if (normalizedFilter) {
      const canal = channelByVendaId.get(estorno?.id_venda);
      if (canal !== normalizedFilter) continue;
    }
    if (estorno?.status === 'applied') {
      qtd += 1;
      valor = money(valor + Number(estorno?.valor_estornado || 0));
    } else if (estorno?.status === 'pending_review') {
      pendentes += 1;
    }
  }

  return { qtd, valor: money(valor), pendentes };
}
