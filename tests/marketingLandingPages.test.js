import { describe, expect, it } from 'vitest';
import { segmentPages } from '../src/lib/data/segmentLandingPages.js';
import { competitorComparisons } from '../src/lib/data/competitorComparisons.js';
import { SITE_URL } from '../src/lib/seo/site.js';
import { PLANS } from '../src/lib/pricing.js';

// Guards the fields SegmentLandingPage.svelte and CompetitorComparison.svelte
// read directly (see src/routes/para-[slug]/+page.svelte and
// src/routes/vs-[slug]/+page.svelte). A missing field here renders a blank
// section or throws in the component, not a build error.
const SEGMENT_REQUIRED_FIELDS = [
  'slug',
  'meta',
  'segmentName',
  'heroBadge',
  'h1',
  'subtitle',
  'highlights',
  'problemTitle',
  'problemParagraphs',
  'problemPoints',
  'featuresTitle',
  'featuresIntro',
  'features',
  'howTitle',
  'howIntro',
  'steps',
  'faqSpecific',
  'finalCtaTitle',
  'finalCtaText'
];

const COMPARISON_REQUIRED_FIELDS = [
  'slug',
  'competitor',
  'priceCheckedAt',
  'meta',
  'heroBadge',
  'h1',
  'subtitle',
  'editorialThesis',
  'priceAnchor',
  'introTitle',
  'introParagraphs',
  'comparisonIntro',
  'comparisonRows',
  'reasonsTitle',
  'reasons',
  'fairnessNote',
  'faqSpecific',
  'sources',
  'finalCtaTitle',
  'finalCtaText'
];

describe('segmentPages (/para-*)', () => {
  const pages = Object.values(segmentPages);

  it('has at least the pre-existing 5 segments plus the 4 new ones', () => {
    expect(pages.length).toBeGreaterThanOrEqual(9);
  });

  it('every entry has all fields SegmentLandingPage.svelte reads', () => {
    for (const page of pages) {
      for (const field of SEGMENT_REQUIRED_FIELDS) {
        expect(page[field], `${page.slug ?? '(no slug)'} missing "${field}"`).toBeDefined();
      }
    }
  });

  it('every slug is unique and starts with para-', () => {
    const slugs = pages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^para-/);
    }
  });

  // src/routes/para-[slug] resolve a página por `segmentPages[params.slug]`,
  // então a chave do objeto precisa ser exatamente o slug sem o prefixo —
  // senão o sitemap e o llms.txt apontam para um 404.
  it('every key matches its slug so /para-[slug] resolves', () => {
    for (const [key, page] of Object.entries(segmentPages)) {
      expect(`para-${key}`).toBe(page.slug);
    }
  });

  it('every canonical URL is under SITE_URL and matches the slug', () => {
    for (const page of pages) {
      expect(page.meta.canonical).toBe(`${SITE_URL}/${page.slug}`);
    }
  });

  it('every meta has a title and description', () => {
    for (const page of pages) {
      expect(page.meta.title).toBeTruthy();
      expect(page.meta.description).toBeTruthy();
    }
  });

  it('every faqSpecific array is non-empty with question + answer pairs', () => {
    for (const page of pages) {
      expect(Array.isArray(page.faqSpecific)).toBe(true);
      expect(page.faqSpecific.length).toBeGreaterThan(0);
      for (const faq of page.faqSpecific) {
        expect(faq.question).toBeTruthy();
        expect(faq.answer).toBeTruthy();
      }
    }
  });

  it('every highlights/problemParagraphs/problemPoints/features/steps array is non-empty', () => {
    for (const page of pages) {
      expect(page.highlights.length).toBeGreaterThan(0);
      expect(page.problemParagraphs.length).toBeGreaterThan(0);
      expect(page.problemPoints.length).toBeGreaterThan(0);
      expect(page.features.length).toBeGreaterThan(0);
      expect(page.steps.length).toBeGreaterThan(0);
    }
  });

  describe('new segments (2026-09-24 wave)', () => {
    const newSlugs = ['para-acaiterias', 'para-pizzarias', 'para-food-trucks', 'para-marmitarias'];

    it('are all present', () => {
      const slugs = pages.map((p) => p.slug);
      for (const slug of newSlugs) {
        expect(slugs).toContain(slug);
      }
    });

    it('honestly denies scale/weight-based selling instead of claiming it as a feature', () => {
      const acai = pages.find((p) => p.slug === 'para-acaiterias');
      const scaleFaq = acai.faqSpecific.find((f) => /balança/i.test(f.question));
      // Must exist as an explicit FAQ, and must deny it (not claim it as a feature).
      expect(scaleFaq).toBeDefined();
      expect(scaleFaq.answer.toLowerCase()).toMatch(/^não\./);
    });
  });
});

describe('competitorComparisons (/vs-*)', () => {
  const comparisons = Object.values(competitorComparisons);

  it('has at least the pre-existing 11 comparisons plus the 2 new ones', () => {
    expect(comparisons.length).toBeGreaterThanOrEqual(13);
  });

  it('every entry has all fields CompetitorComparison.svelte reads', () => {
    for (const c of comparisons) {
      for (const field of COMPARISON_REQUIRED_FIELDS) {
        expect(c[field], `${c.slug ?? '(no slug)'} missing "${field}"`).toBeDefined();
      }
    }
  });

  it('every slug is unique and starts with vs-', () => {
    const slugs = comparisons.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^vs-/);
    }
  });

  it('every canonical URL is under SITE_URL and matches the slug', () => {
    for (const c of comparisons) {
      expect(c.meta.canonical).toBe(`${SITE_URL}/${c.slug}`);
    }
  });

  it('every faqSpecific array is non-empty with question + answer pairs', () => {
    for (const c of comparisons) {
      expect(Array.isArray(c.faqSpecific)).toBe(true);
      expect(c.faqSpecific.length).toBeGreaterThan(0);
      for (const faq of c.faqSpecific) {
        expect(faq.question).toBeTruthy();
        expect(faq.answer).toBeTruthy();
      }
    }
  });

  it('every comparisonRows array is non-empty and every row has a valid advantage', () => {
    for (const c of comparisons) {
      expect(c.comparisonRows.length).toBeGreaterThan(0);
      for (const row of c.comparisonRows) {
        expect(row.feature).toBeTruthy();
        expect(row.competitor).toBeTruthy();
        expect(row.zelo).toBeTruthy();
        expect(['zelo', 'competitor', 'tie']).toContain(row.advantage);
      }
    }
  });

  it('every sources array is non-empty with label + url', () => {
    for (const c of comparisons) {
      expect(Array.isArray(c.sources)).toBe(true);
      expect(c.sources.length).toBeGreaterThan(0);
      for (const source of c.sources) {
        expect(source.label).toBeTruthy();
        expect(source.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it('does not assert a fabricated Zelo PDV price (must match pricing.js base)', () => {
    const expectedZeloPrice = `R$ ${PLANS.pdv.price.toFixed(0)}/mês`;
    for (const c of comparisons) {
      expect(c.priceAnchor.zelo).toBe(expectedZeloPrice);
    }
  });

  describe('new comparisons (2026-09-24 wave)', () => {
    const newSlugs = ['vs-consumer', 'vs-kyte'];

    it('are all present', () => {
      const slugs = comparisons.map((c) => c.slug);
      for (const slug of newSlugs) {
        expect(slugs).toContain(slug);
      }
    });

    it('have a dated priceCheckedAt and at least one official source', () => {
      for (const slug of newSlugs) {
        const c = comparisons.find((x) => x.slug === slug);
        expect(c.priceCheckedAt).toBeTruthy();
        expect(c.sources.length).toBeGreaterThan(0);
      }
    });
  });
});
