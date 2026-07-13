/**
 * @file Small, hand-curated calendar of commemorative/commercial dates
 * relevant to Brazilian food-service businesses. This is NOT live event data
 * pulled from anywhere — it is a static seed list, Brazil-only by design
 * (Zelo's customer base). Every entry is either a fixed month/day or a
 * formula (e.g. Carnaval from the Easter algorithm below), so the whole list
 * works correctly for any year with zero yearly maintenance — deliberately
 * no year-specific one-off entries (a past attempt to hardcode a single
 * year's World Cup window was removed for exactly this reason). Uncertain
 * dates ("dia do hambúrguer") are left out rather than risk feeding the
 * assistant a wrong date as fact.
 *
 * Sources checked when this was written (2026-07): nuvemshop.com.br,
 * serasa.com.br and querobolsa.com.br for Dia/Semana do Consumidor and Dia
 * do Cliente; calendarr.com, ifood institucional and camarotecarnaval.com
 * for Carnaval 2026 (all agree on terça-feira 17/02/2026, cross-checked
 * against the Easter algorithm below).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 10;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function fixedDateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
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

/**
 * Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm) — a fixed,
 * verifiable formula, not a guess. Cross-checked against independent sources
 * for 2026 (Carnaval terça-feira 17/02/2026, Cinzas 18/02/2026): matches.
 */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

const RECURRING_FIXED_DATES = [
  { month: 1, day: 1, nome: 'Ano Novo', sugestao: 'considerar horário especial e avisar com antecedência se o negócio vai abrir' },
  { month: 3, day: 15, nome: 'Dia do Consumidor', sugestao: 'considerar uma promoção ou desconto para clientes fiéis, no auge da Semana do Consumidor' },
  { month: 6, day: 12, nome: 'Dia dos Namorados', sugestao: 'considerar um menu ou combo especial para casais' },
  { month: 9, day: 15, nome: 'Dia do Cliente', sugestao: 'considerar um mimo, cupom ou vantagem para clientes recorrentes (foco em fidelização, diferente do Dia do Consumidor)' },
  { month: 10, day: 12, nome: 'Dia das Crianças', sugestao: 'considerar combos ou produtos voltados para famílias com crianças' },
  { month: 12, day: 25, nome: 'Natal', sugestao: 'considerar horário especial e combos temáticos de fim de ano' },
  { month: 12, day: 31, nome: 'Véspera de Ano Novo', sugestao: 'considerar horário especial e avisar com antecedência se o negócio vai abrir' },
];

// Fixed-date windows (start/end month+day, recurring every year).
const RECURRING_FIXED_WINDOWS = [
  {
    nome: 'Semana do Consumidor',
    sugestao: 'considerar promoções ou descontos ao longo da semana, não só no dia 15 — é quando o varejo brasileiro mais desconta no ano',
    start: (year) => fixedDateKey(year, 3, 9),
    end: (year) => fixedDateKey(year, 3, 15),
  },
];

const RECURRING_COMPUTED_DATES = [
  { compute: (year) => nthWeekdayOfMonth(year, 5, 0, 2), nome: 'Dia das Mães', sugestao: 'considerar combos ou promoções para presentear mães' },
  { compute: (year) => nthWeekdayOfMonth(year, 8, 0, 2), nome: 'Dia dos Pais', sugestao: 'considerar combos ou promoções para presentear pais' },
  { compute: (year) => lastWeekdayOfMonth(year, 11, 5), nome: 'Black Friday', sugestao: 'considerar descontos ou promoções especiais de Black Friday' },
];

// Windows computed relative to a moving anchor (Easter), recurring every year.
const RECURRING_COMPUTED_WINDOWS = [
  {
    nome: 'Carnaval',
    sugestao: 'considerar horário estendido e reforço de equipe — é um dos períodos de maior movimento para bares e lanchonetes',
    start: (year) => toDateKey(addDays(easterSunday(year), -51)), // sábado de Carnaval
    end: (year) => toDateKey(addDays(easterSunday(year), -46)), // quarta-feira de Cinzas
  },
];

/**
 * Returns commemorative dates/events happening today or within the next
 * `lookaheadDays` days, so the assistant can suggest planning ahead instead
 * of only reacting on the day. Ongoing windows (Carnaval, Semana do
 * Consumidor) are flagged with `em_andamento: true` and `dias_ate: 0` while
 * active; otherwise they surface once their start date enters the lookahead
 * window.
 */
export function getActiveSeasonalContext(referenceDate = new Date().toISOString().slice(0, 10), { lookaheadDays = LOOKAHEAD_DAYS } = {}) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const referenceMs = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getTime();
  const matches = [];

  const considerDateKey = (dateKey, nome, sugestao) => {
    const diasAte = Math.round((new Date(`${dateKey}T12:00:00Z`).getTime() - referenceMs) / DAY_MS);
    if (diasAte >= 0 && diasAte <= lookaheadDays) matches.push({ nome, sugestao, dias_ate: diasAte });
  };

  const considerWindow = (startKey, endKey, nome, sugestao) => {
    if (referenceDate >= startKey && referenceDate <= endKey) {
      matches.push({ nome, sugestao, dias_ate: 0, em_andamento: true });
    } else {
      considerDateKey(startKey, nome, sugestao);
    }
  };

  for (const entry of RECURRING_FIXED_DATES) {
    considerDateKey(fixedDateKey(year, entry.month, entry.day), entry.nome, entry.sugestao);
    considerDateKey(fixedDateKey(year + 1, entry.month, entry.day), entry.nome, entry.sugestao);
  }
  for (const entry of RECURRING_FIXED_WINDOWS) {
    considerWindow(entry.start(year), entry.end(year), entry.nome, entry.sugestao);
    considerWindow(entry.start(year + 1), entry.end(year + 1), entry.nome, entry.sugestao);
  }
  for (const entry of RECURRING_COMPUTED_DATES) {
    considerDateKey(toDateKey(entry.compute(year)), entry.nome, entry.sugestao);
    considerDateKey(toDateKey(entry.compute(year + 1)), entry.nome, entry.sugestao);
  }
  for (const entry of RECURRING_COMPUTED_WINDOWS) {
    considerWindow(entry.start(year), entry.end(year), entry.nome, entry.sugestao);
    considerWindow(entry.start(year + 1), entry.end(year + 1), entry.nome, entry.sugestao);
  }

  return matches.sort((a, b) => a.dias_ate - b.dias_ate);
}
