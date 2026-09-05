import { describe, it, expect } from 'vitest';
import { resolvePizza, buildPizzaSignature, pizzaStartingPrice, validatePizzaConfig, pizzaStockRequirements } from '../src/lib/pizza.js';
import { buildVendaPayload } from '../src/lib/finance/saleOps.js';

const config = {
  version: 1, revision: 'revision-1', pricingMode: 'highest',
  sizes: [{ id: 'g', name: 'Grande — 8 fatias', maxFlavors: 4, active: true, stockProductId: 20 }],
  flavors: [40, 60, 50, 70].map((price, i) => ({ id: `f${i}`, name: `Sabor ${i}`, active: true, prices: { g: price } }))
};
const selection = (ids = ['f0', 'f1']) => ({ revision: config.revision, sizeId: 'g', flavorIds: ids });

describe('pizza contract', () => {
  it('carries the pizza snapshot through the sale and consumes size stock only', () => {
    const pizza = resolvePizza(config, selection()).pizza;
    const { payload } = buildVendaPayload({ itens: [{ id_produto: 10, nome: 'Pizza', quantidade: 2, preco: 60, pizza }], formaPagamento: 'pix', total: 120 });
    expect(payload.itens[0].pizza).toEqual(pizza);
    expect(payload.estoque).toEqual([{ id_produto: 20, quantidade: 2 }]);
  });
  it('charges the highest flavor, snapshots equal fractions and never links flavors to stock', () => {
    const result = resolvePizza(config, selection());
    expect(result).toMatchObject({ ok: true, baseUnitPrice: 60, pizza: { stockProductId: 20, flavors: [{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 }] } });
    expect(result.modifiers[1].selectedOptions[0].optionName).toContain('½');
    expect(JSON.stringify(result.modifiers)).not.toContain('linkedProductId');
  });
  it('averages all flavors and rounds once in cents', () => {
    const average = { ...config, pricingMode: 'average' };
    expect(resolvePizza(average, selection()).baseUnitPrice).toBe(50);
    expect(resolvePizza(average, selection(['f0', 'f1', 'f3'])).baseUnitPrice).toBe(56.67);
    expect(resolvePizza(average, selection(['f0', 'f1', 'f2', 'f3'])).baseUnitPrice).toBe(55);
    expect(resolvePizza(average, selection(['f0'])).baseUnitPrice).toBe(40);
  });
  it('rejects duplicates, incomplete selections and too many flavors', () => {
    for (const ids of [[], ['f0', 'f0'], ['f0', 'f1', 'f2', 'f3', 'f4']]) expect(resolvePizza(config, selection(ids)).ok).toBe(false);
    expect(resolvePizza({ ...config, sizes: [{ ...config.sizes[0], maxFlavors: 1 }] }, selection()).ok).toBe(false);
  });
  it('rejects missing prices, stale revisions and unavailable flavors/sizes', () => {
    expect(resolvePizza(config, { ...selection(), revision: 'old' }).code).toBe('pizza_revision_changed');
    expect(resolvePizza({ ...config, archived: true }, selection()).ok).toBe(false);
    expect(resolvePizza({ ...config, flavors: [{ ...config.flavors[0], active: false }] }, selection(['f0'])).ok).toBe(false);
    expect(resolvePizza({ ...config, flavors: [{ ...config.flavors[0], prices: {} }] }, selection(['f0'])).ok).toBe(false);
    expect(resolvePizza({ ...config, sizes: [{ ...config.sizes[0], active: false }] }, selection()).ok).toBe(false);
  });
  it('makes identity independent of click order, but sensitive to size and revision', () => {
    expect(buildPizzaSignature(selection())).toBe(buildPizzaSignature(selection(['f1', 'f0'])));
    expect(buildPizzaSignature(selection())).not.toBe(buildPizzaSignature({ ...selection(), sizeId: 'm' }));
    expect(buildPizzaSignature(selection())).not.toBe(buildPizzaSignature({ ...selection(), revision: 'new' }));
  });
  it('validates matrix and calculates the real available starting price', () => {
    expect(validatePizzaConfig(config).ok).toBe(true);
    expect(pizzaStartingPrice(config)).toBe(40);
    expect(pizzaStartingPrice({ ...config, flavors: [] })).toBe(null);
    expect(validatePizzaConfig({ ...config, pricingMode: 'sum' }).ok).toBe(false);
    expect(validatePizzaConfig({ ...config, flavors: [config.flavors[0], config.flavors[0]] }).ok).toBe(false);
    expect(validatePizzaConfig({ ...config, flavors: [{ ...config.flavors[0], prices: { g: -1 } }] }).ok).toBe(false);
  });
  it('includes required extras in the advertised starting price, respecting quantity caps', () => {
    const groups = [{ active: true, pricingMode: 'somar', minSelections: 1, maxSelections: 2, allowsQuantity: true, minTotalQuantity: 3, maxPerOption: 2, options: [{ active: true, priceDelta: 8 }, { active: true, priceDelta: 10 }] }];
    expect(pizzaStartingPrice(config, groups)).toBe(66);
    expect(pizzaStartingPrice(config, [{ ...groups[0], maxSelections: 1 }])).toBeNull();
  });
  it('replaces parent stock once and aggregates extras independently', () => {
    const pizza = resolvePizza(config, selection()).pizza;
    const extra = { selectedOptions: [{ linkedProductId: 30, quantity: 2 }] };
    expect(pizzaStockRequirements({ productId: 10, quantity: 3, pizza, modifiers: [extra] })).toEqual([{ id_produto: 20, quantidade: 3 }, { id_produto: 30, quantidade: 6 }]);
    expect(pizzaStockRequirements({ productId: 10, quantity: 1, pizza: { ...pizza, stockProductId: null } })).toEqual([{ id_produto: 10, quantidade: 1 }]);
  });
});
