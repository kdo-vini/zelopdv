import { describe, expect, test } from 'vitest';
import {
  buildFiadoPaymentMessage,
  buildFiadoPaymentWhatsAppUrl,
  getFiadoPaymentBalanceMessage
} from '../src/lib/finance/fiadoWhatsApp.js';

describe('fiado WhatsApp payment confirmation', () => {
  test('builds a partial-payment message with the remaining debt', () => {
    expect(buildFiadoPaymentMessage({
      customerName: 'Fanny Massas',
      paymentAmount: 20,
      currentBalance: 42,
      businessName: 'Fanny Massas & Cia'
    })).toBe([
      '*Olá, Fanny Massas!*',
      '',
      '*Pagamento confirmado:* R$ 20,00 recebido.',
      '*Ainda restam R$ 42,00 em aberto.*',
      '',
      'Agradecemos pela preferência e confiança em nosso trabalho!',
      '',
      '*Fanny Massas & Cia*'
    ].join('\r\n'));
  });

  test('describes a fully paid balance and generated credit', () => {
    expect(getFiadoPaymentBalanceMessage(0)).toBe('Sua dívida está quitada.');
    expect(getFiadoPaymentBalanceMessage(-12.5)).toBe('Você tem R$ 12,50 de crédito disponível.');
  });

  test('omits the establishment signature when it is not configured', () => {
    expect(buildFiadoPaymentMessage({
      customerName: 'Ana',
      paymentAmount: 10,
      currentBalance: 0
    })).not.toContain('ZeloPDV');
  });

  test('builds a directed WhatsApp URL and rejects missing or invalid contacts', () => {
    const url = buildFiadoPaymentWhatsAppUrl({
      contact: '(11) 99999-0000',
      customerName: 'Ana',
      paymentAmount: 10,
      currentBalance: 0
    });

    expect(url).toContain('https://wa.me/5511999990000?text=');
    const decodedMessage = decodeURIComponent(url.split('?text=')[1]);
    expect(decodedMessage).toContain('*Sua dívida está quitada.*');
    expect(decodedMessage).toContain('\r\n\r\n');
    expect(decodedMessage).not.toContain('�');
    expect(buildFiadoPaymentWhatsAppUrl({ contact: '' })).toBeNull();
    expect(buildFiadoPaymentWhatsAppUrl({ contact: '123' })).toBeNull();
  });
});
