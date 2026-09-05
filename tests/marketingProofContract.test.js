import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_PROOF_EVENTS,
  OPERATIONAL_PROOF_SCREENS,
  PUBLISHED_MENUS_URL,
} from '../src/lib/components/marketing/operationalProof.js';

describe('marketing operational proof contract', () => {
  it('uses the real product screenshots and a verifiable published-menu destination', () => {
    expect(OPERATIONAL_PROOF_SCREENS).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'financial', src: '/images/screenshots/financial-screen.png' }),
      expect.objectContaining({ key: 'dashboard', src: '/images/screenshots/dashboard-desktop.png' }),
    ]));
    expect(PUBLISHED_MENUS_URL).toBe('https://menu.zelopdv.com.br/#empresas');
  });

  it('keeps proof analytics names stable and free of personal data', () => {
    expect(OPERATIONAL_PROOF_EVENTS).toEqual({
      previewed: 'marketing_proof_previewed',
      publishedMenus: 'marketing_published_menus_clicked',
      trial: 'marketing_trial_clicked',
    });
  });
});
