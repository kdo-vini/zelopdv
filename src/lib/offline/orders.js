import { listOperations, readSnapshot, saveSnapshot } from './operations.js';
import { getOfflineContext, submitOfflineOperation } from './runtime.js';
import { loadCanonicalOrders, mapCanonicalOrder } from '../onlineOrders.js';

const KEY = 'orders:queue';
function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || number > 10000000) throw new Error('Valor inválido no pedido.');
  return Math.round(number * 100) / 100;
}
export function buildManualOrderPayload(input) {
  if (!Array.isArray(input?.items) || !input.items.length || input.items.length > 50) throw new Error('Adicione de 1 a 50 itens no pedido.');
  const items = input.items.map(item => {
    const quantity = Number(item.quantity);
    if (!item.productId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 999) throw new Error('Quantidade inválida.');
    return { ...item, quantity, unitPrice: money(item.unitPrice), modifiers: item.modifiers || [] };
  });
  const subtotal = items.reduce((sum, item) => sum + Math.round(item.unitPrice * item.quantity * 100), 0) / 100;
  const deliveryFee = money(input.deliveryFee);
  if (subtotal + deliveryFee > 1000000) throw new Error('Total acima do limite por pedido.');
  return { items, customer: input.customer || {}, fulfillment: input.fulfillment || {}, payment: input.payment || {},
    observations: input.observations || '', deliveryFee, subtotal, total: money(subtotal + deliveryFee) };
}

function localOrder(operation) {
  const p = operation.payload;
  const remoteId = operation.result?.id || operation.result?.orderId;
  const order = mapCanonicalOrder({ id: remoteId || operation.entityId, source: 'manual', status: 'pending_review',
    customer: p.customer, fulfillment: p.fulfillment, payment: p.payment, observations: p.observations,
    total: p.total, delivery_fee: p.deliveryFee, created_at: operation.occurredAt,
    zelo_order_items: p.items.map((item, index) => ({ id: `${operation.entityId}:${index}`, product_id: item.productId,
      name: item.name, unit_price: item.unitPrice, quantity: item.quantity, subtotal: money(item.unitPrice * item.quantity),
      modifiers: item.modifiers, pizza: item.pizza })) });
  return { ...order, localOnly: true, syncStatus: operation.status, operationId: operation.operationId };
}

/** Acked creates remain visible until a subsequent remote queue fetch has included their receipt. */
export function mergeLocalOrders(remote, operations, reconciled = []) {
  const rows = [...remote];
  for (const op of operations.filter(row => row.type === 'order.create')) {
    if (op.status === 'acked' && reconciled.includes(op.operationId)) continue;
    const row = localOrder(op);
    if (!rows.some(existing => existing.id === row.id)) rows.push(row);
  }
  return rows.sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
}
export async function loadLocalOrders(ownerUserId) {
  const [snapshot, operations] = await Promise.all([readSnapshot(ownerUserId, KEY), listOperations(ownerUserId)]);
  return mergeLocalOrders(snapshot?.orders || [], operations, snapshot?.reconciled || []);
}
export async function refreshOrderSnapshot(supabase, ownerUserId, empresaId) {
  if (globalThis.navigator?.onLine === false || !empresaId) return loadLocalOrders(ownerUserId);
  const before = await listOperations(ownerUserId);
  const controller = new AbortController();
  let timer;
  let orders;
  try {
    orders = await Promise.race([loadCanonicalOrders(supabase, empresaId, { signal: controller.signal }),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Conexão indisponível.')); }, 3000); })]);
  } finally { clearTimeout(timer); }
  const reconciled = before.filter(row => row.type === 'order.create' && row.status === 'acked').map(row => row.operationId);
  await saveSnapshot(ownerUserId, KEY, { orders, reconciled, fetchedAt: Date.now() });
  return loadLocalOrders(ownerUserId);
}
export async function createManualOrder(input, { operationId = crypto.randomUUID(), ownerUserId, operatorId } = {}) {
  const context = getOfflineContext();
  if (!context || (ownerUserId && ownerUserId !== context.ownerUserId) || (operatorId && operatorId !== context.userId)) throw new Error('Conta alterada. Reabra o pedido.');
  const payload = buildManualOrderPayload(input);
  const operation = await submitOfflineOperation('order.create', operationId, payload, { operationId,
    clearDraft: { operatorId: context.userId, key: 'manual-order' } });
  return localOrder(operation);
}
