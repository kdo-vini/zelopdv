import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';

// ENV necessárias
const PRICE_ID = process.env.STRIPE_PRICE_ID_MONTHLY_59; // price_XXXXXXXX
const PAYMENT_LINK = process.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL || process.env.PUBLIC_STRIPE_PAYMENT_LINK_URL; // https://buy.stripe.com/...
const ORIGIN = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, email } = body || {};
    if (!userId || !email) {
      return json({ error: 'userId e email são obrigatórios' }, { status: 400 });
    }
    // Se houver Payment Link configurado, prioriza redirecionamento direto
    if (PAYMENT_LINK) {
      return json({ url: PAYMENT_LINK });
    }

    if (!PRICE_ID) {
      return json({ error: 'STRIPE_PRICE_ID_MONTHLY_59 ausente no ambiente. Alternativa: defina VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL com o Payment Link.' }, { status: 500 });
    }
    if (PRICE_ID.startsWith('http')) {
      return json({ error: 'Valor inválido em STRIPE_PRICE_ID_MONTHLY_59. Informe o ID do price (ex: price_...), não a URL. Para Payment Link use VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL.' }, { status: 500 });
    }

    if (!stripe) return new Response('Stripe não configurado', { status: 500 });

    // 1) Localizar ou criar Customer por e-mail
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0] || await stripe.customers.create({ email, metadata: { user_id: userId } });

    // 2) Criar Checkout Session para assinatura
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
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
