import { describe, expect, it } from 'vitest';
import { buildSaleReceiptPayload } from '../src/lib/finance/saleReceipt.js';

describe('sale receipt payload', () => {
  it('maps persisted sale snapshots into the printVenda contract', () => {
    const result = buildSaleReceiptPayload({
      venda: {
        id: 42,
        numero_venda: 108,
        valor_total: 48,
        valor_desconto: 5,
        taxa_entrega: 8,
        tipo_pedido: 'delivery',
        forma_pagamento: 'multiplo',
        valor_recebido: 30,
        valor_troco: 0,
      },
      itens: [
        {
          nome_produto_na_venda: 'Combo X',
          quantidade: 2,
          preco_unitario_na_venda: 22.5,
          modifiers: [{ groupName: 'Tamanho', selectedOptions: [{ name: 'Grande' }] }],
        },
      ],
      pagamentos: [
        { id_venda: 42, forma_pagamento: 'pix', valor: 30 },
        { id_venda: 42, forma_pagamento: 'dinheiro', valor: 18 },
      ],
    });

    expect(result).toEqual({
      idVenda: 42,
      numeroVenda: 108,
      formaPagamento: 'multiplo',
      total: 48,
      subtotal: 45,
      desconto: 5,
      taxaEntrega: 8,
      tipoPedido: 'delivery',
      valorRecebido: 30,
      troco: 0,
      itens: [
        {
          nome: 'Combo X',
          quantidade: 2,
          preco_unitario: 22.5,
          modifiers: [{ groupName: 'Tamanho', selectedOptions: [{ name: 'Grande' }] }],
        },
      ],
      pagamentos: [
        { forma: 'pix', valor: 30 },
        { forma: 'dinheiro', valor: 18 },
      ],
    });
  });
});
