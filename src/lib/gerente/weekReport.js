const DAY_MS = 86_400_000;
const paymentLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', fiado: 'Fiado', outros: 'Outros' };

function dateAtNoon(date) { return new Date(`${date}T12:00:00Z`); }
function toDateKey(date) { return date.toISOString().slice(0, 10); }
function addDays(date, amount) { const value = dateAtNoon(date); value.setUTCDate(value.getUTCDate() + amount); return toDateKey(value); }
function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
function delta(current, previous) { return previous > 0 ? (current - previous) / previous : null; }
function weekRows(snapshots, start) { const end = addDays(start, 6); return snapshots.filter((row) => row.snapshot_date >= start && row.snapshot_date <= end); }

function aggregate(rows) {
  const receita = sum(rows.map((row) => row.receita_bruta));
  const receitaRealizada = sum(rows.map((row) => row.receita_realizada));
  const vendas = sum(rows.map((row) => row.qtd_vendas));
  const custosPlataforma = sum(rows.map((row) => row.metrics?.custos_plataforma));
  return {
    receita,
    receitaRealizada,
    vendas,
    ticket: vendas > 0 ? receita / vendas : 0,
    // This is intentionally not a profit metric: product costs are unavailable here.
    resultadoOperacional: receitaRealizada - custosPlataforma,
    custosPlataforma,
  };
}

function aggregateProducts(rows) {
  const products = new Map();
  for (const row of rows) for (const product of row.metrics?.por_produto || []) {
    const key = product.id_produto != null ? `id:${product.id_produto}` : `nome:${product.nome}`;
    const existing = products.get(key) || { key, nome: product.nome || 'Produto', receita: 0, qtd: 0 };
    existing.receita += Number(product.receita) || 0;
    existing.qtd += Number(product.qtd) || 0;
    products.set(key, existing);
  }
  return [...products.values()].sort((a, b) => b.receita - a.receita);
}

function aggregatePayments(rows) {
  const amounts = new Map();
  for (const row of rows) for (const [type, value] of Object.entries(row.metrics?.mix_pagamentos || {})) {
    amounts.set(type, (amounts.get(type) || 0) + (Number(value) || 0));
  }
  return [...amounts.entries()].map(([type, value]) => ({ type, label: paymentLabels[type] || type, value })).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);
}

function opening(current, previous) {
  if (!current.receita && !current.vendas) return 'Ainda não há vendas registradas nesta semana.';
  if (previous.receita <= 0) return 'Esta é a primeira semana com dados suficientes para acompanhar.';
  return current.receita >= previous.receita
    ? 'A semana fechou acima da anterior em receita bruta.'
    : 'A semana fechou abaixo da anterior em receita bruta; vale observar os sinais listados abaixo.';
}

export function buildWeekReport(snapshots = [], signals = [], weekStart, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const start = weekStart || toDateKey(dateAtNoon(today));
  const end = addDays(start, 6);
  const currentRows = weekRows(snapshots, start);
  const previousRows = weekRows(snapshots, addDays(start, -7));
  const current = aggregate(currentRows);
  const previous = aggregate(previousRows);
  const previousProducts = aggregateProducts(previousRows);
  const previousPositions = new Map(previousProducts.map((product, index) => [product.key, index + 1]));
  const products = aggregateProducts(currentRows).slice(0, 5).map((product, index) => ({ ...product, position: index + 1, positionChange: (previousPositions.get(product.key) || 6) - (index + 1) }));
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const row = currentRows.find((item) => item.snapshot_date === date);
    return { date, label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dateAtNoon(date)).replace('.', ''), value: Number(row?.receita_bruta) || 0, vendas: Number(row?.qtd_vendas) || 0 };
  });
  const paymentMix = aggregatePayments(currentRows);
  const previousMix = aggregatePayments(previousRows);
  const currentLeader = paymentMix[0];
  const previousLeader = previousMix[0];
  const isCurrentWeek = start <= today && today <= end;
  const isIncomplete = isCurrentWeek && today < end;
  return {
    weekStart: start, weekEnd: end, isCurrentWeek, isIncomplete,
    current, previous,
    deltas: { receita: delta(current.receita, previous.receita), vendas: delta(current.vendas, previous.vendas), ticket: delta(current.ticket, previous.ticket), resultadoOperacional: delta(current.resultadoOperacional, previous.resultadoOperacional) },
    daily, products, paymentMix,
    paymentMixSentence: currentLeader && previousLeader && currentLeader.type !== previousLeader.type ? `${currentLeader.label} passou a ser a principal forma de pagamento da semana.` : '',
    signals: signals.filter((signal) => signal.signal_date >= start && signal.signal_date <= end),
    opening: opening(current, previous),
    nextWeek: current.receita ? 'Use os sinais desta semana para escolher uma prioridade concreta para os próximos dias.' : 'Registre as vendas normalmente para o Zelinho formar seu próximo resumo.',
  };
}

export function getWeekStart(date = new Date().toISOString().slice(0, 10)) {
  const value = dateAtNoon(date);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return toDateKey(value);
}

export function shiftWeek(weekStart, amount) { return addDays(weekStart, amount * 7); }
