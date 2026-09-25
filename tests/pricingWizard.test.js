import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATFORM_FEE,
  NICHES,
  UNIT_OPTIONS,
  getNiche,
  ingredientCost,
  ingredientsTotal,
  isIngredientCompatible,
  marginPresets,
  wizardResult,
} from '../src/lib/tools/pricingWizard.js';

describe('NICHES', () => {
  it('tem os 8 nichos com margem convertida do markup antigo (markup/(1+markup)*100)', () => {
    const byId = NICHES.reduce((acc, n) => ({ ...acc, [n.id]: n }), {});
    expect(Object.keys(byId).sort()).toEqual(
      [
        'delivery',
        'doceria',
        'hamburgueria',
        'lanchonete',
        'marmitaria',
        'mercadinho',
        'outro',
        'pizzaria',
      ].sort(),
    );

    expect(byId.marmitaria.defaultMargem).toBe(28);
    expect(byId.marmitaria.commonRange).toBe('22% a 35%');
    expect(byId.lanchonete.defaultMargem).toBe(30);
    expect(byId.lanchonete.commonRange).toBe('25% a 40%');
    expect(byId.hamburgueria.defaultMargem).toBe(32);
    expect(byId.hamburgueria.commonRange).toBe('28% a 45%');
    expect(byId.pizzaria.defaultMargem).toBe(30);
    expect(byId.pizzaria.commonRange).toBe('25% a 38%');
    expect(byId.doceria.defaultMargem).toBe(35);
    expect(byId.doceria.commonRange).toBe('30% a 50%');
    expect(byId.delivery.defaultMargem).toBe(28);
    expect(byId.delivery.commonRange).toBe('22% a 35%');
    expect(byId.mercadinho.defaultMargem).toBe(20);
    expect(byId.mercadinho.commonRange).toBe('15% a 28%');
    expect(byId.outro.defaultMargem).toBe(30);
    expect(byId.outro.commonRange).toBe('20% a 40%');
  });

  it('mantém labels, placeholders, descrições e defaultPlatformFee do PricingCalculator.svelte', () => {
    const marmitaria = getNiche('marmitaria');
    expect(marmitaria.label).toBe('Marmitaria');
    expect(marmitaria.placeholder).toBe('Marmita de frango grelhado');
    expect(marmitaria.defaultPlatformFee).toBe(true);
    expect(marmitaria.description).toBe(
      'Boa para quem vende unidade avulsa e também por app.',
    );

    const lanchonete = getNiche('lanchonete');
    expect(lanchonete.defaultPlatformFee).toBe(false);
  });
});

describe('getNiche', () => {
  it('retorna o nicho pelo id', () => {
    expect(getNiche('doceria').id).toBe('doceria');
  });

  it('cai para "outro" se o id não existir', () => {
    expect(getNiche('inexistente').id).toBe('outro');
    expect(getNiche(undefined).id).toBe('outro');
  });
});

describe('marginPresets', () => {
  it('equilibrada é a defaultMargem do nicho', () => {
    expect(marginPresets('marmitaria')).toEqual({
      competitiva: 20,
      equilibrada: 28,
      premium: 40,
    });
  });

  it('competitiva nunca fica abaixo de 5', () => {
    expect(marginPresets('mercadinho')).toEqual({
      competitiva: 12,
      equilibrada: 20,
      premium: 32,
    });
  });

  it('premium nunca passa de 80', () => {
    const presets = marginPresets('doceria');
    expect(presets).toEqual({ competitiva: 27, equilibrada: 35, premium: 47 });
  });

  it('cai para "outro" com nicho desconhecido', () => {
    expect(marginPresets('nao-existe')).toEqual(marginPresets('outro'));
  });
});

describe('UNIT_OPTIONS', () => {
  it('tem g, kg, ml, L e un com família e fator', () => {
    const values = UNIT_OPTIONS.map((u) => u.value);
    expect(values).toEqual(['g', 'kg', 'ml', 'l', 'un']);
    expect(UNIT_OPTIONS.find((u) => u.value === 'l').label).toBe('L');
    expect(UNIT_OPTIONS.find((u) => u.value === 'kg').factor).toBe(1000);
  });
});

describe('DEFAULT_PLATFORM_FEE', () => {
  it('é 12%', () => {
    expect(DEFAULT_PLATFORM_FEE).toBe(12);
  });
});

describe('isIngredientCompatible', () => {
  it('peso com peso é compatível (g/kg)', () => {
    expect(isIngredientCompatible({ purchaseUnit: 'kg', usageUnit: 'g' })).toBe(true);
  });

  it('volume com volume é compatível (ml/L)', () => {
    expect(isIngredientCompatible({ purchaseUnit: 'l', usageUnit: 'ml' })).toBe(true);
  });

  it('peso com volume é incompatível', () => {
    expect(isIngredientCompatible({ purchaseUnit: 'kg', usageUnit: 'ml' })).toBe(false);
  });
});

describe('ingredientCost', () => {
  it('converte kg (compra) para g (uso)', () => {
    const cost = ingredientCost({
      purchaseQuantity: 1,
      purchaseUnit: 'kg',
      purchasePrice: 20,
      usageQuantity: 100,
      usageUnit: 'g',
    });
    expect(cost).toBe(2);
  });

  it('converte L (compra) para ml (uso)', () => {
    const cost = ingredientCost({
      purchaseQuantity: 2,
      purchaseUnit: 'l',
      purchasePrice: 10,
      usageQuantity: 500,
      usageUnit: 'ml',
    });
    expect(cost).toBe(2.5);
  });

  it('unidades incompatíveis → 0', () => {
    const cost = ingredientCost({
      purchaseQuantity: 1,
      purchaseUnit: 'kg',
      purchasePrice: 20,
      usageQuantity: 100,
      usageUnit: 'ml',
    });
    expect(cost).toBe(0);
  });

  it('quantidade ou preço <= 0 → 0', () => {
    expect(
      ingredientCost({
        purchaseQuantity: 0,
        purchaseUnit: 'kg',
        purchasePrice: 20,
        usageQuantity: 100,
        usageUnit: 'g',
      }),
    ).toBe(0);
    expect(
      ingredientCost({
        purchaseQuantity: 1,
        purchaseUnit: 'kg',
        purchasePrice: 0,
        usageQuantity: 100,
        usageUnit: 'g',
      }),
    ).toBe(0);
  });
});

describe('ingredientsTotal', () => {
  it('soma o custo de várias linhas, arredondado a 2 casas', () => {
    const rows = [
      { purchaseQuantity: 1, purchaseUnit: 'kg', purchasePrice: 20, usageQuantity: 100, usageUnit: 'g' }, // 2
      { purchaseQuantity: 2, purchaseUnit: 'l', purchasePrice: 10, usageQuantity: 500, usageUnit: 'ml' }, // 2.5
    ];
    expect(ingredientsTotal(rows)).toBe(4.5);
  });

  it('lista vazia → 0', () => {
    expect(ingredientsTotal([])).toBe(0);
  });
});

describe('wizardResult', () => {
  it('com taxa: base 8 + embalagem 1,5 + outros 0,5, taxa 12%, margem 30% → custoDireto 10, sugerido 17,24, margem 30, precoMinimo 11,36', () => {
    const result = wizardResult({ custoBase: 8, embalagem: 1.5, outros: 0.5, taxa: 12, margem: 30 });
    expect(result.custoDireto).toBe(10);
    expect(result.sugerido).toBe(17.24);
    expect(result.margem).toBe(30);
    expect(result.precoMinimo).toBe(11.36);
    expect(result.valido).toBe(true);
  });

  it('sem taxa: custoBase 10, margem 50% → sugerido 20, precoMinimo == custoDireto', () => {
    const result = wizardResult({ custoBase: 10, margem: 50 });
    expect(result.custoDireto).toBe(10);
    expect(result.sugerido).toBe(20);
    expect(result.precoMinimo).toBe(10);
    expect(result.margem).toBe(50);
    expect(result.status).toBe('ok');
    expect(result.valido).toBe(true);
  });

  it('margem + taxa >= 100% → inválido, sugerido e precoMinimo continuam calculando o que der', () => {
    const result = wizardResult({ custoBase: 10, taxa: 15, margem: 90 });
    expect(result.sugerido).toBeNull();
    expect(result.valido).toBe(false);
  });

  it('custoDireto <= 0 → precoMinimo null e inválido', () => {
    const result = wizardResult({ custoBase: 0, margem: 30, taxa: 12 });
    expect(result.custoDireto).toBe(0);
    expect(result.precoMinimo).toBeNull();
    expect(result.valido).toBe(false);
  });
});
