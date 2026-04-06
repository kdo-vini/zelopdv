/**
 * Stripe webhook — DESATIVADO (migração para Asaas concluída).
 *
 * Este endpoint retorna 200 sem processar eventos para evitar
 * retentativas do Stripe e race conditions com o webhook do Asaas.
 *
 * TODO: Remover o endpoint no dashboard do Stripe em:
 *   Developers → Webhooks → [seu endpoint] → Delete
 */
import { json } from '@sveltejs/kit';

export async function POST() {
  console.warn('[Stripe Webhook] Endpoint desativado — migração para Asaas concluída. Remova este webhook no dashboard do Stripe.');
  return json({ received: true });
}
