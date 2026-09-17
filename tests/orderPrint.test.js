import { describe, expect, it } from 'vitest';
import { buildOrderText } from '../src/lib/orderPrint.js';

describe('order print text', () => {
  it('prints the complete online order, including modifier groups', () => {
    const text = buildOrderText({
      id: '00000000-0000-0000-0000-ABCD1234',
      nome_cliente: 'Ana',
      customer_phone: '5511999999999',
      total: 32.5,
      forma_pagamento: 'pix',
      fulfillment: { type: 'delivery', deliveryAddress: 'Rua das Flores, 10' },
      pedido_itens: [{
        nome: 'Monte sua Massa',
        quantidade: 1,
        modifierGroups: [{ groupName: 'Proteína', optionNames: ['Frango'] }],
      }],
      observacoes: 'Tocar a campainha',
    }, 'Casa Teste');

    expect(text).toContain('CASA TESTE');
    expect(text).toContain('PEDIDO #ABCD1234');
    expect(text).toContain('1x Monte sua Massa');
    expect(text).toContain('Proteína: Frango');
    expect(text).toContain('Pagamento: pix');
    expect(text).toContain('Rua das Flores, 10');
    expect(text).toContain('Obs: Tocar a campainha');
  });

  it('prints the iFood display id and handoff codes on kitchen tickets', () => {
    const text = buildOrderText({
      id: '00000000-0000-0000-0000-ABCD1234',
      source: 'ifood',
      nome_cliente: 'Ana',
      total: 40,
      forma_pagamento: 'ONLINE',
      ifood: {
        displayId: '9876',
        pickupCode: 'AB12',
        deliveryCode: 'XY99',
      },
      fulfillment: { type: 'delivery', deliveryAddress: 'Rua A, 1' },
      items: [{ productName: 'Burger', quantity: 1 }],
    }, 'Loja');

    expect(text).toContain('IFOOD #9876');
    expect(text).toContain('Ref: ABCD1234');
    expect(text).toContain('Codigo coleta: AB12');
    expect(text).toContain('Codigo entrega: XY99');
  });
});
