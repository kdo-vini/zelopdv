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

/**
 * iFood items store the provider's flat option list
 * (`[{ name, groupName, quantity }]`); group it into the queue's
 * `{ groupName, selectedOptions }` shape so both screens render it like any
 * other channel's modifiers.
 */
function groupIfoodOptions(options) {
  if (!Array.isArray(options)) return [];
  const groups = new Map();
  for (const option of options) {
    const name = typeof option?.name === 'string' ? option.name.trim() : '';
    if (!name) continue;
    const groupName = (typeof option?.groupName === 'string' && option.groupName.trim()) || 'Opções';
    if (!groups.has(groupName)) groups.set(groupName, { groupName, selectedOptions: [] });
    groups.get(groupName).selectedOptions.push({ optionName: name, quantity: Number(option?.quantity || 1) });
  }
  return [...groups.values()];
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Normalizes the iFood snapshot stored by `project_ifood_order_event_v1` into
 * the flat delivery/payment fields the existing queue presentation reads.
 * Returns `{ ifood, fulfillment, payment, phone }` for iFood rows only.
 */
function ifoodViewParts(row) {
  const customer = row?.customer || {};
  const fulfillment = row?.fulfillment || {};
  const payment = row?.payment || {};
  const block = fulfillment.ifood && typeof fulfillment.ifood === 'object' ? fulfillment.ifood : {};
  const address = customer.deliveryAddress && typeof customer.deliveryAddress === 'object'
    ? customer.deliveryAddress
    : {};

  const deliveryFields = {
    deliveryStreet: stringOrNull(address.streetName) || stringOrNull(address.formattedAddress),
    deliveryNumber: stringOrNull(address.streetNumber),
    deliveryComplement: stringOrNull(address.complement),
    deliveryNeighborhood: stringOrNull(address.neighborhood),
    deliveryCity: stringOrNull(address.city),
    deliveryState: stringOrNull(address.state),
    deliveryPostalCode: stringOrNull(address.postalCode),
    deliveryReference: stringOrNull(address.reference)
  };

  const methods = Array.isArray(payment.methods) ? payment.methods : [];
  const cashMethod = methods.find((method) => method?.cash && Number.isFinite(Number(method.cash.changeFor)));
  const changeFor = cashMethod ? Number(cashMethod.cash.changeFor) : null;
  const total = Number(row?.total || 0);
  const cashFields = changeFor !== null && changeFor > 0
    ? { valorRecebido: changeFor, troco: Math.max(0, Math.round((changeFor - total) * 100) / 100) }
    : {};

  // iFood masks the real cellphone (LGPD). `number` is often an 0800 bridge
  // and `localizer` is the code the merchant must dial to reach the customer.
  const phoneNumber = customer.phone && typeof customer.phone === 'object'
    ? stringOrNull(customer.phone.number)
    : stringOrNull(customer.phone);
  const phoneLocalizer = customer.phone && typeof customer.phone === 'object'
    ? stringOrNull(customer.phone.localizer)
    : null;
  const phone = [phoneNumber, phoneLocalizer ? `(localizador ${phoneLocalizer})` : null]
    .filter(Boolean)
    .join(' ');

  return {
    ifood: {
      displayId: stringOrNull(block.displayId),
      externalOrderId: stringOrNull(block.externalOrderId),
      preparationStartAt: stringOrNull(block.preparationStartAt),
      scheduled: block.scheduled === true,
      scheduleStart: stringOrNull(block.scheduleStart),
      scheduleEnd: stringOrNull(block.scheduleEnd),
      pickupCode: stringOrNull(block.pickupCode),
      deliveryCode: stringOrNull(block.deliveryCode),
      phoneNumber: phoneNumber || null,
      phoneLocalizer: phoneLocalizer || null
    },
    fulfillment: { ...fulfillment, ...Object.fromEntries(Object.entries(deliveryFields).filter(([, value]) => value !== null)) },
    payment: { ...payment, ...cashFields },
    phone: phone || ''
  };
}

export function mapCanonicalOrder(row) {
  const customer = row?.customer || {};
  const isIfood = row?.source === 'ifood';
  const ifoodParts = isIfood ? ifoodViewParts(row) : null;
  const fulfillment = ifoodParts ? ifoodParts.fulfillment : (row?.fulfillment || {});
  const payment = ifoodParts ? ifoodParts.payment : (row?.payment || {});
  const items = (row?.zelo_order_items || []).map((item) => {
    const modifierGroups = isIfood
      ? normalizeModifierGroups(groupIfoodOptions(item.modifiers))
      : itemModifierGroups(item);
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
    numero_pedido: ifoodParts?.ifood.displayId || String(row.id).slice(0, 8).toUpperCase(),
    status: row.status,
    revision: Number(row.revision || 0),
    observacoes: row.observations || fulfillment.observations || '',
    nome_cliente: customer.name || customer.nome || '',
    customer_phone: ifoodParts ? ifoodParts.phone : (customer.phone || customer.telefone || ''),
    origem: row.source || 'zelomenu',
    source: row.source,
    ifood: ifoodParts ? ifoodParts.ifood : null,
    criado_em: row.created_at,
    total: Number(row.total || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    payment,
    fulfillment,
    forma_pagamento: canonicalPaymentMethod({ payment }),
    tipo_pedido: canonicalFulfillmentMode(row),
    pedido_itens: items,
    itens: items,
    canonical: true
  };
}

export async function loadCanonicalOrders(supabase, empresaId, { kitchen = false, signal } = {}) {
  if (!empresaId) return [];
  const statuses = kitchen
    ? ['accepted', 'preparing', 'ready']
    : ONLINE_QUEUE_STATUSES;
  let query = supabase
    .from('zelo_orders')
    .select('id, source, status, revision, customer, fulfillment, payment, total, delivery_fee, observations, created_at, zelo_order_items(id, product_id, name, unit_price, quantity, subtotal, modifiers, pizza, position)')
    .eq('empresa_id', empresaId)
    .in('status', statuses)
    .order('created_at', { ascending: true });
  if (signal && query.abortSignal) query = query.abortSignal(signal);
  const { data, error } = await query;
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
