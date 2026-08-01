import { describe, expect, it } from 'vitest';
import { businessDateKey, getActiveSeasonalContext } from '../src/lib/server/assistant/seasonalContext.js';

describe('assistant seasonal context', () => {
  it('uses the Brazil business date at the UTC rollover', () => {
    expect(businessDateKey(new Date('2026-08-01T02:30:00.000Z'))).toBe('2026-07-31');
  });

  it('produces the same result on the same calendar date regardless of year, with no year-specific hardcoded entries', () => {
    // Fixed-date entries (Natal) must fire identically far into the future —
    // there is nothing in the calendar keyed to a specific year like 2026.
    const result2026 = getActiveSeasonalContext('2026-12-20');
    const result2030 = getActiveSeasonalContext('2030-12-20');

    expect(result2026.map((entry) => entry.nome)).toEqual(result2030.map((entry) => entry.nome));
    expect(result2026).toContainEqual(expect.objectContaining({ nome: 'Natal' }));
  });

  it('computes Carnaval correctly for a year far from when this list was written, proving it is a formula and not a hardcoded date', () => {
    // Independently verified via the same Easter algorithm: Carnaval 2030 falls in March, not February like 2026.
    expect(getActiveSeasonalContext('2030-03-02')).toContainEqual(expect.objectContaining({ nome: 'Carnaval', em_andamento: true }));
    expect(getActiveSeasonalContext('2030-02-14').find((entry) => entry.nome === 'Carnaval')).toBeUndefined();
  });

  it('looks ahead to a computed date (Black Friday) within the lookahead window', () => {
    const result = getActiveSeasonalContext('2026-11-20');

    expect(result).toContainEqual({ nome: 'Black Friday', sugestao: expect.any(String), dias_ate: 7 });
  });

  it('looks ahead to Dia das Mães (2nd Sunday of May) at the edge of the lookahead window', () => {
    const result = getActiveSeasonalContext('2026-05-01');

    expect(result).toContainEqual({ nome: 'Dia das Mães', sugestao: expect.any(String), dias_ate: 9 });
  });

  it('does not report a date that already passed this year', () => {
    const result = getActiveSeasonalContext('2026-05-15');

    expect(result.find((entry) => entry.nome === 'Dia das Mães')).toBeUndefined();
  });

  it('returns an empty list when nothing is within the lookahead window', () => {
    expect(getActiveSeasonalContext('2026-02-01')).toEqual([]);
  });

  it('flags Carnaval (computed from Easter, not hardcoded) as in progress during its window', () => {
    // Verified against independent sources for 2026: sábado 13/02 a Cinzas 18/02.
    const result = getActiveSeasonalContext('2026-02-14');

    expect(result).toContainEqual({ nome: 'Carnaval', sugestao: expect.any(String), dias_ate: 0, em_andamento: true });
  });

  it('looks ahead to Carnaval before it starts', () => {
    const result = getActiveSeasonalContext('2026-02-10');

    expect(result).toContainEqual({ nome: 'Carnaval', sugestao: expect.any(String), dias_ate: 3 });
  });

  it('flags Semana do Consumidor (fixed window) as in progress', () => {
    const result = getActiveSeasonalContext('2026-03-12');

    expect(result).toContainEqual({ nome: 'Semana do Consumidor', sugestao: expect.any(String), dias_ate: 0, em_andamento: true });
  });

  it('reports the Brazil-specific Dia dos Namorados and Dia do Cliente dates', () => {
    expect(getActiveSeasonalContext('2026-06-08')).toContainEqual({ nome: 'Dia dos Namorados', sugestao: expect.any(String), dias_ate: 4 });
    expect(getActiveSeasonalContext('2026-09-10')).toContainEqual({ nome: 'Dia do Cliente', sugestao: expect.any(String), dias_ate: 5 });
  });

  it('sorts multiple matches by days until, soonest first', () => {
    // Dec 25 (Natal) and Dec 31 (Véspera de Ano Novo) both fall inside a 10-day lookahead from Dec 22.
    const result = getActiveSeasonalContext('2026-12-22');
    const names = result.map((entry) => entry.nome);

    expect(names.indexOf('Natal')).toBeLessThan(names.indexOf('Véspera de Ano Novo'));
  });
});
