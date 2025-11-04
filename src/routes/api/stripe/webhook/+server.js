import { stripe } from '$lib/server/stripe';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET; // whsec_...
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export async function POST({ request }) {
  if (!stripe) return new Response('Stripe não configurado', { status: 500 });
  if (!WEBHOOK_SECRET) return new Response('WEBHOOK secret ausente', { status: 500 });
  if (!supabaseAdmin) return new Response('Supabase service role ausente', { status: 500 });

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed.', err?.message || err);
    return new Response('Signature verification failed', { status: 400 });
  }

  try {
  switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        // No immediate DB write; subscription events below will reflect final state
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const payload = {
          user_id: sub.metadata?.user_id || null,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: !!sub.cancel_at_period_end,
          price_id: sub.items?.data?.[0]?.price?.id || null,
          updated_at: new Date().toISOString()
        };
        await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'stripe_subscription_id' });
        break;
      }
      default:
        // ignore others
        break;
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[Stripe] webhook handler error:', err?.message || err);
    return new Response('Webhook error', { status: 500 });
  }
}

export const config = {
  runtime: 'nodejs20.x'
};
