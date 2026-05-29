// Stripe webhook handler.
//
// Eventos tratados:
// - checkout.session.completed: subscription criada via Checkout — popular DB
// - customer.subscription.created/updated: mudanças de plano/addon — sync plan_tier + add-ons
// - customer.subscription.deleted: subscription cancelada — marca canceled
// - customer.subscription.trial_will_end: 3 dias antes do trial — log only (futuro: enviar email)
// - invoice.paid / invoice.payment_succeeded: pagamento OK — extender current_period_end
// - invoice.payment_failed: pagamento falhou — past_due
//
// Idempotência: usa public.webhook_events_processed (provider, event_id PK).

import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { env } from '$env/dynamic/private';
import { parseStripeSubscriptionItems } from '$lib/pricing';

const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

// Marca evento como processado. Retorna true na 1ª vez, false se já processado.
async function markEventProcessed(eventId, eventType) {
  if (!eventId) return true;
  const { data, error } = await supabaseAdmin
    .from('webhook_events_processed')
    .insert({ provider: 'stripe', event_id: eventId, event_type: eventType })
    .select('event_id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return false; // unique_violation = já processado
    console.error('[Stripe Webhook] markEventProcessed error:', error);
    return true; // erro de DB transiente — processa pra não perder evento
  }
  return !!data;
}

// Localiza row de subscriptions pelo subscription_id ou customer_id (fallback).
async function findSubscriptionRow({ stripeSubId, stripeCustomerId, userId }) {
  if (stripeSubId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('provider_subscription_id', stripeSubId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (userId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('provider_customer_id', stripeCustomerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

// Aplica updates no row de subscription
async function updateSubscriptionRow(rowId, payload) {
  payload.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(payload)
    .eq('id', rowId);
  if (error) console.error('[Stripe Webhook] DB update error:', error);
  return !error;
}

// Mapeia status Stripe → status DB. Stripe usa: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid.
function mapStripeStatus(stripeStatus) {
  const map = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
  };
  return map[stripeStatus] || stripeStatus || 'incomplete';
}

function toStripeTimestampDate(timestamp) {
  if (!timestamp) return null;
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return null;
  const date = new Date(numericTimestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStripeSubscriptionPeriodEnd(sub) {
  const subscriptionPeriodEnd = toStripeTimestampDate(sub?.current_period_end);
  if (subscriptionPeriodEnd) return subscriptionPeriodEnd;

  const itemPeriodEnds = (sub?.items?.data || [])
    .map((item) => toStripeTimestampDate(item?.current_period_end))
    .filter(Boolean);

  if (itemPeriodEnds.length === 0) return null;
  return new Date(Math.max(...itemPeriodEnds.map((date) => date.getTime())));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(baseDate, months) {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getLatestDate(...dates) {
  const validDates = dates.filter((date) => date && !Number.isNaN(date.getTime()));
  if (!validDates.length) return null;
  return validDates.reduce((latest, date) => (date > latest ? date : latest));
}

function getSubscriptionPeriodEndForDb(sub, rowCurrentPeriodEnd = null) {
  const stripePeriodEnd = getStripeSubscriptionPeriodEnd(sub);
  const rowPeriodEnd = parseDate(rowCurrentPeriodEnd);

  if (sub?.metadata?.early_renewal === 'true') {
    const renewalBase = parseDate(sub.metadata?.renewal_base_period_end);
    const renewedPeriodEnd = renewalBase ? addMonths(renewalBase, 1) : null;
    return getLatestDate(renewedPeriodEnd, rowPeriodEnd, stripePeriodEnd)?.toISOString()
      || rowCurrentPeriodEnd;
  }

  return getLatestDate(stripePeriodEnd, rowPeriodEnd)?.toISOString() || rowCurrentPeriodEnd;
}

export async function POST({ request }) {
  if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  if (!stripe) return json({ error: 'Stripe não configurado.' }, { status: 500 });
  if (!WEBHOOK_SECRET) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET não configurado');
    return json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  // Verifica assinatura do Stripe
  const sig = request.headers.get('stripe-signature');
  const rawBody = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err?.message);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  const eventId = event.id;
  const eventType = event.type;

  // Idempotency
  const isFirstTime = await markEventProcessed(eventId, eventType);
  if (!isFirstTime) {
    console.log(`[Stripe Webhook] Event ${eventId} already processed`);
    return json({ received: true, idempotent: true });
  }

  console.log(`[Stripe Webhook] Event: ${eventType}, Id: ${eventId}`);

  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.user_id || session.subscription_data?.metadata?.user_id;
        const stripeSubId = session.subscription;
        const stripeCustomerId = session.customer;

        if (!stripeSubId) break;

        // Buscar a subscription completa pra ler os items (precisamos saber plan + addons reais)
        const sub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ['items.data.price'] });
        const { planTier, addons } = parseStripeSubscriptionItems(sub.items?.data);

        const row = await findSubscriptionRow({ stripeSubId, stripeCustomerId, userId });
        if (!row) {
          console.warn(`[Stripe Webhook] checkout.session.completed: nenhum row encontrado para user=${userId}`);
          break;
        }

        await updateSubscriptionRow(row.id, {
          provider_subscription_id: stripeSubId,
          provider_customer_id: stripeCustomerId,
          payment_provider: 'stripe',
          plan_tier: planTier || row.plan_tier || 'pdv',
          has_mesas_addon: !!addons.mesas,
          has_pedidos_addon: !!addons.pedidos,
          has_acessos_addon: !!addons.acessos,
          status: mapStripeStatus(sub.status),
          current_period_end: getSubscriptionPeriodEndForDb(sub, row.current_period_end),
          billing_type: 'CREDIT_CARD',
          cancel_at_period_end: !!sub.cancel_at_period_end,
        });
        console.log(`[Stripe Webhook] [OK] Subscription created/updated for user ${userId} → ${planTier}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        const stripeSubId = sub.id;
        const stripeCustomerId = sub.customer;

        const items = sub.items?.data;
        const { planTier, addons } = parseStripeSubscriptionItems(items);

        const row = await findSubscriptionRow({ stripeSubId, stripeCustomerId, userId });
        if (!row) {
          console.warn(`[Stripe Webhook] subscription.${eventType.includes('created') ? 'created' : 'updated'}: row não encontrado para sub=${stripeSubId}`);
          break;
        }

        await updateSubscriptionRow(row.id, {
          provider_subscription_id: stripeSubId,
          provider_customer_id: stripeCustomerId,
          payment_provider: 'stripe',
          plan_tier: planTier || row.plan_tier || 'pdv',
          has_mesas_addon: !!addons.mesas,
          has_pedidos_addon: !!addons.pedidos,
          has_acessos_addon: !!addons.acessos,
          status: mapStripeStatus(sub.status),
          current_period_end: getSubscriptionPeriodEndForDb(sub, row.current_period_end),
          cancel_at_period_end: !!sub.cancel_at_period_end,
        });
        console.log(`[Stripe Webhook] [SYNC] sub ${stripeSubId} → status=${sub.status}, plan=${planTier}, mesas=${!!addons.mesas}, pedidos=${!!addons.pedidos}, acessos=${!!addons.acessos}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const row = await findSubscriptionRow({ stripeSubId: sub.id, stripeCustomerId: sub.customer, userId: sub.metadata?.user_id });
        if (!row) break;
        await updateSubscriptionRow(row.id, {
          status: 'canceled',
          cancel_at_period_end: true,
        });
        console.log(`[Stripe Webhook] [CANCELED] sub ${sub.id}`);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // 3 dias antes do trial expirar — log only (futuro: enviar email/whatsapp)
        const sub = event.data.object;
        console.log(`[Stripe Webhook] [INFO] trial_will_end for sub ${sub.id}`);
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;
        if (!stripeSubId) break;

        const row = await findSubscriptionRow({ stripeSubId, stripeCustomerId: invoice.customer });
        if (!row) break;

        // current_period_end vem da subscription, não da invoice. Buscar pra garantir.
        const sub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ['items.data.price'] });
        const periodEndIso = getSubscriptionPeriodEndForDb(sub, row.current_period_end);
        await updateSubscriptionRow(row.id, {
          status: 'active',
          current_period_end: periodEndIso || row.current_period_end,
        });
        console.log(`[Stripe Webhook] [PAID] sub ${stripeSubId} active until ${periodEndIso || row.current_period_end || 'unknown'}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;
        if (!stripeSubId) break;
        const row = await findSubscriptionRow({ stripeSubId, stripeCustomerId: invoice.customer });
        if (!row) break;
        await updateSubscriptionRow(row.id, {
          status: 'past_due',
        });
        console.log(`[Stripe Webhook] [FAILED] sub ${stripeSubId} past_due`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${eventType}`);
    }

    return json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err?.message || err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
