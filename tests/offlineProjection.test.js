import { describe, it, expect } from 'vitest';
import { projectCashSnapshot, projectStockProducts, newMesaPayments } from '../src/lib/finance/offlineProjection.js';

describe('offline financial projections', () => {
  it('receipts needing review affect cash without claiming new revenue and dedupe remote ledger', () => {
    const op = { operationId: 'c', type: 'mesa.close', status: 'needs_review', payload: { id_caixa: 4, payments: [{ forma_pagamento: 'dinheiro', valor: 9 }] } };
    const snapshot = { caixa: { id: 4 }, vendas: [], pagamentos: [], movs: [] };
    expect(projectCashSnapshot(snapshot, [op]).pagamentos[0].valor).toBe(9);
    const result = projectCashSnapshot({ ...snapshot, pendingReceipts: [{ operation_id: 'c', forma_pagamento: 'dinheiro', valor: 9, state: 'pending' }] }, [op]);
    expect(result.pagamentos).toHaveLength(1); expect(result.vendas).toHaveLength(0);
  });
  it('duplicate reconciliation releases stock and refund nets receipts against its known movement', () => {
    const payload = { id_caixa: 4, valor_total: 9, estoque: [{ id_produto: 1, quantidade: 1 }] };
    const duplicate = { operationId: 'd', type: 'sale.create', payload, result: { reconciliationAction: 'record_duplicate' } };
    expect(projectStockProducts([{ id: 1, estoque_atual: 4 }], [duplicate])[0].estoque_atual).toBe(4);
    const refund = { ...duplicate, result: { reconciliationAction: 'record_refund', refundMovementId: 8, payments: [{ forma_pagamento: 'dinheiro', valor: 9 }] } };
    const result = projectCashSnapshot({ caixa: { id: 4 }, vendas: [], pagamentos: [], movs: [{ id: 8, tipo: 'sangria', valor: 9 }], pendingReceipts: [{ operation_id: 'd', state: 'refunded', forma_pagamento: 'dinheiro', valor: 9 }] }, [refund]);
    expect(result.vendas).toHaveLength(0); expect(result.pagamentos).toHaveLength(1); expect(result.movs).toHaveLength(1);
  });
  it('cancel returns all locally reserved table stock once', () => {
    const ops = [{ operationId: 'a', type: 'mesa.item.add', payload: { produtoId: 1, delta: 2 } }, { operationId: 'b', type: 'mesa.cancel', payload: { items: [{ id_produto: 1, quantidade: 2 }] } }];
    expect(projectStockProducts([{ id: 1, estoque_atual: 4 }], ops)[0].estoque_atual).toBe(4);
  });
  it('includes table receipts once before and after the table closes', () => {
    const partial = { operationId: 'p', type: 'mesa.payment.add', payload: { id_caixa: 4, comandaId: 'c', paymentId: 'p', forma_pagamento: 'dinheiro', valor: 8 } };
    const close = { operationId: 'close', type: 'mesa.close', payload: { id_caixa: 4, comandaId: 'c', valor_total: 12, payments: [{ forma_pagamento: 'dinheiro', valor: 4 }] } };
    const snapshot = { caixa: { id: 4 }, vendas: [], pagamentos: [], movs: [] };
    expect(projectCashSnapshot(snapshot, [partial]).pagamentos.reduce((s,p) => s+p.valor,0)).toBe(8);
    const projected = projectCashSnapshot(snapshot, [partial, close]);
    expect(projected.pagamentos.reduce((s,p) => s+p.valor,0)).toBe(12);
    expect(projected.vendas).toHaveLength(1);
    const remote = { ...snapshot, vendas: [{ id: 5, client_sale_id: 'close', id_comanda: 'c', valor_total: 12 }], pagamentos: [{ id_venda: 5, valor: 8, id_comanda_pagamento: 'p' }, { id_venda: 5, valor: 4 }] };
    expect(projectCashSnapshot(remote, [partial, { ...close, result: { id: 5 } }]).pagamentos.reduce((s,p) => s+p.valor,0)).toBe(12);
  });
  it('removal reverses only its own partial and recognizes a synced shift alias', () => {
    const ops = [{ operationId: 'open', entityId: 'uuid', type: 'caixa.open', result: { id: 4 }, payload: {} },
      { operationId: 'p', type: 'mesa.payment.add', payload: { id_caixa: 'uuid', paymentId: 'p', forma_pagamento: 'dinheiro', valor: 8 } },
      { operationId: 'r', type: 'mesa.payment.remove', payload: { id_caixa: 'uuid', paymentId: 'p', forma_pagamento: 'dinheiro', valor: 8 } }];
    const result = projectCashSnapshot({ caixa: { id: 4 }, vendas: [], pagamentos: [], movs: [] }, ops);
    expect(result.pagamentos.reduce((s,p) => s+p.valor,0)).toBe(0);
  });
  it('keeps pending money in its original shift and never duplicates acknowledged sale', () => {
    const operations = [
      { operationId: 'a', type: 'sale.create', status: 'acked', result: { id: 1 }, payload: { id_caixa: 4, valor_total: 10, forma_pagamento: 'dinheiro', client_sale_id: 'a' } },
      { operationId: 'b', type: 'sale.create', status: 'pending', payload: { id_caixa: 4, valor_total: 20, forma_pagamento: 'multiplo', pagamentos: [{ forma_pagamento: 'pix', valor: 15 }, { forma_pagamento: 'dinheiro', valor: 5 }] } },
      { operationId: 'c', type: 'sale.create', status: 'pending', payload: { id_caixa: 5, valor_total: 999 } },
    ];
    const snapshot = { caixa: { id: 4 }, vendas: [{ id: 1, client_sale_id: 'a', valor_total: 10 }], pagamentos: [], movs: [] };
    const result = projectCashSnapshot(snapshot, operations);
    expect(result.vendas.map(v => v.valor_total)).toEqual([10, 20]);
    expect(result.pagamentos).toHaveLength(2);
    expect(snapshot.vendas).toHaveLength(1);
  });
  it('reserves shared stock once per requirement without changing persisted snapshot', () => {
    const products = [1, 2].map(id => ({ id, estoque_atual: 50, categorias: { id: 3, controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 10 } }));
    const operations = [{ operationId: 'a', type: 'sale.create', status: 'pending', payload: { estoque: [{ id_produto: 1, quantidade: 2 }, { id_produto: 2, quantidade: 3 }] } }];
    expect(projectStockProducts(products, operations)[0].categorias.estoque_compartilhado_atual).toBe(5);
    expect(projectStockProducts(products, operations, ['a'])[1].categorias.estoque_compartilhado_atual).toBe(10);
    expect(products[0].categorias.estoque_compartilhado_atual).toBe(10);
  });
  it('converts new split payments to net cash and excludes already received partials', () => {
    expect(newMesaPayments({ multiPag: true, pagamentos: [{ forma: 'pix', valor: 5 }, { forma: 'dinheiro', valor: 20 }], saldo: 15 })).toEqual([{ forma_pagamento: 'pix', valor: 5, id_pessoa: null }, { forma_pagamento: 'dinheiro', valor: 10, id_pessoa: null }]);
    expect(newMesaPayments({ saldo: 0 })).toEqual([]);
  });
});
