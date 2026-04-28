// Admin-only: sincroniza plan_tier + has_mesas_addon de uma sub Stripe ao chamar Stripe API.
// Combina lógica de change-plan + toggle-addon num único POST. Auth: super_admin.
// Proration desligada (admin override = ajuste administrativo, mudança vale no próximo ciclo).
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  PLANS,
  ADDONS,
  STRIPE_PRICE_TO_PLAN,
  STRIPE_PRICE_TO_ADDON,
  isValidPlanTier,
  isAddonAllowed,
} from '$lib/pricing';

// Ajuste o domínio admin aqui se diferir.
const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403 });
  }

  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500, headers: cors });
    if (!stripe) return json({ error: 'Stripe não configurado.' }, { status: 500, headers: cors });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: admin } = await supabaseAdmin
      .from('super_admins')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!admin) return json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers: cors });

    const body = await request.json().catch(() => ({}));
    const { subscriptionId, planTier, hasMesasAddon } = body;

    if (!subscriptionId) return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });
    if (!isValidPlanTier(planTier)) {
      return json({ error: `Plano alvo inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400, headers: cors });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, provider_subscription_id, plan_tier, has_mesas_addon, status, payment_provider')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });

    if (sub.payment_provider !== 'stripe') {
      return json({ error: 'Esta subscription não está no Stripe — use update direto no DB.' }, { status: 400, headers: cors });
    }
    if (!sub.provider_subscription_id) {
      return json({ error: 'Subscription sem provider_subscription_id.' }, { status: 400, headers: cors });
    }

    let stripeSub;
    try {
      stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id, { expand: ['items.data.price'] });
    } catch (err) {
      const isMissing = err?.code === 'resource_missing' || err?.statusCode === 404;
      if (isMissing) {
        return json({
          code: 'stripe_resource_missing',
          error: `Subscription ${sub.provider_subscription_id} não existe no Stripe — provavelmente é dado órfão. Reclassifique como manual.`,
          providerSubscriptionId: sub.provider_subscription_id,
        }, { status: 422, headers: cors });
      }
      throw err;
    }

    const items = stripeSub.items?.data || [];
    const planItem = items.find((i) => STRIPE_PRICE_TO_PLAN[i.price?.id]);
    const mesasItem = items.find((i) => STRIPE_PRICE_TO_ADDON[i.price?.id] === 'mesas');

    if (!planItem) {
      console.error(`[admin/sync-plan] Subscription ${sub.provider_subscription_id} sem plan item identificável`);
      return json({ error: 'Subscription com estado inconsistente — sem plan item identificável.' }, { status: 500, headers: cors });
    }

    const newPlanPriceId = PLANS[planTier].stripePriceId;
    const planChanged = planItem.price?.id !== newPlanPriceId;

    const wantsMesas = !!hasMesasAddon && isAddonAllowed(planTier, 'mesas');
    const hasMesasNow = !!mesasItem;

    const newItems = [];
    if (planChanged) {
      newItems.push({ id: planItem.id, price: newPlanPriceId });
    }
    if (wantsMesas && !hasMesasNow) {
      newItems.push({ price: ADDONS.mesas.stripePriceId, quantity: 1 });
    } else if (!wantsMesas && hasMesasNow) {
      newItems.push({ id: mesasItem.id, deleted: true });
    }

    if (newItems.length > 0) {
      await stripe.subscriptions.update(sub.provider_subscription_id, {
        items: newItems,
        proration_behavior: 'none',
        metadata: { ...(stripeSub.metadata || {}), plan_tier: planTier, admin_synced_by: admin.id },
      });
    }

    await supabaseAdmin
      .from('subscriptions')
      .update({
        plan_tier: planTier,
        has_mesas_addon: wantsMesas,
        last_modified_by: admin.id,
        last_modified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    return json({
      success: true,
      planTier,
      hasMesasAddon: wantsMesas,
      stripeUpdated: newItems.length > 0,
      previousTier: sub.plan_tier,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/sync-plan] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao sincronizar plano.' }, { status: 500, headers: cors });
  }
}
