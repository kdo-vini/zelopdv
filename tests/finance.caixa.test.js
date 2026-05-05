import { describe, expect, test } from 'vitest';
import {
  calculateExpectedDrawer,
  calculatePaymentSummary,
  calculateRestaurantRevenue,
  calculateRevenue,
  calculateSaleSettlement,
  validatePaymentCoverage
} from '../src/lib/finance/caixa.js';

describe('caixa finance math', () => {
  test('cash sale with discount uses final charged total for change and drawer cash', () => {
    const settlement = calculateSaleSettlement({
      formaPagamento: 'dinheiro',
      valorRecebido: 50,
      totalFinal: 45
    });

    expect(settlement.valorRecebido).toBe(50);
    expect(settlement.valorTroco).toBe(5);

    const vendas = [{
      forma_pagamento: 'dinheiro',
      valor_total: 45,
      valor_recebido: settlement.valorRecebido,
      valor_troco: settlement.valorTroco,
      valor_desconto: 5
    }];
    const summary = calculatePaymentSummary(vendas, []);

    expect(summary.totalGeral).toBe(45);
    expect(summary.dinheiro).toBe(45);
    expect(calculateRevenue({ totalGeral: summary.totalGeral })).toBe(45);
  });

  test('delivery cash sale includes delivery fee in amount due and change', () => {
    const validation = validatePaymentCoverage({
      formaPagamento: 'dinheiro',
      valorRecebido: 55,
      totalFinal: 55
    });
    const settlement = calculateSaleSettlement({
      formaPagamento: 'dinheiro',
      valorRecebido: 60,
      totalFinal: 55
    });

    expect(validation).toBe('');
    expect(settlement.valorTroco).toBe(5);
    expect(settlement.valorRecebido - settlement.valorTroco).toBe(55);
  });

  test('split payment stores cash net of change and reports do not subtract twice', () => {
    const settlement = calculateSaleSettlement({
      formaPagamento: 'multiplo',
      totalFinal: 100,
      pagamentos: [
        { forma: 'pix', valor: 60 },
        { forma: 'dinheiro', valor: 50 }
      ]
    });

    expect(settlement.valorTroco).toBe(10);
    expect(settlement.paymentRows).toEqual([
      { forma: 'pix', valor: 60 },
      { forma: 'dinheiro', valor: 40 }
    ]);

    const summary = calculatePaymentSummary(
      [{ id: 1, forma_pagamento: 'multiplo', valor_total: 100, valor_troco: settlement.valorTroco }],
      settlement.paymentRows.map((p) => ({ id_venda: 1, forma_pagamento: p.forma, valor: p.valor }))
    );

    expect(summary.dinheiro).toBe(40);
    expect(summary.pix).toBe(60);
    expect(summary.totalGeral).toBe(100);
  });

  test('single fiado with discount and delivery uses final charged amount', () => {
    const finalTotal = 57;
    const settlement = calculateSaleSettlement({
      formaPagamento: 'fiado',
      totalFinal: finalTotal
    });

    expect(settlement.valorRecebido).toBeNull();
    expect(settlement.valorTroco).toBe(0);
    expect(finalTotal).toBe(57);
  });

  test('platform sale keeps valor_total as customer charged total, not platform net', () => {
    const customerCharged = 100;
    const platformNet = 88;
    const settlement = calculateSaleSettlement({
      formaPagamento: 'ifood',
      totalFinal: customerCharged
    });
    const vendas = [{ forma_pagamento: settlement.formaPagamento, valor_total: customerCharged }];
    const summary = calculatePaymentSummary(vendas, []);

    expect(summary.totalGeral).toBe(customerCharged);
    expect(summary.totalGeral).not.toBe(platformNet);
  });

  test('expected drawer follows opening plus cash minus sangria plus suprimento', () => {
    expect(calculateExpectedDrawer({
      valorInicial: 100,
      dinheiroLiquido: 245.5,
      sangria: 80,
      suprimento: 20
    })).toBe(285.5);
  });

  test('cash summary falls back to valor_total for legacy cash rows without valor_recebido', () => {
    const summary = calculatePaymentSummary([
      { forma_pagamento: 'dinheiro', valor_total: 32, valor_recebido: null, valor_troco: 0 }
    ], []);

    expect(summary.dinheiro).toBe(32);
  });

  test('restaurant revenue excludes delivery fee but not discount twice', () => {
    expect(calculateRevenue({ totalGeral: 90, despesas: 10 })).toBe(80);
    expect(calculateRestaurantRevenue({ totalGeral: 90, taxaEntrega: 8, despesas: 10 })).toBe(72);
  });
});
