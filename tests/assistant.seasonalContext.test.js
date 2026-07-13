import { describe, expect, it } from 'vitest';
import { getActiveSeasonalContext } from '../src/lib/server/assistant/seasonalContext.js';

describe('assistant seasonal context', () => {
  it('flags an ongoing one-off window (World Cup 2026) as in progress', () => {
    const result = getActiveSeasonalContext('2026-07-13');

    expect(result).toContainEqual({ nome: 'Copa do Mundo FIFA 2026', sugestao: expect.any(String), dias_ate: 0, em_andamento: true });
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

  it('sorts multiple matches by days until, soonest first', () => {
    // Dec 25 (Natal) and Dec 31 (Véspera de Ano Novo) both fall inside a 10-day lookahead from Dec 22.
    const result = getActiveSeasonalContext('2026-12-22');
    const names = result.map((entry) => entry.nome);

    expect(names.indexOf('Natal')).toBeLessThan(names.indexOf('Véspera de Ano Novo'));
  });
});
