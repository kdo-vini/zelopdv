import { describe, expect, it } from 'vitest';
import { buildPaymentPresentation } from '../src/lib/finance/paymentReport.js';

describe('buildPaymentPresentation', () => {
  it('keeps Vale-refeição out of platform extras and exposes it to exports', () => {
    const presentation = buildPaymentPresentation({
      dinheiro: 10,
      pix: 20,
      cartaoDebito: 30,
      cartaoCredito: 40,
      cartaoLegacy: 0,
      valeRefeicao: 50,
      fiado: 0,
      totalsByForm: { dinheiro: 10, pix: 20, cartao_debito: 30, cartao_credito: 40, vale_refeicao: 50, ifood: 60 },
    }, { platforms: [{ id: 'ifood', nome: 'iFood' }] });

    expect(presentation.items).toContainEqual(expect.objectContaining({ id: 'vale_refeicao', label: 'Vale-refeição', value: 50 }));
    expect(presentation.extras).toEqual([expect.objectContaining({ id: 'ifood', label: 'iFood', value: 60 })]);
    expect(presentation.pagamentos.valeRefeicao).toBe(50);
  });
});
