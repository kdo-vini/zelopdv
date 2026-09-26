import { describe, it, expect, afterEach } from 'vitest';
import { CHART_COLORS, chartColorsForSurface } from '../src/lib/theme/chartColors.js';

describe('chartColors', () => {
  afterEach(() => { delete globalThis.document; });

  it('keeps the legacy palette outside the App surface', () => {
    expect(chartColorsForSurface('legacy').pix).toBe('#0EA5E9');
    expect(chartColorsForSurface('brand').pix).toBe('#0EA5E9');
  });

  it('uses the Design System palette on the App surface', () => {
    const app = chartColorsForSurface('app');
    expect(app.pix).toBe('#011F4A');
    expect(app.cash).toBe('#146C43');
    expect(app.channelIfood).toBe('#EA1D2C');
    // brand channel colours are shared
    expect(app.channelZelomenu).toBe(chartColorsForSurface('legacy').channelZelomenu);
  });

  it('CHART_COLORS follows the live <html data-surface>', () => {
    expect(CHART_COLORS.pix).toBe('#0EA5E9'); // no document (SSR) → legacy
    globalThis.document = { documentElement: { dataset: { surface: 'legacy' } } };
    expect(CHART_COLORS.pix).toBe('#0EA5E9');
    globalThis.document.documentElement.dataset.surface = 'app';
    expect(CHART_COLORS.pix).toBe('#011F4A');
  });
});
