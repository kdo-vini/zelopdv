#!/usr/bin/env node
/**
 * Visual diff between two running deployments of the app (docs/DESIGN_SYSTEM.md → Migração).
 *
 *   BASE_URL=https://zelopdv.com.br HEAD_URL=https://<preview>.vercel.app node scripts/visual-diff.mjs
 *   BASE_URL=http://localhost:4302 HEAD_URL=http://localhost:4301 ROUTES=/,/login node scripts/visual-diff.mjs
 *
 * For every route × viewport it screenshots BASE twice (to measure noise) and HEAD once,
 * counts pixels whose channel delta > 8 and flags a route when the change exceeds the noise.
 * Diff PNGs go to OUT_DIR (default: .visual-diff/). Exit code 1 when any route is flagged and
 * EXPECT=same (use it for "no visual change" phases); EXPECT=change only reports.
 * HEAD_QUERY (e.g. "tema=novo") is appended to HEAD URLs to preview a surface.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;
const HEAD_URL = process.env.HEAD_URL;
if (!BASE_URL || !HEAD_URL) {
  console.error('Set BASE_URL and HEAD_URL.');
  process.exit(2);
}
const DEFAULT_ROUTES = [
  '/', '/login', '/cadastro', '/esqueci-senha', '/precificacao', '/extensoes', '/vs-planilha', '/comparativos',
  '/blog', '/sobre', '/contato', '/termos', '/zelo-impressao', '/para-padaria', '/app', '/gestao',
];
const ROUTES = (process.env.ROUTES || DEFAULT_ROUTES.join(',')).split(',').map((r) => r.trim()).filter(Boolean);
const VIEWPORTS = [[1440, 900], [390, 844]];
const OUT_DIR = process.env.OUT_DIR || '.visual-diff';
const EXPECT = process.env.EXPECT || 'same';
const HEAD_QUERY = process.env.HEAD_QUERY || '';
const THRESHOLD = 8;

const withQuery = (url, query) => (query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const comparer = await (await browser.newContext()).newPage();

async function countDiff(a, b) {
  return comparer.evaluate(async ([a64, b64, threshold]) => {
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = `data:image/png;base64,${src}`; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(ia, 0, 0); const da = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h); ctx.drawImage(ib, 0, 0); const db = ctx.getImageData(0, 0, w, h);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db.data[i]), Math.abs(da[i + 1] - db.data[i + 1]), Math.abs(da[i + 2] - db.data[i + 2]));
      if (d > threshold) { n++; db.data[i] = 255; db.data[i + 1] = 0; db.data[i + 2] = 80; }
    }
    ctx.putImageData(db, 0, 0);
    return { n, overlay: canvas.toDataURL('image/png').split(',')[1] };
  }, [a.toString('base64'), b.toString('base64'), THRESHOLD]);
}

mkdirSync(OUT_DIR, { recursive: true });
let flagged = 0;
for (const [width, height] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'pt-BR' });
  const page = await context.newPage();
  const shot = async (url) => {
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => {});
    await page.waitForTimeout(600);
    return page.screenshot();
  };
  for (const route of ROUTES) {
    const base1 = await shot(BASE_URL + route);
    const base2 = await shot(BASE_URL + route);
    const head = await shot(withQuery(HEAD_URL + route, HEAD_QUERY));
    const noise = (await countDiff(base1, base2)).n;
    const { n: change, overlay } = await countDiff(base1, head);
    const isFlagged = change > Math.max(noise * 2, 50);
    if (isFlagged) {
      flagged++;
      const name = `${width}${route.replace(/\W+/g, '_')}`;
      writeFileSync(join(OUT_DIR, `${name}-base.png`), base1);
      writeFileSync(join(OUT_DIR, `${name}-head.png`), head);
      writeFileSync(join(OUT_DIR, `${name}-diff.png`), Buffer.from(overlay, 'base64'));
    }
    console.log(`${String(width).padStart(4)} ${route.padEnd(18)} noise=${String(noise).padStart(6)} change=${String(change).padStart(7)} ${isFlagged ? 'CHANGED' : 'same'}`);
  }
  await context.close();
}
await browser.close();
console.log(`\n${flagged} route/viewport pair(s) changed. Diff images in ${OUT_DIR}/`);
if (EXPECT === 'same' && flagged > 0) process.exit(1);
