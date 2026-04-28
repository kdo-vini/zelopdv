// Cria sessão de Checkout Stripe pra novo subscriber ou renovação.
// Suporta plano (pdv|chat|bundle) + addons (mesas) como subscription_items separados.
// PIX/Boleto: Stripe BR adicionou suporte beta a PIX; se a feature flag estiver ativa,
// payment_method_types inclui 'pix'. Default = card-only.
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

const PIX_ENABLED = env.BILLING_PIX_ENABLED === 'true';
const ORIGIN = env.PUBLIC_APP_URL || 'https://zelopdv.com.br';
const TRIAL_DAYS = 30;

export async function POST({ request, url }) {
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
      .select('id, provider_subscription_id, provider_customer_id, status, current_period_end, plan_tier, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFirstTime = !existingSub;

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
    const lineItems = buildStripeLineItems(planTier, { mesas: hasMesasAddon });

    // Decide payment methods. PIX via flag — só ligar quando habilitado no Stripe Dashboard.
    const paymentMethodTypes = ['card'];
    if (PIX_ENABLED) paymentMethodTypes.unshift('pix');

    // Subscription data: trial só pra first-time
    const subscriptionData = isFirstTime
      ? {
          trial_period_days: TRIAL_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          metadata: { user_id: userId, plan_tier: planTier, has_mesas_addon: String(hasMesasAddon) },
        }
      : {
          metadata: { user_id: userId, plan_tier: planTier, has_mesas_addon: String(hasMesasAddon) },
        };

    const requestOrigin = url?.origin || ORIGIN;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: lineItems,
      payment_method_types: paymentMethodTypes,
      payment_method_collection: isFirstTime ? 'if_required' : 'always',
      allow_promotion_codes: true,
      subscription_data: subscriptionData,
      success_url: `${requestOrigin}/assinatura?success=1`,
      cancel_url: `${requestOrigin}/assinatura?canceled=1`,
      metadata: {
        user_id: userId,
        plan_tier: planTier,
        has_mesas_addon: String(hasMesasAddon),
      },
    });

    // Pre-record subscription state in DB as 'incomplete'. Webhook (checkout.session.completed)
    // will update with provider_subscription_id and flip to 'trialing'/'active'.
    const nowIso = new Date().toISOString();
    const subData = {
      user_id: userId,
      provider_customer_id: stripeCustomerId,
      payment_provider: 'stripe',
      plan_tier: planTier,
      has_mesas_addon: hasMesasAddon,
      status: existingSub?.status === 'active' ? 'active' : 'incomplete',
      updated_at: nowIso,
    };

    if (existingSub) {
      await supabaseAdmin.from('subscriptions').update(subData).eq('id', existingSub.id);
    } else {
      subData.created_at = nowIso;
      await supabaseAdmin.from('subscriptions').insert(subData);
    }

    return json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[create-subscription] Stripe error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao criar assinatura' }, { status: 500 });
  }
}
