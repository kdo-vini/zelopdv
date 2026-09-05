import { money } from './caixa.js';
import { pizzaStockRequirements } from '../pizza.js';

/** Merge durable local intentions with an authoritative snapshot by identity. */
export function projectCashSnapshot(snapshot, operations) {
  const result = structuredClone(snapshot);
  result.vendas ||= []; result.pagamentos ||= []; result.movs ||= []; result.taxas ||= [];
  const included = new Set(snapshot.includedOperationIds || []);
  const remoteResult = op => op?.acknowledgement?.result || op?.result;
  const disposition = op => remoteResult(op)?.reconciliationAction;
  const reconciled = op => ['record_duplicate', 'record_refund', 'record_additional_sale'].includes(disposition(op));
  const aliases = new Map(operations.filter(op => op.type === 'caixa.open' && remoteResult(op)?.id).map(op => [String(op.entityId), String(remoteResult(op).id)]));
  const sameShift = id => (aliases.get(String(id)) || String(id)) === (aliases.get(String(snapshot.caixa?.id)) || String(snapshot.caixa?.id));
  const removedPayments = new Set(operations.filter(op => op.type === 'mesa.payment.remove').map(op => op.payload.paymentId));
  const remotePartialIds = new Set(result.pagamentos.map(p => p.id_comanda_pagamento).filter(Boolean));
  const receiptOperations = new Set((snapshot.pendingReceipts || []).map(p => p.operation_id));
  // Partials are physical receipts, not new revenue. Keep them separate from sales until closing.
  const partials = new Map((snapshot.mesaPagamentos || []).filter(p => !removedPayments.has(p.id) && !remotePartialIds.has(p.id)).map(p => [p.id, p]));
  for (const op of operations) if (op.type === 'mesa.payment.add' && !reconciled(op) && !receiptOperations.has(op.operationId) && sameShift(op.payload.id_caixa) && !removedPayments.has(op.payload.paymentId) && !remotePartialIds.has(op.payload.paymentId)) partials.set(op.payload.paymentId, { ...op.payload, id: op.payload.paymentId, id_comanda: op.payload.comandaId });
  for (const op of operations) {
    const remote = op.acknowledgement?.result || op.result;
    if (included.has(op.operationId) || !sameShift(op.payload?.id_caixa)) continue;
    if (reconciled(op)) {
      if (disposition(op) === 'record_additional_sale' && remote?.id && !result.vendas.some(v => String(v.id) === String(remote.id))) {
        result.vendas.push({ id: remote.id, client_sale_id: `reconciled-additional:${op.operationId}`, forma_pagamento: 'multiplo', valor_total: Number(remote.valor || 0) });
        result.pagamentos.push(...(remote.payments || []).map(p => ({ ...p, id_venda: remote.id })));
      }
      if (disposition(op) === 'record_refund') {
        const cash = (remote.payments || []).filter(p => p.forma_pagamento === 'dinheiro').reduce((s,p) => s+Number(p.valor),0);
        if (!receiptOperations.has(op.operationId) && cash) result.pagamentos.push({ forma_pagamento: 'dinheiro', valor: cash, unrecognizedReceipt: true });
        if (cash && !result.movs.some(m => String(m.id) === String(remote.refundMovementId) || m.client_operation_id === `refund:${op.operationId}`)) result.movs.push({ id: remote.refundMovementId || `refund:${op.operationId}`, tipo: 'sangria', valor: cash });
      }
      continue;
    }
    if (['sale.create', 'mesa.close'].includes(op.type) && ['needs_review', 'needs_auth'].includes(op.status)) {
      result.provisional = true;
      if (!receiptOperations.has(op.operationId)) {
        const receipts = op.type === 'mesa.close' ? op.payload.payments || [] : op.payload.pagamentos?.length ? op.payload.pagamentos : [{ forma_pagamento: op.payload.forma_pagamento, valor: op.payload.valor_total }];
        result.pagamentos.push(...receipts.filter(p => p.forma_pagamento !== 'fiado').map(p => ({ ...p, unrecognizedReceipt: true })));
      }
      continue;
    }
    if (op.type === 'sale.create') {
      if (result.vendas.some(v => v.client_sale_id === op.operationId || (remote?.id && v.id === remote.id))) continue;
      const id = remote?.id || op.operationId;
      result.vendas.push({ ...op.payload, id, client_sale_id: op.operationId, localStatus: op.status });
      result.pagamentos.push(...(op.payload.pagamentos || []).map(p => ({ ...p, id_venda: id })));
      result.taxas.push(...(op.payload.taxas_plataforma || []).map(p => ({ ...p, id_venda: id })));
    }
    if (op.type === 'caixa.move' && !result.movs.some(m => m.operationId === op.operationId || m.client_operation_id === op.operationId || (remote?.id && String(m.id) === String(remote.id)))) {
      result.movs.push({ ...op.payload, operationId: op.operationId });
    }
    if (op.type === 'mesa.close') {
      const confirmedSale = result.vendas.find(v => v.client_sale_id === op.operationId || (remote?.id && String(v.id) === String(remote.id)));
      if (confirmedSale) { for (const [id, p] of partials) if (p.id_comanda === op.payload.comandaId) partials.delete(id); continue; }
      if (op.status === 'needs_review') { result.provisional = true; continue; }
      const id = remote?.id || op.operationId;
      const mesaPartials = [...partials.values()].filter(p => p.id_comanda === op.payload.comandaId);
      const payments = [...mesaPartials, ...(op.payload.payments || [])];
      result.vendas.push({ id, id_comanda: op.payload.comandaId, client_sale_id: op.operationId, forma_pagamento: 'multiplo', valor_total: Number(op.payload.valor_total ?? payments.reduce((s, p) => s + Number(p.valor || 0), 0)), localStatus: op.status });
      result.pagamentos.push(...payments.map(p => ({ ...p, id_venda: id })));
      mesaPartials.forEach(p => partials.delete(p.id));
    }
  }
  result.pagamentos.push(...[...partials.values()].filter(p => p.forma_pagamento !== 'fiado').map(p => ({ ...p, id_comanda_pagamento: p.id, localPartial: true })));
  for (const receipt of snapshot.pendingReceipts || []) {
    const action = disposition(operations.find(op => op.operationId === receipt.operation_id));
    if (['record_duplicate', 'record_additional_sale'].includes(action) || receipt.forma_pagamento === 'fiado' || ((receipt.state === 'refunded' || action === 'record_refund') && receipt.forma_pagamento !== 'dinheiro')) continue;
    result.pagamentos.push({ ...receipt, unrecognizedReceipt: true });
    if (receipt.state === 'pending' && action !== 'record_refund') result.provisional = true;
  }
  result.provisional ||= operations.some(op => op.status !== 'acked' && sameShift(op.payload?.id_caixa));
  return result;
}

/** Keep acknowledgements reserved until a fresh catalog includes their effects. */
export function projectStockProducts(products, operations, includedOperationIds = []) {
  const included = new Set(includedOperationIds);
  const byId = new Map();
  const visit = p => {
    byId.set(p.id, p);
    for (const linked of p.pizzaStockProducts || []) byId.set(linked.id, linked);
    for (const group of p.modifierGroups || []) for (const option of group.options || []) {
      if (option.linkedProduct) byId.set(option.linkedProduct.id, option.linkedProduct);
    }
  };
  products.forEach(visit);
  const reserved = new Map();
  for (const op of operations) {
    if (included.has(op.operationId)) continue;
    if (['record_duplicate', 'record_refund', 'record_additional_sale'].includes((op.acknowledgement?.result || op.result)?.reconciliationAction)) continue;
    const requirements = op.type === 'sale.create' ? op.payload?.estoque || []
      : ['mesa.item.add', 'mesa.item.delta'].includes(op.type)
        ? pizzaStockRequirements({ productId: op.payload.produtoId, quantity: Number(op.payload.delta), modifiers: op.payload.modifiers, pizza: op.payload.pizza })
        : op.type === 'mesa.cancel' && !['needs_review', 'needs_auth'].includes(op.status) ? (op.payload.items || []).flatMap(item => pizzaStockRequirements({ productId: item.id_produto, quantity: -Number(item.quantidade), modifiers: item.modifiers, pizza: item.pizza })) : [];
    for (const row of requirements) {
      const p = byId.get(row.id_produto);
      if (!p) continue;
      const key = p.categorias?.controlar_estoque_compartilhado ? `c:${p.categorias.id ?? p.id_categoria}` : `p:${p.id}`;
      reserved.set(key, (reserved.get(key) || 0) + Number(row.quantidade || 0));
    }
  }
  const project = p => ({
    ...p,
    estoque_atual: Number(p.estoque_atual || 0) - (reserved.get(`p:${p.id}`) || 0),
    ...(p.categorias ? { categorias: { ...p.categorias, estoque_compartilhado_atual: Number(p.categorias.estoque_compartilhado_atual || 0) - (reserved.get(`c:${p.categorias.id ?? p.id_categoria}`) || 0) } } : {}),
    ...(p.pizzaStockProducts ? { pizzaStockProducts: p.pizzaStockProducts.map(project) } : {}),
    ...(p.modifierGroups ? { modifierGroups: p.modifierGroups.map(group => ({ ...group, options: (group.options || []).map(option => ({ ...option, ...(option.linkedProduct ? { linkedProduct: project(option.linkedProduct) } : {}) })) })) } : {}),
  });
  return products.map(project);
}

export function newMesaPayments({ multiPag, pagamentos = [], saldo, formaPagamento, pessoaFiadoId }) {
  if (saldo <= 0.001) return [];
  const rows = multiPag ? pagamentos : [{ forma: formaPagamento, valor: saldo, pessoaId: pessoaFiadoId }];
  let change = money(Math.max(0, rows.reduce((s, p) => s + Number(p.valor || 0), 0) - saldo));
  return rows.map(p => {
    let valor = money(p.valor);
    if (p.forma === 'dinheiro') { const used = Math.min(valor, change); valor = money(valor - used); change = money(change - used); }
    return { forma_pagamento: p.forma, valor, id_pessoa: p.pessoaId || null };
  }).filter(p => p.valor > 0);
}
