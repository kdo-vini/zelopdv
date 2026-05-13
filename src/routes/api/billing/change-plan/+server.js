// Troca o plano da subscription Stripe (price swap no item principal). Proration on.
// Se o novo plano não permite algum add-on, remove o item correspondente.
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  PLANS,
  ADDONS,
  STRIPE_PRICE_TO_PLAN,
  STRIPE_PRICE_TO_ADDON,
  VALID_ADDONS,
  isValidPlanTier,
  isAddonAllowed,
} from '$lib/pricing';

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
    const targetTier = body.targetTier;

    if (!isValidPlanTier(targetTier)) {
      return json({ error: `Plano alvo inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400 });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, plan_tier, status, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr || !sub) return json({ error: 'Assinatura não encontrada.' }, { status: 404 });
    if (!sub.provider_subscription_id) return json({ error: 'Assinatura sem provedor.' }, { status: 400 });
    if (sub.payment_provider !== 'stripe') return json({ error: 'Esta assinatura não está no Stripe.' }, { status: 400 });
    if (!['active', 'trialing'].includes(sub.status)) {
      return json({ error: 'Apenas assinaturas ativas ou em trial podem trocar de plano.' }, { status: 400 });
    }
    if (sub.plan_tier === targetTier) return json({ success: true, planTier: targetTier, unchanged: true });

    // Read Stripe subscription items
    const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id, { expand: ['items.data.price'] });
    const items = stripeSub.items?.data || [];

    // Identificar o item de plano (não-addon)
    const planItem = items.find((i) => STRIPE_PRICE_TO_PLAN[i.price?.id]);
    const addonItems = new Map(
      items
        .map((i) => [STRIPE_PRICE_TO_ADDON[i.price?.id], i])
        .filter(([addonId]) => !!addonId)
    );

    if (!planItem) {
      console.error(`[change-plan] Subscription ${sub.provider_subscription_id} não tem plan item identificável`);
      return json({ error: 'Subscription com estado inconsistente.' }, { status: 500 });
    }

    const newPlanPriceId = PLANS[targetTier].stripePriceId;
    const removedAddons = VALID_ADDONS.filter((addonId) => {
      const item = addonItems.get(addonId);
      return !!item && !isAddonAllowed(targetTier, addonId);
    });

    // Build items array
    const newItems = [{ id: planItem.id, price: newPlanPriceId }];
    for (const addonId of removedAddons) {
      newItems.push({ id: addonItems.get(addonId).id, deleted: true });
    }

    await stripe.subscriptions.update(sub.provider_subscription_id, {
      items: newItems,
      proration_behavior: 'create_prorations',
      metadata: { ...(stripeSub.metadata || {}), plan_tier: targetTier, user_id: userId },
    });

    // Sync DB. Webhook (subscription.updated) também faz isso, mas atualizamos sincrono pra UX imediata.
    const updatePayload = {
      plan_tier: targetTier,
      updated_at: new Date().toISOString(),
    };
    if (removedAddons.includes('mesas')) updatePayload.has_mesas_addon = false;
    if (removedAddons.includes('pedidos')) updatePayload.has_pedidos_addon = false;
    if (removedAddons.includes('acessos')) updatePayload.has_acessos_addon = false;
    await supabaseAdmin.from('subscriptions').update(updatePayload).eq('id', sub.id);

    return json({
      success: true,
      planTier: targetTier,
      previousTier: sub.plan_tier,
      removedAddons,
      message: `Plano alterado para ${PLANS[targetTier].name}. Proporção do mês atual será cobrada.`,
    });
  } catch (err) {
    console.error('[change-plan] Stripe error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao trocar plano' }, { status: 500 });
  }
}
