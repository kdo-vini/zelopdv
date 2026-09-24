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

  it('descarta ai_source spoofado pelo cliente quando referrer/utm não batem', () => {
    const clean = sanitizeAcquisition({
      ai_source: 'chatgpt',
      referrer: 'algum-site-qualquer.com/pagina',
      utm_source: 'newsletter',
    });
    expect(clean.ai_source).toBeUndefined();
  });

  it('recalcula ai_source a partir do referrer sanitizado, ignorando o valor enviado', () => {
    const clean = sanitizeAcquisition({
      ai_source: 'grok', // valor errado enviado pelo cliente
      referrer: 'chatgpt.com/c/abc123',
    });
    expect(clean.ai_source).toBe('chatgpt');
  });

  it('recalcula ai_source a partir do utm_source sanitizado', () => {
    const clean = sanitizeAcquisition({ utm_source: 'chatgpt.com' });
    expect(clean.ai_source).toBe('chatgpt');
  });

  it('não inventa ai_source quando não há sinal de IA', () => {
    const clean = sanitizeAcquisition({ utm_source: 'facebook' });
    expect(clean.ai_source).toBeUndefined();
  });
});
