/**
 * @file Módulo puro de timezone para o Zelo Intelligence Engine.
 * Usa Intl.DateTimeFormat nativo — zero dependências.
 * Fuso canônico: America/Sao_Paulo (UTC-3, sem DST desde 2019).
 *
 * Nenhuma destas funções toca I/O, Date.now() ou variáveis de ambiente.
 * A hora é sempre injetada como parâmetro.
 */

import { ENGINE_TIMEZONE } from './config.js';

/**
 * Converte um timestamp ISO (UTC) para data local America/Sao_Paulo.
 * @param {string} isoTimestamp - ISO string (ex: '2026-07-09T02:30:00.000Z')
 * @returns {string} data no formato 'YYYY-MM-DD'
 */
export function localDateOf(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ENGINE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Retorna o offset UTC (em horas) para America/Sao_Paulo em uma dada data.
 * Exemplo: para 2026-07-08, retorna 3 (significa que UTC = local + 3h).
 * Usa um ponto de referência ao meio-dia UTC para determinar o offset.
 * @param {string} localDate - 'YYYY-MM-DD'
 * @returns {number} offset em horas (positivo = UTC à frente do local)
 */
function getOffsetHours(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  // Referência: meio-dia UTC no target date
  const ref = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: ENGINE_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(ref);
  const spHour = Number(parts.find((p) => p.type === 'hour').value);
  // Se meio-dia UTC = 9h BRT, offset = 3. Se = 10h (DST hipotético), offset = 2.
  return 12 - spHour;
}

/**
 * Retorna os instantes UTC (ISO) que delimitam um dia local America/Sao_Paulo.
 * @param {string} localDate - 'YYYY-MM-DD'
 * @returns {{ startIso: string, endIso: string }}
 */
export function dayRangeUtc(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const offsetHours = getOffsetHours(localDate);
  // start = meia-noite local em UTC = Date.UTC(y, m-1, d, offsetHours)
  // end = meia-noite do dia seguinte em UTC
  const startUtc = new Date(Date.UTC(y, m - 1, d, offsetHours, 0, 0));
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1, offsetHours, 0, 0));
  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
  };
}

/**
 * Soma dias a uma data local.
 * @param {string} localDate - 'YYYY-MM-DD'
 * @param {number} n - número de dias (negativo para subtrair)
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDays(localDate, n) {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Retorna o dia da semana (0=domingo, 6=sábado) para uma data local.
 * @param {string} localDate - 'YYYY-MM-DD'
 * @returns {number} 0-6
 */
export function weekdayOf(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.getUTCDay();
}

/**
 * Extrai a hora local (America/Sao_Paulo) de um timestamp ISO.
 * @param {string} isoTimestamp
 * @returns {number} 0-23
 */
export function getHourInTimezone(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: ENGINE_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour').value);
}

/**
 * Gera um array de datas entre startDate (inclusive) e endDate (inclusive).
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate - 'YYYY-MM-DD'
 * @returns {string[]} array de 'YYYY-MM-DD'
 */
export function dateRange(startDate, endDate) {
  const dates = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}
