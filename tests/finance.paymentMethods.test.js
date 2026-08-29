import { describe, expect, test } from 'vitest';
import {
  PAYMENT_METHOD_IDS,
  SELECTABLE_PAYMENT_METHODS,
  STANDARD_PAYMENT_FORMS,
  formatPaymentMethod,
  getPaymentPlatform,
  getPaymentMethod,
  isCashPaymentMethod,
  isFiadoPaymentMethod,
  isRealizedRevenuePaymentMethod
} from '../src/lib/finance/paymentMethods.js';

describe('payment method catalog', () => {
  test('exposes vale-refeicao as a native realized non-cash payment method', () => {
    const vale = getPaymentMethod(PAYMENT_METHOD_IDS.VALE_REFEICAO);

    expect(vale).toMatchObject({
      id: 'vale_refeicao',
      label: 'Vale-Refeição',
      asciiLabel: 'Vale-refeicao',
      icon: 'vale_refeicao',
      shortcut: 'V',
      isCash: false,
      isRealizedRevenue: true,
      requiresCustomer: false,
      allowsChange: false,
      selectable: true
    });
    expect(SELECTABLE_PAYMENT_METHODS.map((method) => method.id)).toEqual([
      'dinheiro',
      'cartao_debito',
      'cartao_credito',
      'pix',
      'vale_refeicao',
      'fiado'
    ]);
    expect(STANDARD_PAYMENT_FORMS.has('vale_refeicao')).toBe(true);
    expect(isCashPaymentMethod('vale_refeicao')).toBe(false);
    expect(isFiadoPaymentMethod('vale_refeicao')).toBe(false);
    expect(isRealizedRevenuePaymentMethod('vale_refeicao')).toBe(true);
    expect(getPaymentMethod(PAYMENT_METHOD_IDS.PIX)?.shortcut).toBe('X');
  });

  test('prefers native labels over conflicting dynamic platform labels and supports ascii output', () => {
    const platforms = [
      { id: 'vale_refeicao', nome: 'Nome legado de plataforma' },
      { id: 'plataforma_propria', nome: 'Plataforma própria' },
    ];

    expect(formatPaymentMethod('vale_refeicao', { platforms })).toBe('Vale-Refeição');
    expect(formatPaymentMethod('vale_refeicao', { ascii: true })).toBe('Vale-refeicao');
    expect(formatPaymentMethod('plataforma_propria', { platforms }))
      .toBe('Plataforma própria');
    expect(getPaymentPlatform('vale_refeicao', platforms)).toBeNull();
    expect(getPaymentPlatform('plataforma_propria', platforms)).toMatchObject({ id: 'plataforma_propria' });
  });
});
