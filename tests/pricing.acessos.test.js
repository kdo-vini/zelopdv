import { describe, expect, it } from 'vitest';
import {
  ADDONS,
  PLANS,
  buildStripeLineItems,
  calculateValue,
  computeStripeMonthlyValueCents,
  isAddonAllowed,
  parseStripeSubscriptionItems,
  sanitizeAddons,
} from '../src/lib/pricing.js';

describe('pricing - add-on acessos', () => {
  it('allows acessos on pdv and bundle, but not on chat', () => {
    expect(isAddonAllowed('pdv', 'acessos')).toBe(true);
    expect(isAddonAllowed('bundle', 'acessos')).toBe(true);
    expect(isAddonAllowed('chat', 'acessos')).toBe(false);
  });

  it('calculates pdv + acessos as R$ 89,00', () => {
    expect(calculateValue('pdv', { acessos: true })).toBe(89);
  });

  it('does not offer the retired Pedidos add-on', () => {
    expect(sanitizeAddons('chat', { acessos: true, mesas: true, pedidos: true })).toEqual({
      mesas: false,
      acessos: false,
      menu: false,
    });
    expect(isAddonAllowed('pdv', 'pedidos')).toBe(false);
  });

  it('includes acessos price in Stripe line items when enabled', () => {
    expect(buildStripeLineItems('pdv', { acessos: true })).toEqual([
      { price: PLANS.pdv.stripePriceId, quantity: 1 },
      { price: ADDONS.acessos.stripePriceId, quantity: 1 },
    ]);
  });

  it('parses Stripe subscription items back into plan + acessos addon', () => {
    expect(
      parseStripeSubscriptionItems([
        { price: { id: PLANS.pdv.stripePriceId } },
        { price: { id: ADDONS.acessos.stripePriceId } },
      ]),
    ).toEqual({
      planTier: 'pdv',
      addons: { acessos: true },
    });
  });
});

describe('pricing - ZeloMenu addon + price rollout (D-104)', () => {
  it('ZeloMenu addon only on pdv (chat/bundle already include it)', () => {
    expect(isAddonAllowed('pdv', 'menu')).toBe(true);
    expect(isAddonAllowed('chat', 'menu')).toBe(false);
    expect(isAddonAllowed('bundle', 'menu')).toBe(false);
  });

  it('pdv + ZeloMenu = R$ 99,00 (D-013)', () => {
    expect(calculateValue('pdv', { menu: true })).toBe(99);
  });

  it('new tier prices: chat R$149, bundle R$198', () => {
    expect(PLANS.chat.price).toBe(149);
    expect(PLANS.bundle.price).toBe(198);
  });

  it('LEGACY price IDs still map to the right plan (existing subscribers do not break)', () => {
    // Assinante v1 (R$97) cujo Stripe ainda referencia o price antigo deve continuar mapeando p/ chat.
    expect(parseStripeSubscriptionItems([{ price: { id: 'price_1TR0xGLUJWyE4PkYcBy0cOoD' } }]))
      .toEqual({ planTier: 'chat', addons: {} });
    expect(parseStripeSubscriptionItems([{ price: { id: 'price_1TR0xGLUJWyE4PkYY0DMOWLI' } }]))
      .toEqual({ planTier: 'bundle', addons: {} });
  });

  it('new v2 price IDs map to the right plan', () => {
    expect(parseStripeSubscriptionItems([{ price: { id: PLANS.chat.stripePriceId } }]))
      .toEqual({ planTier: 'chat', addons: {} });
    expect(parseStripeSubscriptionItems([{ price: { id: PLANS.bundle.stripePriceId } }]))
      .toEqual({ planTier: 'bundle', addons: {} });
  });
});

describe('computeStripeMonthlyValueCents — MRR real, não estimado', () => {
  it('sums unit_amount x quantity across plan + addon items', () => {
    expect(computeStripeMonthlyValueCents([
      { price: { unit_amount: 19800 }, quantity: 1 },
      { price: { unit_amount: 3000 }, quantity: 1 },
    ])).toBe(22800);
  });

  it('respects quantity > 1', () => {
    expect(computeStripeMonthlyValueCents([{ price: { unit_amount: 5000 }, quantity: 3 }])).toBe(15000);
  });

  it('returns null when items are unexpanded (price is just an id string)', () => {
    expect(computeStripeMonthlyValueCents([{ price: 'price_123' }])).toBeNull();
  });

  it('returns null for empty/missing items — caller must not overwrite existing value', () => {
    expect(computeStripeMonthlyValueCents([])).toBeNull();
    expect(computeStripeMonthlyValueCents(undefined)).toBeNull();
  });
});
