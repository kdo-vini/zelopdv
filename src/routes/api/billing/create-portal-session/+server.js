import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';

const ORIGIN = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

export async function POST({ request }) {
  if (!stripe) return new Response('Stripe não configurado', { status: 500 });
  try {
    const body = await request.json().catch(() => ({}));
    const { customerId } = body || {};
    if (!customerId) return json({ error: 'customerId é obrigatório' }, { status: 400 });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${ORIGIN}/assinatura`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] create-portal-session error:', err?.message || err);
    return json({ error: 'Falha ao criar portal de cliente' }, { status: 500 });
  }
}
