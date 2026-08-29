import { describe, expect, it } from 'vitest';
import { buildPaymentPresentation, readCashClosingPaymentTotals } from '../src/lib/finance/paymentReport.js';

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

    expect(presentation.items).toContainEqual(expect.objectContaining({ id: 'vale_refeicao', label: 'Vale-Refeição', value: 50 }));
    expect(presentation.extras).toEqual([expect.objectContaining({ id: 'ifood', label: 'iFood', value: 60 })]);
    expect(presentation.pagamentos.valeRefeicao).toBe(50);
  });

  it('reads new closing snapshots and falls back to legacy aggregates', () => {
    expect(readCashClosingPaymentTotals({
      totais_pagamento: { dinheiro: 10, vale_refeicao: 25, multiplo: 35 },
      total_dinheiro: 99,
      total_pix: 99,
      total_cartao: 99,
    })).toEqual({ dinheiro: 10, vale_refeicao: 25 });

    expect(readCashClosingPaymentTotals({
      totais_pagamento: {},
      total_dinheiro: 40,
      total_pix: 20,
      total_cartao: 15,
    })).toEqual({ dinheiro: 40, pix: 20, cartao: 15 });
  });

  it('merges aliases before building the report legend', () => {
    const presentation = buildPaymentPresentation({
      totalsByForm: {
        pix: 100,
        Pix: 50,
        dinheiro: 20,
        Dinheiro: 30,
      },
    });

    expect(presentation.items).toEqual([
      expect.objectContaining({ id: 'dinheiro', label: 'Dinheiro', value: 50 }),
      expect.objectContaining({ id: 'pix', label: 'Pix', value: 150 }),
    ]);
    expect(presentation.extras).toEqual([]);
  });

  it('merges aliases when reading historical closing snapshots', () => {
    expect(readCashClosingPaymentTotals({
      totais_pagamento: { pix: 100, Pix: 50, Dinheiro: 30, dinheiro: 20 },
    })).toEqual({ pix: 150, dinheiro: 50 });
  });
});
