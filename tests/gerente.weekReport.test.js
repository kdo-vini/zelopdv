import { describe, expect, it } from 'vitest';
import { businessDateKey, buildWeekReport, getWeekStart, normalizeWeekStart } from '../src/lib/gerente/weekReport.js';

const snapshot = (date, receita, vendas, metrics = {}) => ({
  snapshot_date: date,
  receita_bruta: receita,
  receita_realizada: receita - (metrics.fiado_emitido || 0),
  qtd_vendas: vendas,
  ticket_medio: vendas ? receita / vendas : null,
  metrics: { mix_pagamentos: {}, por_produto: [], custos_plataforma: 0, ...metrics },
});

describe('buildWeekReport', () => {
  it('uses the Brazil business date at the UTC rollover', () => {
    const lateSundayUtc = new Date('2026-08-03T02:30:00.000Z');

    expect(businessDateKey(lateSundayUtc)).toBe('2026-08-02');
    expect(getWeekStart(businessDateKey(lateSundayUtc))).toBe('2026-07-27');
  });

  it('normalizes arbitrary dates and clamps navigation to eight weeks', () => {
    expect(normalizeWeekStart('2026-07-12', '2026-07-13')).toBe('2026-07-06');
    expect(normalizeWeekStart('2026-07-20', '2026-07-13')).toBe('2026-07-13');
    expect(normalizeWeekStart('2026-05-01', '2026-07-13')).toBe('2026-05-25');
    expect(normalizeWeekStart('2026-02-31', '2026-07-13')).toBe('2026-07-13');
  });

  it('aggregates a selected Monday-to-Sunday week and compares it to the prior week', () => {
    const snapshots = [
      snapshot('2026-07-06', 100, 10, { por_produto: [{ id_produto: 1, nome: 'X-Salada', qtd: 4, receita: 40 }], mix_pagamentos: { pix: 70, dinheiro: 30 }, custos_plataforma: 5 }),
      snapshot('2026-07-07', 200, 20, { por_produto: [{ id_produto: 2, nome: 'Suco', qtd: 8, receita: 80 }], mix_pagamentos: { pix: 200 }, custos_plataforma: 10 }),
      snapshot('2026-06-29', 150, 15, { por_produto: [{ id_produto: 2, nome: 'Suco', qtd: 9, receita: 90 }], mix_pagamentos: { dinheiro: 150 }, custos_plataforma: 7 }),
    ];
    const report = buildWeekReport(snapshots, [], '2026-07-06');

    expect(report.current.receita).toBe(300);
    expect(report.current.vendas).toBe(30);
    expect(report.current.ticket).toBe(10);
    expect(report.current.resultadoOperacional).toBe(285);
    expect(report.deltas.receita).toBe(1);
    expect(report.daily).toHaveLength(7);
    expect(report.products[0]).toMatchObject({ nome: 'Suco', receita: 80, positionChange: 0 });
    expect(report.paymentMix).toContainEqual(expect.objectContaining({ label: 'Pix', value: 270 }));
  });

  it('marks incomplete weeks and avoids invalid percentage deltas', () => {
    const report = buildWeekReport([snapshot('2026-07-06', 100, 0)], [], '2026-07-06', { today: '2026-07-08' });
    expect(report.isCurrentWeek).toBe(true);
    expect(report.isIncomplete).toBe(true);
    expect(report.deltas.receita).toBeNull();
    expect(report.current.ticket).toBe(0);
  });

  it('includes only signals from the selected week', () => {
    const report = buildWeekReport([], [
      { id: 1, signal_date: '2026-07-07', type: 'AVG_TICKET_DOWN', severity: 'attention' },
      { id: 2, signal_date: '2026-07-13', type: 'STOCK_ZERO_WITH_DEMAND', severity: 'critical' },
    ], '2026-07-06');
    expect(report.signals).toHaveLength(1);
    expect(report.signals[0].id).toBe(1);
  });

  it('does not use prohibited financial copy', () => {
    expect(JSON.stringify(buildWeekReport([], [], '2026-07-06'))).not.toMatch(/lucro|margem|vai acabar/i);
  });
});
