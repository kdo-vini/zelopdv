import { describe, it, expect } from 'vitest';
import {
  localDateOf,
  dayRangeUtc,
  addDays,
  weekdayOf,
  getHourInTimezone,
  dateRange,
} from '../src/lib/server/intelligence/tz.js';

describe('localDateOf', () => {
  it('converte 02:30Z para dia anterior (BRT)', () => {
    // 2026-07-09T02:30:00Z = 2026-07-08T23:30:00 BRT → dia 08
    expect(localDateOf('2026-07-09T02:30:00.000Z')).toBe('2026-07-08');
  });

  it('mantém mesmo dia para horário comercial BRT', () => {
    // 2026-07-09T15:00:00Z = 2026-07-09T12:00:00 BRT → dia 09
    expect(localDateOf('2026-07-09T15:00:00.000Z')).toBe('2026-07-09');
  });

  it('funciona na meia-noite UTC', () => {
    // 2026-07-10T00:00:00Z = 2026-07-09T21:00:00 BRT → dia 09
    expect(localDateOf('2026-07-10T00:00:00.000Z')).toBe('2026-07-09');
  });

  it('funciona na virada de ano', () => {
    // 2027-01-01T03:00:00Z = 2027-01-01T00:00:00 BRT
    expect(localDateOf('2027-01-01T03:00:00.000Z')).toBe('2027-01-01');
    // 2027-01-01T02:59:59Z = 2026-12-31T23:59:59 BRT
    expect(localDateOf('2027-01-01T02:59:59.000Z')).toBe('2026-12-31');
  });

  it('lança erro para timestamp inválido', () => {
    expect(() => localDateOf('not-a-date')).toThrow('Invalid timestamp');
  });
});

describe('dayRangeUtc', () => {
  it('retorna start/end corretos para um dia em BRT (UTC-3)', () => {
    // 2026-07-08 em SP = 2026-07-08T03:00:00Z até 2026-07-09T03:00:00Z
    const range = dayRangeUtc('2026-07-08');
    expect(range.startIso).toBe('2026-07-08T03:00:00.000Z');
    expect(range.endIso).toBe('2026-07-09T03:00:00.000Z');
  });

  it('fecha corretamente o range', () => {
    // Venda às 02:59:59Z do dia 09 = 23:59:59 BRT do dia 08 → deve estar dentro
    const range = dayRangeUtc('2026-07-08');
    expect('2026-07-09T02:59:59.000Z' >= range.startIso).toBe(true);
    expect('2026-07-09T02:59:59.000Z' < range.endIso).toBe(true);
    // Venda às 03:00:00Z do dia 09 = 00:00:00 BRT do dia 09 → deve estar fora
    expect('2026-07-09T03:00:00.000Z' < range.endIso).toBe(false);
  });
});

describe('addDays', () => {
  it('soma dias positivos', () => {
    expect(addDays('2026-07-08', 1)).toBe('2026-07-09');
  });

  it('subtrai dias', () => {
    expect(addDays('2026-07-08', -3)).toBe('2026-07-05');
  });

  it('atravessa mês', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('atravessa ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('weekdayOf', () => {
  it('2026-07-09 é quinta-feira (4)', () => {
    expect(weekdayOf('2026-07-09')).toBe(4);
  });

  it('2026-07-05 é domingo (0)', () => {
    expect(weekdayOf('2026-07-05')).toBe(0);
  });

  it('2026-07-11 é sábado (6)', () => {
    expect(weekdayOf('2026-07-11')).toBe(6);
  });
});

describe('getHourInTimezone', () => {
  it('extrai hora BRT (UTC-3) de timestamp UTC', () => {
    // 15:00 UTC = 12:00 BRT
    expect(getHourInTimezone('2026-07-09T15:00:00.000Z')).toBe(12);
  });

  it('funciona com horário noturno BRT', () => {
    // 02:30 UTC = 23:30 BRT do dia anterior
    expect(getHourInTimezone('2026-07-09T02:30:00.000Z')).toBe(23);
  });
});

describe('dateRange', () => {
  it('gera range de datas', () => {
    const result = dateRange('2026-07-08', '2026-07-10');
    expect(result).toEqual(['2026-07-08', '2026-07-09', '2026-07-10']);
  });

  it('retorna array vazio se start > end', () => {
    const result = dateRange('2026-07-10', '2026-07-08');
    expect(result).toEqual([]);
  });
});
