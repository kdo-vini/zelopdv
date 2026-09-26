/**
 * Resolved hex for PDF/canvas (cannot evaluate CSS vars).
 * Must stay aligned with `--chart-*` in `src/themes/derived.css` (legacy values in `surface-legacy.css`).
 */
const LEGACY_CHART_COLORS = Object.freeze({
  cash: '#10b981',
  pix: '#0EA5E9',
  debit: '#93c5fd',
  credit: '#60a5fa',
  card: '#94A3B8',
  meal: '#059669',
  fiado: '#f59e0b',
  bar: '#0EA5E9',
  platform1: '#0EA5E9',
  platform2: '#f59e0b',
  platform3: '#f87171',
  platform4: '#fbbf24',
  platform5: '#93c5fd',
  platformDefault: '#94A3B8',
  channelPdv: '#94A3B8',
  channelZelomenu: '#7A46FF',
  channelZelochat: '#25D366',
  channelMesa: '#60a5fa',
  channelManual: '#f59e0b',
  channelIfood: '#f59e0b',
});

/**
 * App surface palette (Zelo Design System, mockup 04). Must stay aligned with the
 * `[data-surface="app"]` block in `src/themes/derived.css` and `--zelo-*` in tokens.css.
 */
const APP_CHART_COLORS = Object.freeze({
  ...LEGACY_CHART_COLORS,
  cash: '#146C43',
  pix: '#011F4A',
  debit: '#4D6E9C',
  credit: '#9FB3CF',
  card: '#8A94A3',
  meal: '#3E8E68',
  fiado: '#D99A06',
  bar: '#011F4A',
  platform1: '#011F4A',
  platform2: '#EA1D2C',
  platform3: '#B42318',
  platform4: '#D99A06',
  platform5: '#4D6E9C',
  platformDefault: '#8A94A3',
  channelPdv: '#8A94A3',
  channelMesa: '#4D6E9C',
  channelManual: '#D99A06',
  channelIfood: '#EA1D2C',
});

/** Palette for the surface the page renders on right now (server and legacy: legacy values). */
export function chartColorsForSurface(surface) {
  return surface === 'app' ? APP_CHART_COLORS : LEGACY_CHART_COLORS;
}

const currentSurface = () =>
  typeof document === 'undefined' ? 'legacy' : document.documentElement?.dataset?.surface || 'legacy';

/** Resolved at read time, so PDF/Excel/canvas follow the live surface. */
// (an empty target: a Proxy over the frozen palette may not report different values)
export const CHART_COLORS = new Proxy({}, {
  get: (_target, key) => chartColorsForSurface(currentSurface())[key],
  has: (_target, key) => key in LEGACY_CHART_COLORS,
  ownKeys: () => Reflect.ownKeys(LEGACY_CHART_COLORS),
  getOwnPropertyDescriptor: (_target, key) =>
    key in LEGACY_CHART_COLORS ? { value: chartColorsForSurface(currentSurface())[key], enumerable: true, configurable: true } : undefined,
});
