import { describe, expect, it } from 'vitest';
import { models, calcMinSel } from '../src/lib/modifierModels.js';

/**
 * Model → technical fields mapping (section 2.1 of the redesign spec).
 *
 * These tests lock the contract so a future refactor cannot silently
 * change the mapping. The models array is imported from the real source.
 */

describe('Model → technical fields mapping (spec section 2.1)', () => {
  it('has four generic models plus pizza composition', () => {
    expect(models).toHaveLength(5);
  });

  it('"Troca o preço" maps to variacao/substituir with allowsQuantity=false', () => {
    const m = models.find((m) => m.id === 'variacao_substituir');
    expect(m.tipo).toBe('variacao');
    expect(m.modo_preco).toBe('substituir');
    expect(m.permite_quantidade).toBe(false);
  });

  it('"Soma ao preço" maps to adicional/somar with allowsQuantity=false', () => {
    const m = models.find((m) => m.id === 'adicional_somar');
    expect(m.tipo).toBe('adicional');
    expect(m.modo_preco).toBe('somar');
    expect(m.permite_quantidade).toBe(false);
  });

  it('"Incluída" maps to adicional/somar with allowsQuantity=false', () => {
    const m = models.find((m) => m.id === 'adicional_incluida');
    expect(m.tipo).toBe('adicional');
    expect(m.modo_preco).toBe('somar');
    expect(m.permite_quantidade).toBe(false);
  });

  it('"Quantidade" maps to adicional/somar with allowsQuantity=true', () => {
    const m = models.find((m) => m.id === 'adicional_quantidade');
    expect(m.tipo).toBe('adicional');
    expect(m.modo_preco).toBe('somar');
    expect(m.permite_quantidade).toBe(true);
  });

  it('each model has an icon component (not a string)', () => {
    for (const m of models) {
      expect(typeof m.icon).toBe('function');
    }
  });

  it('each model has an example function', () => {
    for (const m of models) {
      expect(typeof m.example).toBe('function');
      expect(typeof m.example('Teste')).toBe('string');
    }
  });
});

describe('calcMinSel — _required toggle → min_selecoes', () => {
  it('returns 1 when _required is true', () => {
    expect(calcMinSel(true)).toBe(1);
  });

  it('returns 0 when _required is false', () => {
    expect(calcMinSel(false)).toBe(0);
  });

  it('returns 0 when _required is undefined (default)', () => {
    expect(calcMinSel(undefined)).toBe(0);
  });

  it('returns 0 when _required is null', () => {
    expect(calcMinSel(null)).toBe(0);
  });
});
