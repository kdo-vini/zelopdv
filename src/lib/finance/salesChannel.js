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
 */

export function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export const SALES_CHANNELS = Object.freeze([
  Object.freeze({
    id: 'pdv',
    label: 'PDV',
    color: 'bg-slate-500',
    textColor: 'text-slate-600 dark:text-slate-400',
    hex: '#64748b',
  }),
  Object.freeze({
    id: 'zelomenu',
    label: 'ZeloMenu',
    color: 'bg-indigo-500',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    hex: '#6366f1',
  }),
  Object.freeze({
    id: 'zelochat',
    label: 'ZeloChat',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    hex: '#10b981',
  }),
  Object.freeze({
    id: 'mesa',
    label: 'Mesas',
    color: 'bg-purple-500',
    textColor: 'text-purple-600 dark:text-purple-400',
    hex: '#a855f7',
  }),
  Object.freeze({
    id: 'manual',
    label: 'Manual',
    color: 'bg-amber-500',
    textColor: 'text-amber-600 dark:text-amber-400',
    hex: '#f59e0b',
  }),
  Object.freeze({
    id: 'ifood',
    label: 'iFood',
    color: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
    hex: '#f97316',
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
 * One comparative card per channel that has at least one sale: quantity,
 * gross total, average ticket, commission/net (null = "Indisponível" when
 * the channel never gets platform-fee rows) and applied reversals.
 *
 * @param {Array} vendas - rows with `id`, `valor_total`, `canal_origem`.
 * @param {{ taxasPlataforma?: Array, estornos?: Array }} [context]
 * @returns {Array<{canal, label, color, textColor, hex, qtd, bruto, ticketMedio, comissao: number|null, liquido: number|null, estornosQtd, estornosValor}>}
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
        color: visual.color,
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
