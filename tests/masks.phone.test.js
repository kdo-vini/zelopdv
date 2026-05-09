import { describe, it, expect } from 'vitest';
import { maskPhone, normalizeBrazilianPhone } from '../src/lib/masks.js';

describe('Brazilian phone normalization', () => {
  it('keeps local mobile numbers usable for WhatsApp', () => {
    expect(normalizeBrazilianPhone('(11) 99999-9999')).toBe('5511999999999');
  });

  it('does not corrupt +55 numbers pasted by users', () => {
    expect(maskPhone('+55 11 99999-9999')).toBe('(11) 99999-9999');
    expect(normalizeBrazilianPhone('+55 11 99999-9999')).toBe('5511999999999');
  });

  it('rejects incomplete numbers', () => {
    expect(normalizeBrazilianPhone('(11) 9999')).toBeNull();
  });
});
