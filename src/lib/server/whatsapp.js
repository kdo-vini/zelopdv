/**
 * Server-side WhatsApp notification module for ZeloPDV.
 * Uses ZeloChat's internal WhatsApp POST API (fire-and-forget, no emoji).
 *
 * Messages:
 *  - enviarBoasVindas   : sent immediately on first account creation
 *  - enviarFollowup7d  : sent ~7 days after trial start
 *  - enviarFollowup28d : sent ~28 days after trial start (trial ending soon)
 */

import { env } from '$env/dynamic/private';
import { normalizeBrazilianPhone } from '$lib/masks';

const DEFAULT_ZELOCHAT_SEND_URL = 'https://chat.zelopdv.com.br/internal/whatsapp/send-text';

function getZeloChatSendUrl() {
  const explicitUrl = (env.ZELOCHAT_INTERNAL_SEND_URL || env.ZELOCHAT_INTERNAL_API_URL || '').trim();
  if (explicitUrl) return explicitUrl;

  const baseUrl = (env.ZELOCHAT_API_BASE_URL || '').trim().replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/internal/whatsapp/send-text` : DEFAULT_ZELOCHAT_SEND_URL;
}

function getZeloChatInternalKey() {
  return (env.ZELOCHAT_INTERNAL_API_KEY || env.TECHNE_INTERNAL_API_KEY || '').trim();
}

/**
 * Core send function — shared by all message types.
 * @param {string} telefone - Recipient phone in format 5511999999999
 * @param {string} mensagem - Plain text message (no emoji)
 * @returns {Promise<boolean>} true if sent successfully
 */
export function isWhatsAppConfigured() {
  return !!getZeloChatInternalKey();
}

async function enviar(telefone, mensagem) {
  const internalKey = getZeloChatInternalKey();
  if (!internalKey) {
    console.warn('[WhatsApp] ZELOCHAT_INTERNAL_API_KEY nao configurado, mensagem ignorada.');
    return false;
  }

  const destino = normalizeBrazilianPhone(telefone);
  if (!destino) {
    console.warn('[WhatsApp] Telefone invalido, ignorando:', telefone);
    return false;
  }

  try {
    const response = await fetch(getZeloChatSendUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZeloChat-Internal-Key': internalKey,
      },
      body: JSON.stringify({ to: destino, message: mensagem }),
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`[WhatsApp] Erro ao enviar para ${destino}:`, body);
      return false;
    }

    let payload = null;
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      payload = null;
    }

    const explicitError =
      payload?.ok === false ||
      payload?.error ||
      payload?.erro ||
      payload?.success === false ||
      String(payload?.status || '').toLowerCase() === 'error';
    const textError =
      !payload && /\b(erro|error|invalid|invalido|inválido|falha)\b/i.test(body || '');

    if (explicitError || textError) {
      console.error(`[WhatsApp] API retornou erro para ${destino}:`, body);
      return false;
    }

    console.log(`[WhatsApp] Mensagem aceita pela API para ${destino}:`, body || response.status);
    return true;
  } catch (err) {
    console.error('[WhatsApp] Excecao ao enviar mensagem:', err?.message || err);
    return false;
  }
}

/**
 * Mensagem 1 — Boas-vindas (disparada na criacao da conta, trial day 0)
 */
export async function enviarBoasVindas(telefone, nomeUsuario) {
  const nome = (nomeUsuario || 'você').split(' ')[0];
  const mensagem =
    `Oi ${nome}! Vi que você acabou de criar sua conta no ZeloPDV. ` +
    `Que ótimo ter você por aqui! Se tiver qualquer dúvida na hora de configurar, ` +
    `é só me chamar aqui no WhatsApp — estou disponível para ajudar. ` +
    `Boa sorte com os primeiros pedidos! — Vinicius, Fundador do ZeloPDV`;
  return enviar(telefone, mensagem);
}

/**
 * Mensagem 2 — Followup 7 dias (disparada pela cron ~dia 7 do trial)
 */
export async function enviarFollowup7d(telefone, nomeUsuario) {
  const nome = (nomeUsuario || 'você').split(' ')[0];
  const mensagem =
    `Oi ${nome}, tudo bem? Faz uma semana que você criou sua conta no ZeloPDV ` +
    `e queria passar pra saber como está sendo a experiência. ` +
    `Já conseguiu configurar o cardápio e fazer seu primeiro pedido? ` +
    `Se tiver alguma dúvida ou dificuldade, pode falar comigo à vontade. ` +
    `Estou aqui pra ajudar no que precisar. — Vinicius, ZeloPDV`;
  return enviar(telefone, mensagem);
}

/**
 * Mensagem 3 — Followup 28 dias / trial encerrando (disparada pela cron ~dia 28)
 */
export async function enviarFollowup28d(telefone, nomeUsuario) {
  const nome = (nomeUsuario || 'você').split(' ')[0];
  const mensagem =
    `Oi ${nome}! O seu período de teste no ZeloPDV está chegando ao fim em breve. ` +
    `Queria saber como foi a experiência nesses 30 dias — o sistema atendeu o que você precisava? ` +
    `Se tiver qualquer dúvida antes de decidir continuar, é só me chamar. ` +
    `Para manter o acesso, basta entrar em zelopdv.com.br e escolher a forma de pagamento. ` +
    `Será um prazer continuar com você! — Vinicius, ZeloPDV`;
  return enviar(telefone, mensagem);
}
