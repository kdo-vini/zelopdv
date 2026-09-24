import { describe, expect, it } from 'vitest';
import { ADDONS, PLANS } from '../src/lib/pricing.js';
import {
  absoluteUrl,
  buildFaqSchema,
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  formatBRL,
  ORGANIZATION,
  SITE_URL
} from '../src/lib/seo/site.js';

describe('seo/site.js', () => {
  it('absoluteUrl builds a URL from SITE_URL', () => {
    expect(absoluteUrl('/vs-saipos')).toBe(`${SITE_URL}/vs-saipos`);
    expect(absoluteUrl('vs-saipos')).toBe(`${SITE_URL}/vs-saipos`);
    expect(absoluteUrl()).toBe(SITE_URL);
    expect(absoluteUrl('https://external.example/x')).toBe('https://external.example/x');
  });

  it('formatBRL formats using pt-BR currency', () => {
    expect(formatBRL(59)).toContain('59,00');
    expect(formatBRL(59)).toContain('R$');
  });

  it('buildOrganizationSchema exposes the real company facts', () => {
    const schema = buildOrganizationSchema();
    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe(ORGANIZATION.brand);
    expect(schema.legalName).toBe(ORGANIZATION.legalName);
  });

  it('buildSoftwareApplicationSchema derives offers from PLANS and ADDONS, not literals', () => {
    const schema = buildSoftwareApplicationSchema({});
    const offerNames = schema.offers.offers.map((offer) => offer.name);

    for (const plan of Object.values(PLANS)) {
      expect(offerNames).toContain(plan.name);
      const offer = schema.offers.offers.find((o) => o.name === plan.name);
      expect(offer.price).toBe(plan.price.toFixed(2));
      expect(offer.priceCurrency).toBe('BRL');
    }

    for (const addon of Object.values(ADDONS)) {
      expect(offerNames).toContain(addon.name);
      const offer = schema.offers.offers.find((o) => o.name === addon.name);
      expect(offer.price).toBe(addon.price.toFixed(2));
    }

    const allPrices = [
      ...Object.values(PLANS).map((p) => p.price),
      ...Object.values(ADDONS).map((a) => a.price)
    ];
    expect(Number(schema.offers.lowPrice)).toBe(Math.min(...allPrices));
    expect(Number(schema.offers.highPrice)).toBe(Math.max(...allPrices));
  });

  it('buildFaqSchema converts a generic question/answer list to FAQPage', () => {
    const schema = buildFaqSchema([{ question: 'Q1', answer: 'A1' }]);
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity[0].name).toBe('Q1');
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe('A1');
  });
});
