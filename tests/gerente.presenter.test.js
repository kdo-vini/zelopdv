import { describe, expect, it } from 'vitest';
import { confiancaHumana, getSignalPresenter, signalPresenters } from '../src/lib/gerente/signalPresenter.js';
import { getSignalPresenter as getPresenterForQuick } from '../src/lib/gerente/signalPresenter.js';

describe('gerente presenter', () => {
  it('presents every engine signal with a title and auditable fields', () => {
    for (const [type, presenter] of Object.entries(signalPresenters)) {
      expect(presenter.titulo).toBeTruthy();
      expect(getSignalPresenter({ type }).formatEvidence({}).length).toBeGreaterThan(0);
    }
  });
  it('keeps nested and metadata evidence visible in the disclosure', () => {
    const rows = signalPresenters.REVENUE_BELOW_WEEKDAY_AVG.formatEvidence({
      revenue_today: 1000,
      baseline_avg: 1200,
      delta_pct: -0.166,
      n_baseline: 6,
      baseline_values: [1100, 1300],
      window: { start: '2026-07-01', end: '2026-07-07', days: 7 },
      sample_size: 6,
      baseline_kind: 'same_weekday_avg',
      computed_at: '2026-07-08T06:00:00Z',
      engine_version: 'v1',
      is_record: false,
    });

    expect(rows.map((row) => row.label)).toEqual(expect.arrayContaining([
      'Calculado em',
      'Versao do motor',
      'Tamanho da amostra',
      'Tipo de referencia',
      'Foi recorde',
    ]));
    expect(rows.some((row) => row.label.includes('Valores da referencia 1') && row.valor.includes('1.100,00'))).toBe(true);
    expect(rows.some((row) => row.label.includes('Janela') && row.label.includes('Dias') && row.valor === '7')).toBe(true);
  });
  it('does not use prohibited copy', () => {
    expect(JSON.stringify(signalPresenters)).not.toMatch(/lucro|margem|vai acabar/i);
  });
  it('uses sample-aware confidence language', () => {
    expect(confiancaHumana(0.8, { n_baseline: 6 })).toContain('6');
    expect(confiancaHumana(0.6, { sample_size: 2 })).toContain('pouco histórico');
  });
});

describe('acaoRapida', () => {
  it('existe só para sinais de estoque e usa o nome do produto', () => {
    const p = getPresenterForQuick({ type: 'STOCK_ZERO_WITH_DEMAND', evidence: { nome_produto: 'Refri 2L' } });
    expect(p.acaoRapida.label).toBe('Pausar no cardápio');
    expect(p.acaoRapida.mensagem({ evidence: { nome_produto: 'Refri 2L' } })).toBe('pausa Refri 2L no cardápio, acabou o estoque');
    expect(getPresenterForQuick({ type: 'STOCK_COVERAGE_LOW' }).acaoRapida.label).toBe('Pausar no cardápio');
    expect(getPresenterForQuick({ type: 'REVENUE_BELOW_WEEKDAY_AVG' }).acaoRapida).toBeUndefined();
  });
});
