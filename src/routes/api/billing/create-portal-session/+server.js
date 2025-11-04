import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

const ORIGIN = env.PUBLIC_APP_URL || 'http://localhost:5173';
const PORTAL_CONFIGURATION = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || env.STRIPE_BILLING_PORTAL_CONFIGURATION;

export async function POST({ request }) {
  if (!stripe) return json({ error: 'Stripe não configurado' }, { status: 500 });
  try {
    const body = await request.json().catch(() => ({}));
    let { customerId, email } = body || {};

    // Fallback: se não veio customerId, tentamos resolver por e-mail
    if (!customerId) {
      if (!email) return json({ error: 'Informe customerId ou email' }, { status: 400 });
      const list = await stripe.customers.list({ email, limit: 1 });
      const found = list.data?.[0] || null;
      if (found) customerId = found.id;
      else {
        const created = await stripe.customers.create({ email });
        customerId = created.id;
      }
    }

    // Preferir o Origin do request em dev para facilitar retorno local
    const reqOrigin = request.headers.get('origin');
    const base = reqOrigin?.startsWith('http') ? reqOrigin : ORIGIN;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/assinatura`,
      ...(PORTAL_CONFIGURATION ? { configuration: PORTAL_CONFIGURATION } : {}),
    });

    return json({ url: session.url });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[Stripe] create-portal-session error:', msg);
    return json({ error: dev ? `[dev] ${msg}` : 'Falha ao criar portal de cliente' }, { status: 500 });
  }
}
