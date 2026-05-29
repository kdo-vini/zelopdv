// Cria sessão de Checkout Stripe pra novo subscriber ou renovação.
// Suporta plano (pdv|chat|bundle) + addons como subscription_items separados.
// Checkout Stripe deste endpoint é apenas cartão. Pix usa o fluxo separado da AbacatePay.
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  isValidPlanTier,
  isAddonAllowed,
  buildStripeLineItems,
  PLANS,
} from '$lib/pricing';
import { progressReferralForUser } from '$lib/server/referrals';

const ORIGIN = env.PUBLIC_APP_URL || 'https://zelopdv.com.br';
const TRIAL_DAYS = 30;

export async function POST({ request, url, cookies }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!stripe) return json({ error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY.' }, { status: 500 });

    // Auth
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;
    const email = user.email;

    // Fire-and-forget: track last activity
    supabaseAdmin
      .from('empresa_perfil')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[create-subscription] last_seen_at:', error.message); })
      .catch(() => {});

    // Parse body
    const body = await request.json().catch(() => ({}));
    const planTier = body.planTier || 'pdv';
    const requestedAddons = body.addons || {};

    if (!isValidPlanTier(planTier)) {
      return json({ error: `Plano inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400 });
    }

    // Mesas só permitido em planos com PDV
    const hasMesasAddon = !!requestedAddons.mesas;
    if (hasMesasAddon && !isAddonAllowed(planTier, 'mesas')) {
      return json({ error: `Plano ${planTier} não suporta o add-on Mesas.` }, { status: 400 });
    }
    const hasPedidosAddon = !!requestedAddons.pedidos;
    if (hasPedidosAddon && !isAddonAllowed(planTier, 'pedidos')) {
      return json({ error: `Plano ${planTier} não suporta o add-on Pedidos + Cozinha.` }, { status: 400 });
    }
    const hasAcessosAddon = !!requestedAddons.acessos;
    if (hasAcessosAddon && !isAddonAllowed(planTier, 'acessos')) {
      return json({ error: `Plano ${planTier} não suporta o add-on Controle de Acessos.` }, { status: 400 });
    }

    // Profile gate: precisa ter CNPJ/CPF preenchido (Stripe não exige, mas usamos pra emitir nota fiscal e validar negócio)
    const { data: perfil } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', userId)
      .maybeSingle();

    if (!perfil?.documento) {
      return json({
        error: 'Complete o perfil da empresa (CPF/CNPJ) antes de assinar.',
        redirect: '/perfil?msg=complete',
      }, { status: 400 });
    }

    // Existing subscription check
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, provider_customer_id, status, current_period_end, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFirstTime = !existingSub;
    const shouldPreserveCurrentAccess = ['active', 'trialing'].includes(existingSub?.status || '');

    // Find or create Stripe customer
    let stripeCustomerId = existingSub?.provider_customer_id && existingSub.payment_provider === 'stripe'
      ? existingSub.provider_customer_id
      : null;

    if (!stripeCustomerId) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      stripeCustomerId = customers.data[0]?.id;
    }
    if (!stripeCustomerId) {
      const newCustomer = await stripe.customers.create({
        email,
        name: perfil.nome_exibicao || email,
        metadata: {
          user_id: userId,
          documento: perfil.documento,
        },
      });
      stripeCustomerId = newCustomer.id;
    }

    // Build line_items
    const lineItems = buildStripeLineItems(planTier, {
      mesas: hasMesasAddon,
      pedidos: hasPedidosAddon,
      acessos: hasAcessosAddon,
    });

    const subscriptionMetadata = {
      user_id: userId,
      plan_tier: planTier,
      has_mesas_addon: String(hasMesasAddon),
      has_pedidos_addon: String(hasPedidosAddon),
      has_acessos_addon: String(hasAcessosAddon),
      early_renewal: String(shouldPreserveCurrentAccess),
      renewal_base_period_end: shouldPreserveCurrentAccess ? existingSub?.current_period_end || '' : '',
    };

    // Subscription data: trial só pra first-time
    const subscriptionData = isFirstTime
      ? {
          trial_period_days: TRIAL_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          metadata: subscriptionMetadata,
        }
      : {
          metadata: subscriptionMetadata,
        };

    const requestOrigin = url?.origin || ORIGIN;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: lineItems,
      payment_method_types: ['card'],
      payment_method_collection: isFirstTime ? 'if_required' : 'always',
      allow_promotion_codes: true,
      subscription_data: subscriptionData,
      success_url: `${requestOrigin}/assinatura?success=1`,
      cancel_url: `${requestOrigin}/assinatura?canceled=1`,
      metadata: subscriptionMetadata,
    });

    // Pre-record subscription state in DB as 'incomplete'. Webhook (checkout.session.completed)
    // will update with provider_subscription_id and flip to 'trialing'/'active'.
    const nowIso = new Date().toISOString();
    // Preserve access state until Stripe confirms checkout. This avoids a trialing
    // or active customer being flipped to "incomplete" or receiving plan/add-on
    // access changes before the hosted Checkout actually succeeds.
    const subData = {
      user_id: userId,
      provider_customer_id: stripeCustomerId,
      payment_provider: 'stripe',
      plan_tier: shouldPreserveCurrentAccess ? existingSub?.plan_tier || planTier : planTier,
      has_mesas_addon: shouldPreserveCurrentAccess ? !!existingSub?.has_mesas_addon : hasMesasAddon,
      has_pedidos_addon: shouldPreserveCurrentAccess ? !!existingSub?.has_pedidos_addon : hasPedidosAddon,
      has_acessos_addon: shouldPreserveCurrentAccess ? !!existingSub?.has_acessos_addon : hasAcessosAddon,
      status: shouldPreserveCurrentAccess ? existingSub.status : 'incomplete',
      updated_at: nowIso,
    };

    if (existingSub) {
      await supabaseAdmin.from('subscriptions').update(subData).eq('id', existingSub.id);
    } else {
      subData.created_at = nowIso;
      await supabaseAdmin.from('subscriptions').insert(subData);
    }

    await progressReferralForUser({
      userId,
      email,
      wantedStatus: 'pending_payment',
      referralCode: cookies?.get?.('zelo_referral_code') || user.user_metadata?.referral_code,
      referralId: cookies?.get?.('zelo_referral_id'),
      source: 'create-subscription',
    }).catch((err) => {
      console.warn('[create-subscription] referral progress error:', err?.message || err);
    });

    return json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[create-subscription] Stripe error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao criar assinatura' }, { status: 500 });
  }
}
