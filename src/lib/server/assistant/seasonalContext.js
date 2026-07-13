/**
 * @file Small, hand-curated calendar of commemorative/seasonal dates relevant
 * to Brazilian food-service businesses, plus one-off windows for known
 * events (e.g. a World Cup). This is NOT live event data pulled from
 * anywhere — it is a static seed list. Only high-confidence, well-documented
 * dates are included; movable/uncertain ones (Carnaval, "dia do hambúrguer")
 * are deliberately left out rather than risk feeding the assistant a wrong
 * date as fact. Expect to keep expanding this list over time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 10;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

/** weekday: 0=domingo..6=sábado. n: 1ª, 2ª, 3ª ocorrência do mês. */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7, 12, 0, 0));
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const diff = (lastDayOfMonth.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month - 1, lastDayOfMonth.getUTCDate() - diff, 12, 0, 0));
}

const RECURRING_FIXED_DATES = [
  { month: 1, day: 1, nome: 'Ano Novo', sugestao: 'considerar horário especial e avisar com antecedência se o negócio vai abrir' },
  { month: 3, day: 15, nome: 'Dia do Consumidor', sugestao: 'considerar uma promoção ou desconto para clientes fiéis' },
  { month: 10, day: 12, nome: 'Dia das Crianças', sugestao: 'considerar combos ou produtos voltados para famílias com crianças' },
  { month: 12, day: 25, nome: 'Natal', sugestao: 'considerar horário especial e combos temáticos de fim de ano' },
  { month: 12, day: 31, nome: 'Véspera de Ano Novo', sugestao: 'considerar horário especial e avisar com antecedência se o negócio vai abrir' },
];

const RECURRING_COMPUTED_DATES = [
  { compute: (year) => nthWeekdayOfMonth(year, 5, 0, 2), nome: 'Dia das Mães', sugestao: 'considerar combos ou promoções para presentear mães' },
  { compute: (year) => nthWeekdayOfMonth(year, 8, 0, 2), nome: 'Dia dos Pais', sugestao: 'considerar combos ou promoções para presentear pais' },
  { compute: (year) => lastWeekdayOfMonth(year, 11, 5), nome: 'Black Friday', sugestao: 'considerar descontos ou promoções especiais de Black Friday' },
];

// One-off windows for specific, well-documented events. Remove/replace once
// the date has passed and the next occurrence is confirmed.
const ONE_OFF_WINDOWS = [
  { start: '2026-06-11', end: '2026-07-19', nome: 'Copa do Mundo FIFA 2026', sugestao: 'aproveitar dias de jogo (principalmente do Brasil) para promoções, telão e horário estendido' },
];

/**
 * Returns commemorative dates/events happening today or within the next
 * `lookaheadDays` days, so the assistant can suggest planning ahead instead
 * of only reacting on the exact day. Ongoing windows (like a World Cup) are
 * flagged with `em_andamento: true` and `dias_ate: 0`.
 */
export function getActiveSeasonalContext(referenceDate = new Date().toISOString().slice(0, 10), { lookaheadDays = LOOKAHEAD_DAYS } = {}) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const referenceMs = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getTime();
  const matches = [];

  const considerDateKey = (dateKey, nome, sugestao) => {
    const diasAte = Math.round((new Date(`${dateKey}T12:00:00Z`).getTime() - referenceMs) / DAY_MS);
    if (diasAte >= 0 && diasAte <= lookaheadDays) matches.push({ nome, sugestao, dias_ate: diasAte });
  };

  for (const entry of RECURRING_FIXED_DATES) {
    considerDateKey(`${year}-${pad(entry.month)}-${pad(entry.day)}`, entry.nome, entry.sugestao);
    considerDateKey(`${year + 1}-${pad(entry.month)}-${pad(entry.day)}`, entry.nome, entry.sugestao);
  }
  for (const entry of RECURRING_COMPUTED_DATES) {
    considerDateKey(toDateKey(entry.compute(year)), entry.nome, entry.sugestao);
    considerDateKey(toDateKey(entry.compute(year + 1)), entry.nome, entry.sugestao);
  }
  for (const entry of ONE_OFF_WINDOWS) {
    if (referenceDate >= entry.start && referenceDate <= entry.end) {
      matches.push({ nome: entry.nome, sugestao: entry.sugestao, dias_ate: 0, em_andamento: true });
    } else {
      considerDateKey(entry.start, entry.nome, entry.sugestao);
    }
  }

  return matches.sort((a, b) => a.dias_ate - b.dias_ate);
}
