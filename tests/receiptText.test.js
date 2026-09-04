import { describe, expect, it } from 'vitest';
import { buildReceiptText } from '../src/lib/receiptText.js';

describe('sale receipt text', () => {
  it('includes the human payment label when a persisted sale uses snake_case', () => {
    const text = buildReceiptText({
      empresa: { nome_exibicao: 'Loja' },
      venda: {
        forma_pagamento: 'vale_refeicao',
        total: 10,
        itens: [],
      },
    });

    expect(text).toContain('Pgto: Vale-Refeição');
    expect(text).not.toContain('vale_refeicao');
  });

  it('renders the granted discount before the final total', () => {
    const text = buildReceiptText({
      empresa: { nome_exibicao: 'Loja' },
      venda: {
        subtotal: 100,
        desconto: 10,
        total: 90,
        itens: [],
      },
    });

    expect(text).toContain('Desconto: -R$ 10.00');
    expect(text.indexOf('Desconto:')).toBeLessThan(text.indexOf('*TOTAL:'));
  });
});
