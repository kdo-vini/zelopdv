import { describe, expect, it } from 'vitest';
import { confiancaHumana, getSignalPresenter, signalPresenters } from '../src/lib/gerente/signalPresenter.js';

describe('gerente presenter', () => {
  it('presents every engine signal with a title and auditable fields', () => {
    for (const [type, presenter] of Object.entries(signalPresenters)) {
      expect(presenter.titulo).toBeTruthy();
      expect(getSignalPresenter({ type }).formatEvidence({}).length).toBeGreaterThan(0);
    }
  });
  it('does not use prohibited copy', () => {
    expect(JSON.stringify(signalPresenters)).not.toMatch(/lucro|margem|vai acabar/i);
  });
  it('uses sample-aware confidence language', () => {
    expect(confiancaHumana(0.8, { n_baseline: 6 })).toContain('6');
    expect(confiancaHumana(0.6, { sample_size: 2 })).toContain('pouco histórico');
  });
});
