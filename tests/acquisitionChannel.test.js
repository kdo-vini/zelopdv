import { describe, expect, it } from 'vitest';
import { acquisitionChannel } from '../src/lib/attribution/client.js';

describe('acquisitionChannel', () => {
  it('prioriza gclid/fbclid sobre ai_source e utm_source', () => {
    expect(acquisitionChannel({ gclid: 'x', ai_source: 'chatgpt', utm_source: 'ig' })).toBe('google_ads');
    expect(acquisitionChannel({ fbclid: 'x', ai_source: 'chatgpt', utm_source: 'ig' })).toBe('meta_ads');
  });

  it('ai_source vem antes do utm_source genérico', () => {
    expect(acquisitionChannel({ ai_source: 'chatgpt', utm_source: 'chatgpt.com' })).toBe('ia_chatgpt');
    expect(acquisitionChannel({ ai_source: 'perplexity' })).toBe('ia_perplexity');
  });

  it('cai para utm_source quando não há ai_source nem click id', () => {
    expect(acquisitionChannel({ utm_source: 'instagram' })).toBe('instagram');
  });

  it('cai para origem/referrer/direto quando não há nada mais específico', () => {
    expect(acquisitionChannel({ origem: 'indicacao' })).toBe('indicacao');
    expect(acquisitionChannel({ referrer: 'google.com.br/search' })).toBe('google_organico');
    expect(acquisitionChannel({})).toBe('direto');
    expect(acquisitionChannel(null)).toBe('desconhecido');
  });
});
