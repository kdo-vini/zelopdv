import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * WCAG contrast of the Zelo Design System surfaces, computed from the real CSS
 * (src/themes/*.css): var() references are resolved and translucent colours are
 * composited over the background they sit on. Text ≥ 4.5:1, UI boundaries ≥ 3:1.
 */

function declarations(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const tokens = declarations(readFileSync('src/themes/tokens.css', 'utf8'), ':root {');
const surfaces = {
  app: { ...tokens, ...declarations(readFileSync('src/themes/surface-app.css', 'utf8'), '[data-surface="app"]') },
  brand: { ...tokens, ...declarations(readFileSync('src/themes/surface-brand.css', 'utf8'), '[data-surface="brand"]') },
};

function resolveValue(vars, value, depth = 0) {
  if (depth > 10) throw new Error(`var() cycle at ${value}`);
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
  return ref ? resolveValue(vars, vars[ref[1]] ?? '', depth + 1) : value;
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = value.match(/^rgba?\(([^)]+)\)$/i) || value.match(/^rgb\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  throw new Error(`unsupported colour: ${value}`);
}

const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const luminance = ([r, g, b]) => [r, g, b]
  .map((c) => c / 255)
  .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);

function contrast(surface, fgToken, bgToken, baseToken = '--bg-app') {
  const vars = surfaces[surface];
  const base = parseColor(resolveValue(vars, vars[baseToken]));
  const bg = over(parseColor(resolveValue(vars, vars[bgToken])), base);
  const fg = over(parseColor(resolveValue(vars, vars[fgToken])), bg);
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const TEXT = 4.5;
const UI = 3;

describe.each(['app', 'brand'])('%s surface contrast', (surface) => {
  it.each([
    ['--text-main', '--bg-app'], ['--text-main', '--bg-panel'], ['--text-main', '--bg-card'],
    ['--text-label', '--bg-panel'], ['--text-muted', '--bg-app'], ['--text-muted', '--bg-panel'],
    ['--primary-text', '--primary'], ['--primary-text', '--primary-hover'],
    ['--status-success-text', '--bg-panel'], ['--status-warning-text', '--bg-panel'], ['--status-error-text', '--bg-panel'],
    ['--status-success-text', '--status-success-bg'], ['--status-warning-text', '--status-warning-bg'], ['--status-error-text', '--status-error-bg'],
  ])('text %s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(surface, fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });

  it('the primary action stands out from the page (≥ 3:1)', () => {
    expect(contrast(surface, '--primary', '--bg-app')).toBeGreaterThanOrEqual(UI);
  });
});

describe('light form card nested on brand', () => {
  it('app ink on the white input stays AA', () => {
    expect(contrast('app', '--text-main', '--bg-input')).toBeGreaterThanOrEqual(TEXT);
    expect(contrast('app', '--text-muted', '--bg-input')).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('documented ratios', () => {
  it('matches the numbers written in docs/DESIGN_SYSTEM.md', () => {
    expect(contrast('app', '--text-main', '--bg-panel')).toBeCloseTo(16.2, 1);
    expect(contrast('app', '--text-muted', '--bg-panel')).toBeCloseTo(5.34, 1);
    expect(contrast('app', '--text-muted', '--bg-app')).toBeCloseTo(4.85, 1);
    expect(contrast('brand', '--text-muted', '--bg-app')).toBeCloseTo(6.88, 1);
    expect(contrast('brand', '--text-muted', '--bg-card')).toBeCloseTo(5.31, 1);
  });
});
