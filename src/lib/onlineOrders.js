import { pizzaModifiers } from './pizza.js';

const ONLINE_QUEUE_STATUSES = [
  'pending_payment',
  'pending_review',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery'
];

/** Identifies the Postgres error returned when the browser lost its authenticated role. */
export function isCanonicalOrderPermissionError(error) {
  return error?.code === '42501'
    || /permission denied for table\s+zelo_orders/i.test(error?.message || '');
}

/**
 * Canonical public orders use ZeloMenu snapshot names (`type` and
 * `declaredMethod`). Older producers used the shorter PDV names (`mode` and
 * `method`), so keep this adapter tolerant of both contracts.
 */
export function canonicalFulfillmentMode(orderOrFulfillment) {
  const fulfillment = orderOrFulfillment?.fulfillment || orderOrFulfillment || {};
  return fulfillment.mode === 'delivery' || fulfillment.type === 'delivery'
    ? 'delivery'
    : 'retirada';
}

export function canonicalPaymentMethod(orderOrPayment) {
  const payment = orderOrPayment?.payment || orderOrPayment || {};
  return payment.declaredMethod || payment.method || payment.forma_pagamento || 'outro';
}

/**
 * Normaliza a montagem de um item (grupos de modificadores) para
 * `{ groupName, optionNames }`. Tolera tanto o payload cru do banco
 * (`selectedOptions`) quanto grupos já mapeados (`optionNames`), porque a
 * mesma função serve o mapeamento canônico e a renderização na tela.
 */
export function normalizeModifierGroups(rawModifiers) {
  if (!Array.isArray(rawModifiers)) return [];

  return rawModifiers.map((group) => {
    const selectedOptions = Array.isArray(group?.selectedOptions) ? group.selectedOptions : [];
    const optionNames = Array.isArray(group?.optionNames)
      ? group.optionNames.filter(Boolean)
      : selectedOptions
        .map((option) => {
          const name = option?.optionName || option?.name;
          if (!name) return '';
          const quantity = Number(option?.quantity || 1);
          return quantity > 1 ? `${quantity}x ${name}` : name;
        })
        .filter(Boolean);

    return {
      groupName: group?.groupName || group?.name || 'Opções',
      optionNames,
    };
  }).filter((group) => group.optionNames.length > 0);
}

/** Grupos de montagem de um item da fila, venha ele do mapeamento ou do banco. */
export function itemModifierGroups(item) {
  const groups = item?.modifierGroups || item?.modifiers || [];
  return normalizeModifierGroups(item?.pizza && !groups.some((group) => group.groupId === '__pizza_size' || group.groupName === 'Tamanho') ? [...pizzaModifiers(item.pizza), ...groups] : groups);
}

export function mapCanonicalOrder(row) {
  const customer = row?.customer || {};
  const fulfillment = row?.fulfillment || {};
  const items = (row?.zelo_order_items || []).map((item) => {
    const modifierGroups = itemModifierGroups(item);
    return {
      ...(modifierGroups.length ? { modifierGroups } : {}),
      id: item.id,
      ...(item.pizza ? { pizza: item.pizza } : {}),
      id_produto: item.product_id,
      nome: item.name,
      preco_unitario: Number(item.unit_price || 0),
      quantidade: Number(item.quantity || 0),
      subtotal: Number(item.subtotal || 0),
      enviado_cozinha: ['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(row.status),
      status_cozinha: ['ready', 'out_for_delivery'].includes(row.status) ? 'pronto' : 'aguardando'
    };
  });

  return {
    id: row.id,
    numero_pedido: String(row.id).slice(0, 8).toUpperCase(),
    status: row.status,
    revision: Number(row.revision || 0),
    observacoes: row.observations || fulfillment.observations || '',
    nome_cliente: customer.name || customer.nome || '',
    customer_phone: customer.phone || customer.telefone || '',
    origem: 'zelomenu',
    source: row.source,
    criado_em: row.created_at,
    total: Number(row.total || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    payment: row.payment || {},
    fulfillment,
    forma_pagamento: canonicalPaymentMethod(row),
    tipo_pedido: canonicalFulfillmentMode(row),
    pedido_itens: items,
    itens: items,
    canonical: true
  };
}

export async function loadCanonicalOrders(supabase, empresaId, { kitchen = false } = {}) {
  if (!empresaId) return [];
  const statuses = kitchen
    ? ['accepted', 'preparing', 'ready']
    : ONLINE_QUEUE_STATUSES;
  const { data, error } = await supabase
    .from('zelo_orders')
    .select('id, source, status, revision, customer, fulfillment, payment, total, delivery_fee, observations, created_at, zelo_order_items(id, product_id, name, unit_price, quantity, subtotal, modifiers, pizza, position)')
    .eq('empresa_id', empresaId)
    .in('status', statuses)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapCanonicalOrder);
}

export async function transitionCanonicalOrder(supabase, order, action, actorId, detail = {}) {
  const { data, error } = await supabase.rpc('transition_zelo_order', {
    p_order_id: order.id,
    p_expected_revision: order.revision,
    p_action: action,
    p_actor_id: actorId || null,
    p_detail: detail
  });
  if (error) throw error;
  return data;
}

export async function closeCanonicalOrder(supabase, order, payment, actorId) {
  const { data, error } = await supabase.rpc('close_zelo_order', {
    p_order_id: order.id,
    p_expected_revision: order.revision,
    p_payment: payment || {},
    p_actor_id: actorId || null
  });
  if (error) throw error;
  return data;
}

/**
 * Subscribe to the shared canonical aggregate so a status change made by
 * ZeloChat (including cancellation) disappears from the PDV queue promptly.
 */
export function subscribeCanonicalOrderUpdates(supabase, empresaId, onChange) {
  if (!supabase || !empresaId || typeof onChange !== 'function') return null;

  return supabase
    .channel(`zelo-pdv-orders-${empresaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'zelo_orders', filter: `empresa_id=eq.${empresaId}` },
      onChange
    )
    .subscribe();
}
