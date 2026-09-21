import { describe, expect, it } from 'vitest';
import { sanitizeAcquisition } from '../src/lib/server/acquisition.js';

describe('sanitizeAcquisition', () => {
  it('mantém só chaves whitelist e corta tamanho', () => {
    const clean = sanitizeAcquisition({
      utm_source: '  ig  ',
      evil: 'drop',
      referrer: 'x'.repeat(250),
      landing: '/para-lanchonetes',
    });
    expect(clean).toEqual({
      utm_source: 'ig',
      referrer: 'x'.repeat(200),
      landing: '/para-lanchonetes',
    });
  });

  it('rejeita payload inválido', () => {
    expect(sanitizeAcquisition(null)).toBeNull();
    expect(sanitizeAcquisition([])).toBeNull();
    expect(sanitizeAcquisition({ foo: 1 })).toBeNull();
  });
});
