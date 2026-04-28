// Endpoint legado mantido só pra retornar 410 Gone (alguns clients antigos podem chamar).
// Use /api/billing/create-subscription que já cria Stripe Checkout Session.
import { json } from '@sveltejs/kit';

export async function POST() {
  console.warn('[Stripe Legacy] /api/billing/create-checkout-session foi unificado em /api/billing/create-subscription');
  return json({
    error: 'Endpoint descontinuado. Use /api/billing/create-subscription.',
    deprecated: true,
    use: '/api/billing/create-subscription',
  }, { status: 410 });
}
