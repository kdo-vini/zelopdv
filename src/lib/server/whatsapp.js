/**
 * Server-side WhatsApp notification module for ZeloPDV.
 * Uses ZeloChat's internal WhatsApp POST API (fire-and-forget, no emoji).
 *
 * Messages:
 *  - enviarBoasVindas     : sent immediately on first account creation
 *  - enviarFollowup7d     : sent ~7 days after trial start
 *  - enviarFollowupFinal  : sent 1 day before the trial ends (day TRIAL_DAYS - 1)
 *
 * Os dias de disparo vivem em WHATSAPP_DAYS no cron de onboarding.
 */

import { env } from '$env/dynamic/private';
import { normalizeBrazilianPhone } from '$lib/masks';
import { TRIAL_DAYS } from '$lib/pricing';

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

function buildResult(ok, overrides = {}) {
  return {
    ok,
    status: null,
    body: null,
    error: null,
    ...overrides,
  };
}

function parseBody(body) {
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function resultErrorMessage(result) {
  if (result?.error) return result.error;
  const payload = parseBody(result?.body || '');
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof result?.body === 'string' && result.body.trim()) return result.body.trim();
  return 'WhatsApp sender returned false';
}

async function enviarDetalhado(telefone, mensagem) {
  const internalKey = getZeloChatInternalKey();
  if (!internalKey) {
    console.warn('[WhatsApp] ZELOCHAT_INTERNAL_API_KEY nao configurado, mensagem ignorada.');
    return buildResult(false, { error: 'ZELOCHAT_INTERNAL_API_KEY not configured' });
  }

  const destino = normalizeBrazilianPhone(telefone);
  if (!destino) {
    console.warn('[WhatsApp] Telefone invalido, ignorando:', telefone);
    return buildResult(false, { error: 'invalid phone' });
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
      return buildResult(false, {
        status: response.status,
        body,
        error: resultErrorMessage({ body }) || `HTTP ${response.status}`,
      });
    }

    const payload = parseBody(body);

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
      return buildResult(false, {
        status: response.status,
        body,
        error: resultErrorMessage({ body }),
      });
    }

    console.log(`[WhatsApp] Mensagem aceita pela API para ${destino}:`, body || response.status);
    return buildResult(true, { status: response.status, body });
  } catch (err) {
    console.error('[WhatsApp] Excecao ao enviar mensagem:', err?.message || err);
    return buildResult(false, { error: err?.message || String(err) });
  }
}

async function enviar(telefone, mensagem) {
  const result = await enviarDetalhado(telefone, mensagem);
  return result.ok;
}

export async function sendWhatsAppText(telefone, mensagem) {
  return enviar(telefone, mensagem);
}

export async function sendWhatsAppTextDetailed(telefone, mensagem) {
  return enviarDetalhado(telefone, mensagem);
}

/**
 * O `nomeUsuario` que chega aqui é `empresa_perfil.nome_exibicao`, ou seja o nome da
 * LOJA e não o de uma pessoa. O código antigo fazia `.split(' ')[0]` e tratava como
 * primeiro nome, então "Lanchonete do Zé" virava "Oi Lanchonete!". As mensagens agora
 * tratam o valor pelo que ele é, e caem numa saudação sem nome quando vier vazio.
 */
function nomeDaLoja(nomeExibicao) {
  return String(nomeExibicao || '').trim();
}

/**
 * Mensagem 1 — Boas-vindas (disparada na criacao da conta, trial day 0)
 */
export async function enviarBoasVindas(telefone, nomeUsuario) {
  const result = await enviarBoasVindasDetalhado(telefone, nomeUsuario);
  return result.ok;
}

export async function enviarBoasVindasDetalhado(telefone, nomeUsuario) {
  const loja = nomeDaLoja(nomeUsuario);
  // A oferta de configurar junto vem já no dia 0, de propósito: em ticket baixo o que
  // converte não é o tempo de trial, é alguém sentar do lado logo no começo.
  const mensagem =
    `Oi! Aqui é o Vinicius, do Zelo.\n\n` +
    (loja
      ? `Vi que a conta da ${loja} acabou de ser criada. `
      : `Vi que você acabou de criar sua conta. `) +
    `A parte chata de começar é sempre a mesma: cadastrar produto, montar categoria, ` +
    `acertar preço.\n\n` +
    `Se quiser, a gente faz isso junto com você. Uns 15 minutos por aqui mesmo, sem custo, ` +
    `e você já sai com tudo pronto pra usar no balcão.\n\n` +
    `Topa? Só me dizer um horário que funciona pra você. E se preferir ir sozinho mesmo, ` +
    `tranquilo, é só me chamar se travar em alguma coisa.`;
  return enviarDetalhado(telefone, mensagem);
}

/**
 * Mensagem 2 — Followup 7 dias (disparada pela cron ~dia 7 do trial)
 */
export async function enviarFollowup7d(telefone, nomeUsuario) {
  const result = await enviarFollowup7dDetalhado(telefone, nomeUsuario);
  return result.ok;
}

export async function enviarFollowup7dDetalhado(telefone, nomeUsuario) {
  const loja = nomeDaLoja(nomeUsuario);
  const mensagem =
    `Oi, tudo bem? Vinicius aqui do Zelo.\n\n` +
    (loja
      ? `Faz uma semana que a ${loja} começou a usar o sistema `
      : `Faz uma semana que você começou a usar o sistema `) +
    `e eu queria saber como está indo de verdade. Já deu pra cadastrar os produtos ` +
    `e rodar as primeiras vendas?\n\n` +
    `Se estiver travando em alguma coisa, me conta que eu te ajudo. E se estiver tudo ` +
    `certo, também quero saber, isso me ajuda a melhorar o sistema.`;
  return enviarDetalhado(telefone, mensagem);
}

/**
 * Mensagem 3 — Trial encerrando (disparada pela cron na véspera do fim do trial)
 */
export async function enviarFollowupFinal(telefone, nomeUsuario) {
  const result = await enviarFollowupFinalDetalhado(telefone, nomeUsuario);
  return result.ok;
}

export async function enviarFollowupFinalDetalhado(telefone, nomeUsuario) {
  const loja = nomeDaLoja(nomeUsuario);
  const mensagem =
    `Oi! Vinicius aqui. ` +
    (loja
      ? `Passando pra avisar que o teste da ${loja} termina amanhã.\n\n`
      : `Passando pra avisar que o seu teste termina amanhã.\n\n`) +
    `Queria te perguntar com sinceridade: nesses ${TRIAL_DAYS} dias o sistema deu conta ` +
    `do que você precisava? Se faltou alguma coisa ou ficou alguma dúvida, me fala antes ` +
    `de decidir, que ainda dá tempo de resolver.\n\n` +
    `Se quiser seguir com a gente, é só entrar em zelopdv.com.br e escolher como prefere ` +
    `pagar. Ia ser bom continuar te acompanhando por aqui.`;
  return enviarDetalhado(telefone, mensagem);
}

export function getWhatsAppSendError(result) {
  return resultErrorMessage(result);
}
