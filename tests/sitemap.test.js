import { describe, expect, it } from 'vitest';
import { GET } from '../src/routes/sitemap.xml/+server.js';
import { segmentPages } from '../src/lib/data/segmentLandingPages.js';
import { competitorComparisons } from '../src/lib/data/competitorComparisons.js';
import { SITE_URL } from '../src/lib/seo/site.js';

// Sitemap dinâmico: cada URL de /vs-* e /para-* deve carregar o <lastmod> do
// updatedAt real da entrada (ver src/routes/sitemap.xml/+server.js), do
// mesmo jeito que os posts do blog já fazem com post.updatedAt.
describe('sitemap.xml', () => {
  async function fetchXml() {
    const response = GET();
    return response.text();
  }

  it('uses each vs-* entry\'s updatedAt as lastmod', async () => {
    const xml = await fetchXml();
    for (const comparison of Object.values(competitorComparisons)) {
      const locIndex = xml.indexOf(`<loc>${SITE_URL}/${comparison.slug}</loc>`);
      expect(locIndex, `missing <loc> for ${comparison.slug}`).toBeGreaterThan(-1);

      const urlBlockEnd = xml.indexOf('</url>', locIndex);
      const urlBlock = xml.slice(locIndex, urlBlockEnd);
      expect(urlBlock, `${comparison.slug} missing lastmod`).toContain(
        `<lastmod>${comparison.updatedAt}</lastmod>`
      );
    }
  });

  it('uses each para-* entry\'s updatedAt as lastmod', async () => {
    const xml = await fetchXml();
    for (const page of Object.values(segmentPages)) {
      const locIndex = xml.indexOf(`<loc>${SITE_URL}/${page.slug}</loc>`);
      expect(locIndex, `missing <loc> for ${page.slug}`).toBeGreaterThan(-1);

      const urlBlockEnd = xml.indexOf('</url>', locIndex);
      const urlBlock = xml.slice(locIndex, urlBlockEnd);
      expect(urlBlock, `${page.slug} missing lastmod`).toContain(`<lastmod>${page.updatedAt}</lastmod>`);
    }
  });
});
