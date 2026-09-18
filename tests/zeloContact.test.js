import { describe, expect, it } from 'vitest';
import { ZELO_WHATSAPP_NUMBER, buildZeloWhatsAppHref } from '../src/lib/zeloContact.js';

describe('zeloContact', () => {
  it('expõe o número único do WhatsApp do Zelo', () => {
    expect(ZELO_WHATSAPP_NUMBER).toBe('5514991537503');
  });

  it('sem texto, devolve o link puro (comportamento do rodapé)', () => {
    expect(buildZeloWhatsAppHref()).toBe('https://wa.me/5514991537503');
    expect(buildZeloWhatsAppHref('')).toBe('https://wa.me/5514991537503');
  });

  it('com texto, monta o link com a mensagem URL-encoded', () => {
    const href = buildZeloWhatsAppHref('Olá, vim pelo site do Zelo PDV e gostaria de saber mais.');
    expect(href).toBe(
      'https://wa.me/5514991537503?text=Ol%C3%A1%2C%20vim%20pelo%20site%20do%20Zelo%20PDV%20e%20gostaria%20de%20saber%20mais.',
    );
  });

  it('mantém o mesmo número usado pelo detector de conversão falsa em googleAds.js', () => {
    expect(buildZeloWhatsAppHref()).toContain(`wa.me/${ZELO_WHATSAPP_NUMBER}`);
  });
});
