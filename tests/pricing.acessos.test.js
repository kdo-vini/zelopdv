import { describe, expect, it } from 'vitest';
import {
  ADDONS,
  PLANS,
  buildStripeLineItems,
  calculateValue,
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

  it('sanitizes invalid acessos selection off chat plans', () => {
    expect(sanitizeAddons('chat', { acessos: true, mesas: true, pedidos: true })).toEqual({
      mesas: false,
      pedidos: false,
      acessos: false,
    });
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
