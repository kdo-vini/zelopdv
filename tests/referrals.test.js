import { describe, expect, it } from 'vitest';
import {
  buildReferralLink,
  buildWhatsAppReferralUrl,
  makeReferralCodeBase,
  normalizeReferralCode,
} from '../src/lib/referrals.js';

describe('referral helpers', () => {
  it('generates readable uppercase codes without spaces or accents', () => {
    expect(makeReferralCodeBase('Bem Servido')).toBe('BEMSERVIDO');
    expect(makeReferralCodeBase('Casa dos Salgados')).toBe('CASADOSSALGADOS');
    expect(makeReferralCodeBase('Açaí da Praça')).toBe('ACAIDAPRACA');
  });

  it('normalizes pasted referral codes safely', () => {
    expect(normalizeReferralCode(' casa dos salgados! ')).toBe('CASADOSSALGADOS');
    expect(normalizeReferralCode('')).toBe('ZELO');
  });

  it('builds referral and WhatsApp share links', () => {
    const link = buildReferralLink('https://zelopdv.com.br/', 'Bem Servido');
    expect(link).toBe('https://zelopdv.com.br/indica/BEMSERVIDO');
    expect(buildWhatsAppReferralUrl(link)).toContain(encodeURIComponent(link));
  });
});
