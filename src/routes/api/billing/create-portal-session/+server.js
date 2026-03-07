import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { env } from '$env/dynamic/private';

const ORIGIN = env.PUBLIC_APP_URL;
const PORTAL_CONFIGURATION = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || env.STRIPE_BILLING_PORTAL_CONFIGURATION;

export async function POST({ request, url }) {
  if (!stripe) return json({ error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY.' }, { status: 500 });
  if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    // Always look up customerId from DB — never trust client-sent IDs (IDOR prevention)
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id || null;

    if (!customerId) {
      const list = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = list.data?.[0]?.id || null;
      if (!customerId) {
        const created = await stripe.customers.create({ email: user.email });
        customerId = created.id;
      }
    }

    const requestOrigin = request.headers.get('origin') || request.headers.get('x-forwarded-host')
      ? `https://${request.headers.get('x-forwarded-host')}`
      : null;
    const origin = ORIGIN || requestOrigin || url.origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/assinatura`,
      ...(PORTAL_CONFIGURATION ? { configuration: PORTAL_CONFIGURATION } : {}),
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] create-portal-session error:', err?.message || err);
    return json({ error: 'Falha ao criar portal de cliente' }, { status: 500 });
  }
}
