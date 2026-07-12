import { describe, it, expect } from 'vitest';
import { rankSignals, applyCooldown } from '../src/lib/server/intelligence/ranking.js';

/**
 * Cria um sinal fixture mínimo.
 */
function makeSignal(overrides = {}) {
  return {
    type: overrides.type ?? 'REVENUE_BELOW_WEEKDAY_AVG',
    dedupe_key: overrides.dedupe_key ?? 'REVENUE_BELOW_WEEKDAY_AVG',
    severity: overrides.severity ?? 'attention',
    confidence: overrides.confidence ?? 0.9,
    score: 0,
    evidence: {
      computed_at: '2026-07-09T15:00:00.000Z',
      engine_version: 'v1.0.0',
      delta_pct: -0.20,
      ...(overrides.evidence || {}),
    },
    cooldown_days: overrides.cooldown_days ?? 3,
    ...overrides,
  };
}

describe('rankSignals', () => {
  it('filtra sinais com confidence < 0.5', () => {
    const signals = [
      makeSignal({ confidence: 0.9, severity: 'critical' }),
      makeSignal({ confidence: 0.3, dedupe_key: 'SINAL_BAIXO' }),
    ];
    const result = rankSignals(signals);
    expect(result.selected.length).toBe(1);
    expect(result.selected[0].dedupe_key).toBe('REVENUE_BELOW_WEEKDAY_AVG');
    expect(result.suppressed).toBe(0); // 1 filtered out by confidence gate, not ranking
  });

  it('seleciona max 3 sinais por dia', () => {
    const signals = [];
    for (let i = 1; i <= 5; i++) {
      signals.push(makeSignal({
        type: `SIGNAL_${i}`,
        dedupe_key: `SIGNAL_${i}`,
        confidence: 0.8,
        severity: 'attention',
      }));
    }
    const result = rankSignals(signals, { maxPerDay: 3 });
    expect(result.selected.length).toBe(3);
    expect(result.suppressed).toBe(2);
  });

  it('critical scores higher than info', () => {
    const signals = [
      makeSignal({ severity: 'info', dedupe_key: 'INFO', evidence: { delta_pct: 0.3 } }),
      makeSignal({ severity: 'critical', dedupe_key: 'CRIT', evidence: { delta_pct: -0.2 } }),
    ];
    const result = rankSignals(signals);
    expect(result.selected[0].dedupe_key).toBe('CRIT');
  });

  it('all selected signals have score > 0', () => {
    const signals = [
      makeSignal({ severity: 'critical', confidence: 0.9, evidence: { delta_pct: -0.5 } }),
      makeSignal({ severity: 'attention', confidence: 0.8, dedupe_key: 'A' }),
      makeSignal({ severity: 'info', confidence: 0.6, dedupe_key: 'B' }),
    ];
    const result = rankSignals(signals);
    for (const s of result.selected) {
      expect(s.score).toBeGreaterThan(0);
    }
  });

  it('scores map includes all passed signals', () => {
    const signals = [
      makeSignal({ dedupe_key: 'A', confidence: 0.9, severity: 'critical' }),
      makeSignal({ dedupe_key: 'B', confidence: 0.8, severity: 'attention' }),
    ];
    const result = rankSignals(signals);
    expect(Object.keys(result.scores)).toContain('A');
    expect(Object.keys(result.scores)).toContain('B');
  });
});

describe('applyCooldown', () => {
  it('remove sinal emitido dentro do cooldown', () => {
    const signals = [
      makeSignal({ dedupe_key: 'REVENUE_BELOW_WEEKDAY_AVG', cooldown_days: 3 }),
    ];
    const lastDates = new Map([
      ['REVENUE_BELOW_WEEKDAY_AVG', '2026-07-07'], // 2 dias atrás
    ]);
    const cooldowns = new Map();
    const result = applyCooldown(signals, lastDates, cooldowns, '2026-07-09');
    expect(result.filtered.length).toBe(0);
    expect(result.suppressedCooldown).toBe(1);
  });

  it('permite sinal após cooldown expirar', () => {
    const signals = [
      makeSignal({ dedupe_key: 'REVENUE_BELOW_WEEKDAY_AVG', cooldown_days: 3 }),
    ];
    const lastDates = new Map([
      ['REVENUE_BELOW_WEEKDAY_AVG', '2026-07-05'], // 4 dias atrás
    ]);
    const cooldowns = new Map();
    const result = applyCooldown(signals, lastDates, cooldowns, '2026-07-09');
    expect(result.filtered.length).toBe(1);
    expect(result.suppressedCooldown).toBe(0);
  });

  it('permite sinal quando não há último sinal registrado', () => {
    const signals = [
      makeSignal({ dedupe_key: 'NEW_SIGNAL', cooldown_days: 3 }),
    ];
    const lastDates = new Map();
    const cooldowns = new Map();
    const result = applyCooldown(signals, lastDates, cooldowns, '2026-07-09');
    expect(result.filtered.length).toBe(1);
  });
});
