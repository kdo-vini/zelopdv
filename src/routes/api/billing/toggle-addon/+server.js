// Liga/desliga um addon na subscription Stripe via subscription_items.
// Mesas é o único addon hoje. Modelo: cada addon = 1 subscription_item separado com seu próprio price.
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { ADDONS, isAddonAllowed, VALID_ADDONS } from '$lib/pricing';

const ADDON_DB_COLUMN = {
  mesas: 'has_mesas_addon',
};

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!stripe) return json({ error: 'Stripe não configurado.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });
    const userId = user.id;

    const body = await request.json().catch(() => ({}));
    const addon = body.addon;
    const enabled = !!body.enabled;

    if (!VALID_ADDONS.includes(addon)) {
      return json({ error: `Add-on inválido. Suportados: ${VALID_ADDONS.join(', ')}.` }, { status: 400 });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, plan_tier, has_mesas_addon, status, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr || !sub) {
      return json({ error: 'Assinatura não encontrada.' }, { status: 404 });
    }
    if (!sub.provider_subscription_id) {
      return json({ error: 'Assinatura sem provedor. Crie uma assinatura primeiro.' }, { status: 400 });
    }
    if (sub.payment_provider !== 'stripe') {
      return json({ error: 'Esta assinatura não está no Stripe — toggle não suportado.' }, { status: 400 });
    }
    if (!['active', 'trialing'].includes(sub.status)) {
      return json({ error: 'Apenas assinaturas ativas ou em trial podem modificar add-ons.' }, { status: 400 });
    }

    if (enabled && !isAddonAllowed(sub.plan_tier, addon)) {
      return json({
        error: `Add-on "${ADDONS[addon].name}" não é compatível com ${sub.plan_tier}. Mude pra um plano com PDV.`,
      }, { status: 400 });
    }

    // Read current Stripe subscription items
    const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id, { expand: ['items.data.price'] });
    const items = stripeSub.items?.data || [];

    const addonPriceId = ADDONS[addon].stripePriceId;
    const existingItem = items.find((i) => i.price?.id === addonPriceId);

    // No-op
    if (enabled && existingItem) return json({ success: true, unchanged: true });
    if (!enabled && !existingItem) return json({ success: true, unchanged: true });

    let newItems;
    if (enabled) {
      newItems = [{ price: addonPriceId, quantity: 1 }];
    } else {
      // Marca o item pra deletar
      newItems = [{ id: existingItem.id, deleted: true }];
    }

    // Atualiza no Stripe com proration (cobra só o pedaço do mês restante)
    await stripe.subscriptions.update(sub.provider_subscription_id, {
      items: newItems,
      proration_behavior: 'create_prorations',
    });

    // DB sync acontece via webhook customer.subscription.updated, mas atualizamos sincrono pra UX imediata.
    await supabaseAdmin
      .from('subscriptions')
      .update({
        [ADDON_DB_COLUMN[addon]]: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    return json({
      success: true,
      addon,
      enabled,
      message: enabled
        ? `Add-on ${ADDONS[addon].name} ativado. Cobrança proporcional aplicada.`
        : `Add-on ${ADDONS[addon].name} desativado.`,
    });
  } catch (err) {
    console.error('[toggle-addon] Stripe error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao alternar add-on' }, { status: 500 });
  }
}
