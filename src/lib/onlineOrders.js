const ONLINE_QUEUE_STATUSES = [
  'pending_payment',
  'pending_review',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery'
];

export function mapCanonicalOrder(row) {
  const customer = row?.customer || {};
  const fulfillment = row?.fulfillment || {};
  const items = (row?.zelo_order_items || []).map((item) => ({
    id: item.id,
    id_produto: item.product_id,
    nome: item.name,
    preco_unitario: Number(item.unit_price || 0),
    quantidade: Number(item.quantity || 0),
    subtotal: Number(item.subtotal || 0),
    enviado_cozinha: ['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(row.status),
    status_cozinha: ['ready', 'out_for_delivery'].includes(row.status) ? 'pronto' : 'aguardando'
  }));

  return {
    id: row.id,
    numero_pedido: String(row.id).slice(0, 8).toUpperCase(),
    status: row.status,
    revision: Number(row.revision || 0),
    observacoes: row.observations || fulfillment.observations || '',
    nome_cliente: customer.name || customer.nome || '',
    origem: 'zelomenu',
    source: row.source,
    criado_em: row.created_at,
    total: Number(row.total || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    payment: row.payment || {},
    fulfillment,
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
    .select('id, source, status, revision, customer, fulfillment, payment, total, delivery_fee, observations, created_at, zelo_order_items(id, product_id, name, unit_price, quantity, subtotal, modifiers, position)')
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
