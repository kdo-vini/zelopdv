import { describe, expect, it } from 'vitest';
import { computeDayStrip } from '../src/lib/gerente/dayStrip.js';

const snap = (date, receita, vendas, ticket, mix) => ({ snapshot_date: date, receita_bruta: receita, qtd_vendas: vendas, ticket_medio: ticket, metrics: { mix_pagamentos: mix } });
const mix = (pix, dinheiro, cartao) => ({ pix, dinheiro, cartao, vale_refeicao: 0, fiado: 0, outros: 0 });

describe('computeDayStrip', () => {
  it('compara com a média do mesmo dia da semana', () => {
    const snapshots = [
      snap('2026-09-01', 1240, 38, 32.63, mix(756, 200, 284)), // terça
      snap('2026-08-31', 900, 30, 30, mix(500, 100, 300)),
      snap('2026-08-25', 1500, 40, 37.5, mix(900, 200, 400)), // terça anterior
      snap('2026-08-18', 1524, 42, 36.29, mix(900, 224, 400)), // terça anterior
    ];
    const s = computeDayStrip(snapshots);
    expect(s.date).toBe('2026-09-01');
    expect(s.receita).toBe(1240);
    expect(s.receitaDeltaPct).toBeCloseTo(-0.18, 2);
    expect(s.vendas).toBe(38);
    expect(s.vendasMedia).toBe(41);
    expect(s.ticketDeltaPct).toBeCloseTo(-0.116, 2);
    expect(s.pixShare).toBeCloseTo(0.61, 2);
    expect(s.spark.map((p) => p.kind)).toEqual(['day', 'day', 'day', 'now']);
    expect(s.spark.at(-1)).toEqual({ date: '2026-09-01', value: 1240, kind: 'now' });
  });

  it('cai para a média dos dias anteriores quando não há mesmo dia da semana', () => {
    const s = computeDayStrip([snap('2026-09-01', 1000, 20, 50, mix(0, 0, 0)), snap('2026-08-31', 500, 10, 50, mix(0, 0, 0))]);
    expect(s.receitaDeltaPct).toBeCloseTo(1, 2);
    expect(s.pixShare).toBeNull();
  });

  it('devolve nulos sem histórico', () => {
    expect(computeDayStrip([])).toBeNull();
    const s = computeDayStrip([snap('2026-09-01', 1000, 20, 50, mix(100, 0, 0))]);
    expect(s.receitaDeltaPct).toBeNull();
    expect(s.vendasMedia).toBeNull();
    expect(s.spark).toEqual([{ date: '2026-09-01', value: 1000, kind: 'now' }]);
  });
});
