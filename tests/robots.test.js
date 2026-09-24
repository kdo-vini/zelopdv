import { describe, expect, it } from 'vitest';
import { AI_CRAWLERS, buildRobotsTxt, DISALLOWED_PATHS } from '../src/lib/seo/robots.js';
import { SITE_URL } from '../src/lib/seo/site.js';

describe('robots.txt builder', () => {
  const txt = buildRobotsTxt();

  it('includes a "*" group with all disallowed paths', () => {
    const starGroupMatch = txt.match(/User-agent: \*\n([\s\S]*?)(?=\n\nUser-agent:|\n\nSitemap:)/);
    expect(starGroupMatch).not.toBeNull();
    for (const path of DISALLOWED_PATHS) {
      expect(starGroupMatch[1]).toContain(`Disallow: ${path}`);
    }
  });

  it('gives every AI crawler its own group with the full disallow list', () => {
    for (const agent of AI_CRAWLERS) {
      const groupMatch = txt.match(new RegExp(`User-agent: ${agent}\\n([\\s\\S]*?)(?=\\n\\nUser-agent:|\\n\\nSitemap:)`));
      expect(groupMatch, `missing group for ${agent}`).not.toBeNull();
      for (const path of DISALLOWED_PATHS) {
        expect(groupMatch[1]).toContain(`Disallow: ${path}`);
      }
    }
  });

  it('ends with a Sitemap line built from SITE_URL', () => {
    expect(txt).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});
