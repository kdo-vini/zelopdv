/**
 * @file Rótulos de dia da semana em português (plural), compartilhados entre
 * client (greeting.js) e server (intelligence/narrative.js). Módulo puro, sem
 * I/O, para poder ser importado dos dois lados da fronteira client/server.
 */

export const WEEKDAY_PLURALS = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

/**
 * Converte um weekday (0=domingo..6=sábado) no plural em português.
 * Aceita number ou string numérica (evidence vindo de JSON/jsonb). Uma string
 * não numérica é devolvida como está, para compatibilidade com qualquer texto
 * antigo já persistido em `business_signals.evidence`. `null`/`undefined`/fora
 * do intervalo 0-6 cai no fallback.
 * @param {number|string|null|undefined} weekday
 * @param {string} fallback
 * @returns {string}
 */
export function weekdayLabel(weekday, fallback = 'datas equivalentes') {
  if (weekday == null) return fallback;
  if (typeof weekday === 'string' && weekday.trim() === '') return fallback;

  const n = Number(weekday);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return WEEKDAY_PLURALS[n];

  return typeof weekday === 'string' ? weekday.trim() : fallback;
}
