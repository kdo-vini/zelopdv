import { describe, expect, it } from 'vitest';
import {
  extractLocUrls,
  parseArgs,
  resolveIndexNowTargets
} from '../scripts/indexnow.mjs';
import { SITE_URL } from '../src/lib/seo/site.js';

describe('indexnow helpers', () => {
  it('parses --dry-run and --site-url', () => {
    expect(parseArgs(['--dry-run'])).toEqual({ dryRun: true, siteUrl: null });
    expect(parseArgs(['--site-url', 'https://preview.example'])).toEqual({
      dryRun: false,
      siteUrl: 'https://preview.example'
    });
  });

  it('extracts loc URLs from a sitemap', () => {
    const xml = `
      <urlset>
        <url><loc>https://zelopdv.com.br/</loc></url>
        <url><loc>https://zelopdv.com.br/sobre</loc></url>
      </urlset>
    `;
    expect(extractLocUrls(xml)).toEqual([
      'https://zelopdv.com.br/',
      'https://zelopdv.com.br/sobre'
    ]);
  });

  it('uses the canonical (apex) keyLocation and sitemap for production apex or www', () => {
    const host = new URL(SITE_URL).host;
    for (const siteUrl of [SITE_URL, `https://www.${host}/`]) {
      expect(resolveIndexNowTargets(siteUrl)).toEqual({
        sitemapUrl: `${SITE_URL}/sitemap.xml`,
        keyLocation: `${SITE_URL}/indexnow-key.txt`,
        host
      });
    }
  });

  it('keeps preview/custom hosts on their own origin', () => {
    expect(resolveIndexNowTargets('https://preview.example.com')).toEqual({
      sitemapUrl: 'https://preview.example.com/sitemap.xml',
      keyLocation: 'https://preview.example.com/indexnow-key.txt',
      host: 'preview.example.com'
    });
  });
});
