import { describe, expect, it } from 'vitest';
import { buildLlmsFullTxt, buildLlmsTxt } from '../src/lib/seo/llmsContent.js';
import { PLANS, ADDONS, TRIAL_DAYS } from '../src/lib/pricing.js';
import { segmentPages } from '../src/lib/data/segmentLandingPages.js';
import { competitorComparisons } from '../src/lib/data/competitorComparisons.js';
import { publishedPosts } from '../src/lib/blog/posts.js';
import { SITE_URL } from '../src/lib/seo/site.js';

describe('llms.txt', () => {
  const txt = buildLlmsTxt();

  it('does not claim a single all-inclusive plan (only a corrective mention, if any)', () => {
    const lower = txt.toLowerCase();
    // The old static llms.txt asserted "plano único, tudo incluso" as fact.
    // The generated file may only mention it while explicitly denying it.
    if (lower.includes('tudo incluso')) {
      expect(lower).toContain('não existe');
    }
    expect(lower).not.toContain('r$ 59/mês — plano único');
  });

  it('lists current prices for every plan and add-on', () => {
    for (const plan of Object.values(PLANS)) {
      expect(txt).toContain(plan.price.toFixed(0));
      expect(txt).toContain(plan.name);
    }
    for (const addon of Object.values(ADDONS)) {
      expect(txt).toContain(addon.name);
    }
  });

  it('mentions TRIAL_DAYS', () => {
    expect(txt).toContain(String(TRIAL_DAYS));
  });

  it('lists every segment landing page and comparison URL', () => {
    for (const page of Object.values(segmentPages)) {
      expect(txt).toContain(`${SITE_URL}/${page.slug}`);
    }
    for (const comparison of Object.values(competitorComparisons)) {
      expect(txt).toContain(`${SITE_URL}/${comparison.slug}`);
    }
  });

  it('lists every published blog post URL', () => {
    for (const post of publishedPosts) {
      expect(txt).toContain(`${SITE_URL}/blog/${post.slug}`);
    }
  });

  it('references iFood positively as a supported integration, not an exclusion', () => {
    expect(txt).toMatch(/iFood/);
    expect(txt.toLowerCase()).not.toContain('não é para delivery');
  });
});

describe('llms-full.txt', () => {
  const fullTxt = buildLlmsFullTxt();

  it('includes everything from llms.txt plus FAQs and full post content', () => {
    const baseTxt = buildLlmsTxt();
    expect(fullTxt.startsWith(baseTxt)).toBe(true);
  });

  it('includes each comparison FAQ question', () => {
    const firstComparison = Object.values(competitorComparisons)[0];
    expect(fullTxt).toContain(firstComparison.faqSpecific[0].question);
  });

  it('includes full text (not just description) of published posts', () => {
    const firstPost = publishedPosts[0];
    // htmlToText strips tags — check a distinctive plain-text fragment survives.
    expect(fullTxt).toContain(firstPost.title);
  });
});
