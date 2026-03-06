import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { env } from '$env/dynamic/private';

const PRICE_ID = env.STRIPE_PRICE_ID_MONTHLY_59;
const PAYMENT_LINK = env.VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL || env.PUBLIC_STRIPE_PAYMENT_LINK_URL;
const ORIGIN = env.PUBLIC_APP_URL || 'http://localhost:5173';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    if (!stripe) return json({ error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;
    const email = user.email;

    if (PAYMENT_LINK) return json({ url: PAYMENT_LINK });

    if (!PRICE_ID) {
      return json({ error: 'STRIPE_PRICE_ID_MONTHLY_59 ausente no ambiente.' }, { status: 500 });
    }
    if (PRICE_ID.startsWith('http')) {
      return json({ error: 'Valor inválido em STRIPE_PRICE_ID_MONTHLY_59. Use price_... não uma URL.' }, { status: 500 });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0] || await stripe.customers.create({ email, metadata: { user_id: userId } });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 7 },
      success_url: `${ORIGIN}/assinatura?success=1`,
      cancel_url: `${ORIGIN}/assinatura?canceled=1`,
      metadata: { user_id: userId },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] create-checkout-session error:', err?.message || err);
    return json({ error: 'Falha ao criar sessão de checkout' }, { status: 500 });
  }
}
