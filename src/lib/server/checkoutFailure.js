// Falha de checkout: o funil precisa enxergar quem tentou pagar e não conseguiu.
//
// Até 2026-09-14 só existia o lado feliz (`stripe_checkout_created`,
// `pix_charge_created`). Clique que morria no servidor — perfil sem CPF/CNPJ,
// plano inválido, provedor fora do ar — sumia sem deixar rastro, e o buraco
// entre "abriu a tela de assinatura" e "cobrança criada" ficava sem explicação.
//
// A resposta de erro e o evento saem da MESMA função de propósito. Espalhar
// `posthog.capture` por dez `return json(...)` é como o bug anterior nasceu:
// instrumentação que alguém esquece de somar num caminho novo e ninguém vê
// faltando, porque falta em silêncio.
import { json } from '@sveltejs/kit';
import { waitUntil } from '@vercel/functions';
import { getPostHogClient } from './posthog';

// Códigos estáveis. NÃO derivar de mensagem em pt-BR: o texto é de UI, muda com
// revisão de copy, e levaria o histórico do funil junto.
export const CHECKOUT_FAILURE_REASONS = Object.freeze({
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  UNAUTHENTICATED: 'unauthenticated',
  SUBUSER_FORBIDDEN: 'subuser_forbidden',
  INVALID_PLAN: 'invalid_plan',
  ADDON_NOT_ALLOWED: 'addon_not_allowed',
  PROFILE_INCOMPLETE: 'profile_incomplete',
  PROFILE_READ_FAILED: 'profile_read_failed',
  PROVIDER_ERROR: 'provider_error',
});

/**
 * Registra a falha sem segurar a resposta. Numa falha de pagamento o cliente
 * está esperando na tela; ele não paga o custo de um flush de analytics.
 */
function captureCheckoutFailure(properties, distinctId) {
  const pending = Promise.resolve().then(async () => {
    const posthog = getPostHogClient();
    if (!posthog) return;
    posthog.capture({
      // Sem sessão válida não há a quem atribuir. O evento ainda conta —
      // "expirou antes de assinar" é conversão perdida — mas cai num balde
      // anônimo, mesma convenção do chat de suporte.
      distinctId: distinctId || 'anonymous',
      event: 'checkout_failed',
      properties,
    });
    await posthog.flush();
  }).catch((err) => {
    console.warn('[checkout-failed] analytics indisponível:', err?.message || err);
  });

  try {
    waitUntil(pending);
  } catch {
    // Fora do runtime da Vercel (teste, dev) não existe waitUntil; o flush
    // segue solto. Nunca deixar isso derrubar a resposta de erro.
  }
}

/**
 * Resposta de erro de checkout que sempre registra `checkout_failed`.
 *
 * @param {object} params
 * @param {'card'|'pix'} params.paymentMethod
 * @param {string} params.reason Um de CHECKOUT_FAILURE_REASONS.
 * @param {string} params.error Mensagem para o cliente.
 * @param {number} [params.status] HTTP status. Default 400.
 * @param {string} [params.userId] Ausente quando a falha é de autenticação.
 * @param {string} [params.planTier] Ausente quando falha antes de ler o body.
 * @param {object} [params.addons]
 * @param {object} [params.body] Campos extras da resposta, ex. `redirect`.
 * @returns {Response}
 */
export function checkoutFailed({
  paymentMethod,
  reason,
  error,
  status = 400,
  userId,
  planTier,
  addons,
  body,
}) {
  captureCheckoutFailure({
    payment_method: paymentMethod,
    reason,
    status_code: status,
    // Separa "o servidor recusou" de "o pedido nunca chegou" (ver assinatura/+page.svelte).
    origin: 'server',
    ...(planTier ? { plan: planTier } : {}),
    ...(addons ? { addons } : {}),
  }, userId);

  return json({ error, ...body }, { status });
}
