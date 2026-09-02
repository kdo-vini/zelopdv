const round = (v, d) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const avg = (rows, pick) => (rows.length ? rows.reduce((s, r) => s + Number(pick(r) || 0), 0) / rows.length : null);

export function computeDayStrip(snapshots = []) {
  const sorted = [...snapshots].filter((s) => s?.snapshot_date).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  const latest = sorted[0];
  if (!latest) return null;
  const previous = sorted.slice(1);
  const sameWeekday = previous.filter((s) => weekdayOf(s.snapshot_date) === weekdayOf(latest.snapshot_date)).slice(0, 5);
  const baseline = sameWeekday.length ? sameWeekday : previous.slice(0, 6);
  const mediaReceita = avg(baseline, (s) => s.receita_bruta);
  const mediaVendas = avg(baseline, (s) => s.qtd_vendas);
  const mediaTicket = avg(baseline, (s) => s.ticket_medio);
  const receita = Number(latest.receita_bruta || 0);
  const ticket = latest.ticket_medio == null ? null : Number(latest.ticket_medio);
  const mix = latest.metrics?.mix_pagamentos || {};
  const total = Object.values(mix).reduce((s, v) => s + Number(v || 0), 0);
  const spark = [...previous.slice(0, 6).reverse().map((s) => ({ date: s.snapshot_date, value: Number(s.receita_bruta || 0), kind: 'day' })), { date: latest.snapshot_date, value: receita, kind: 'now' }];
  return {
    date: latest.snapshot_date,
    receita,
    receitaDeltaPct: mediaReceita ? round((receita - mediaReceita) / mediaReceita, 3) : null,
    vendas: Number(latest.qtd_vendas || 0),
    vendasMedia: mediaVendas == null ? null : Math.round(mediaVendas),
    ticket,
    ticketDeltaPct: mediaTicket && ticket != null ? round((ticket - mediaTicket) / mediaTicket, 3) : null,
    pixShare: total > 0 ? round(Number(mix.pix || 0) / total, 3) : null,
    dinheiroShare: total > 0 ? round(Number(mix.dinheiro || 0) / total, 3) : null,
    spark,
  };
}
