import { describe, expect, it } from 'vitest';
import {
  extractLocUrls,
  parseArgs,
  resolveIndexNowTargets
} from '../scripts/indexnow.mjs';

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

  it('uses www keyLocation and sitemap for production apex or www', () => {
    for (const siteUrl of ['https://zelopdv.com.br', 'https://www.zelopdv.com.br/']) {
      expect(resolveIndexNowTargets(siteUrl)).toEqual({
        sitemapUrl: 'https://www.zelopdv.com.br/sitemap.xml',
        keyLocation: 'https://www.zelopdv.com.br/indexnow-key.txt',
        host: 'zelopdv.com.br'
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
