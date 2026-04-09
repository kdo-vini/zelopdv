/**
 * Server-side WhatsApp notification module for ZeloPDV.
 * Uses the Techneia WhatsApp QR Code API (fire-and-forget, no emoji).
 *
 * Messages:
 *  - enviarBoasVindas   : sent immediately on first account creation
 *  - enviarFollowup7d  : sent ~7 days after trial start
 *  - enviarFollowup28d : sent ~28 days after trial start (trial ending soon)
 */

import { env } from '$env/dynamic/private';

const WHATSAPP_TOKEN = env.WHATSAPP_TOKEN;
const TELEFONE_REMETENTE = env.WHATSAPP_TELEFONE_REMETENTE;
const API_BASE = 'http://app.techneia.com.br/external_api/mensagens/whatsapp_qr_code/enviar';

/**
 * Core send function — shared by all message types.
 * @param {string} telefone - Recipient phone in format 5511999999999
 * @param {string} mensagem - Plain text message (no emoji)
 * @returns {Promise<boolean>} true if sent successfully
 */
async function enviar(telefone, mensagem) {
  if (!WHATSAPP_TOKEN || !TELEFONE_REMETENTE) {
    console.warn('[WhatsApp] WHATSAPP_TOKEN ou WHATSAPP_TELEFONE_REMETENTE nao configurado, mensagem ignorada.');
    return false;
  }

  // Normalize: strip non-digits, ensure country code 55
  const digits = telefone.replace(/\D/g, '');
  if (!digits || digits.length < 10) {
    console.warn('[WhatsApp] Telefone invalido, ignorando:', telefone);
    return false;
  }
  const destino = digits.startsWith('55') ? digits : `55${digits}`;

  try {
    const url = new URL(API_BASE);
    url.searchParams.set('telefone_remetente', TELEFONE_REMETENTE);
    url.searchParams.set('telefone_destinatario', destino);
    url.searchParams.set('conteudo_mensagem', mensagem);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[WhatsApp] Erro ao enviar para ${destino}:`, body);
      return false;
    }

    console.log(`[WhatsApp] Mensagem enviada com sucesso para ${destino}`);
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
