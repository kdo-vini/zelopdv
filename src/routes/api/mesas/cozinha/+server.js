import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { isSubscriptionActiveStrict } from '$lib/subscriptionStatus';

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.replace(/^Bearer\s+/i, '').trim() || null;
}

function hasPermission(accessContext, permission) {
  return !accessContext.isSubUser || accessContext.permissions?.[permission] === true;
}

function hasKitchenAccess(subscription) {
  if (!subscription || !isSubscriptionActiveStrict(subscription)) return false;
  if (subscription.has_mesas_addon !== true) return false;
  if (subscription.plan_tier === 'chat' || subscription.plan_tier === 'bundle') return true;
  return subscription.plan_tier === 'pdv' && subscription.has_zelo_menu === true;
}

function normalizeUuid(value) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

/**
 * Materializes one comanda item as a canonical kitchen order.
 * The browser sends only the comanda/item IDs; tenant, product snapshot and
 * idempotency key are derived here from owner-scoped server data.
 */
export async function POST({ request }) {
  if (!supabaseAdmin) {
    return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) return json({ error: 'Não autorizado.' }, { status: 401 });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Não autorizado.' }, { status: 401 });

  const accessContext = await getServerAccessContext(user.id);
  if (!hasPermission(accessContext, 'mesas.editar_itens') || !hasPermission(accessContext, 'pedidos.cozinha')) {
    return json({ error: 'Você não tem permissão para enviar itens à cozinha.' }, { status: 403 });
  }

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_tier, has_zelo_menu, has_mesas_addon, status, current_period_end, manually_extended_until')
    .eq('user_id', accessContext.ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) {
    console.error('[mesas/cozinha] subscription lookup failed:', subscriptionError.message);
    return json({ error: 'Não foi possível validar o acesso à cozinha.' }, { status: 500 });
  }
  if (!hasKitchenAccess(subscription)) {
    return json({ error: 'A fila de cozinha do ZeloMenu não está ativa nesta empresa.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const comandaId = normalizeUuid(body?.comandaId);
  const itemId = normalizeUuid(body?.itemId);
  if (!comandaId || !itemId) {
    return json({ error: 'comandaId e itemId são obrigatórios.' }, { status: 400 });
  }

  const { data: comanda, error: comandaError } = await supabaseAdmin
    .from('comandas')
    .select('id, id_mesa, status')
    .eq('id', comandaId)
    .eq('id_usuario', accessContext.ownerUserId)
    .maybeSingle();
  if (comandaError) {
    console.error('[mesas/cozinha] comanda lookup failed:', comandaError.message);
    return json({ error: 'Não foi possível carregar a comanda.' }, { status: 500 });
  }
  if (!comanda || comanda.status !== 'aberta' || !comanda.id_mesa) {
    return json({ error: 'A comanda não está aberta.' }, { status: 409 });
  }

  const { data: mesa, error: mesaError } = await supabaseAdmin
    .from('mesas')
    .select('id, numero, ativa')
    .eq('id', comanda.id_mesa)
    .eq('id_usuario', accessContext.ownerUserId)
    .maybeSingle();
  if (mesaError) {
    console.error('[mesas/cozinha] mesa lookup failed:', mesaError.message);
    return json({ error: 'Não foi possível validar a mesa.' }, { status: 500 });
  }
  if (!mesa || mesa.ativa === false) {
    return json({ error: 'A mesa não está disponível.' }, { status: 409 });
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from('comanda_itens')
    .select('id, id_comanda, id_produto, quantidade, preco_unitario, observacao, modifiers, nome_produto_na_venda')
    .eq('id', itemId)
    .eq('id_comanda', comandaId)
    .maybeSingle();
  if (itemError) {
    console.error('[mesas/cozinha] item lookup failed:', itemError.message);
    return json({ error: 'Não foi possível carregar o item da comanda.' }, { status: 500 });
  }
  if (!item) return json({ error: 'Item não encontrado na comanda.' }, { status: 404 });

  let productName = 'Produto';
  if (item.id_produto != null) {
    const { data: product, error: productError } = await supabaseAdmin
      .from('produtos')
      .select('id, nome')
      .eq('id', item.id_produto)
      .eq('id_usuario', accessContext.ownerUserId)
      .maybeSingle();
    if (productError) {
      console.error('[mesas/cozinha] product lookup failed:', productError.message);
      return json({ error: 'Não foi possível carregar o produto.' }, { status: 500 });
    }
    if (!product) return json({ error: 'Produto não encontrado no catálogo.' }, { status: 409 });
    productName = item.nome_produto_na_venda || product.nome || productName;
  }

  const quantity = Number(item.quantidade);
  const unitPrice = Number(item.preco_unitario);
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return json({ error: 'Item da comanda inválido.' }, { status: 409 });
  }

  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const empresa = await supabaseAdmin
    .from('empresa_perfil')
    .select('id')
    .eq('user_id', accessContext.ownerUserId)
    .maybeSingle();
  if (empresa.error) {
    console.error('[mesas/cozinha] empresa lookup failed:', empresa.error.message);
    return json({ error: 'Não foi possível identificar a empresa.' }, { status: 500 });
  }
  if (!empresa.data?.id) return json({ error: 'Empresa não encontrada.' }, { status: 409 });

  const idempotencyKey = `mesa:${comandaId}:item:${itemId}`;
  const { data: order, error: orderError } = await supabaseAdmin.rpc('create_zelo_order', {
    p_session_id: null,
    p_expected_revision: 1,
    p_idempotency_key: idempotencyKey,
    p_snapshots: {
      empresaId: empresa.data.id,
      source: 'mesa',
      customer: { name: `Mesa ${mesa.numero || ''}`.trim(), phone: null },
      fulfillment: { type: 'mesa', mesaId: mesa.id, comandaId, comandaItemId: itemId },
      pricing: { subtotal, deliveryFee: 0, discount: 0, total: subtotal },
      payment: { declaredMethod: 'outro' },
      cart: {
        observations: item.observacao || null,
        items: [{
          productId: item.id_produto,
          productName,
          unitPrice,
          quantity,
          lineTotal: subtotal,
          modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
          position: 0,
        }],
      },
    },
  });

  if (orderError) {
    console.error('[mesas/cozinha] canonical order failed:', orderError.message);
    return json({ error: 'Não foi possível enviar o item à cozinha.' }, { status: 409 });
  }

  return json({
    success: true,
    orderId: order?.orderId || null,
    alreadyConfirmed: order?.alreadyConfirmed === true,
    source: 'mesa',
  });
}
