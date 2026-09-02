/**
 * @file Lógica do canal WhatsApp do Zelinho Gerente: resolve telefone → owner,
 * cuida do pareamento e encaminha para o núcleo. O ZeloChat só transporta.
 */
import { normalizeBrazilianPhone } from '../../masks.js';
import { isSubscriptionActiveStrict } from '../../subscriptionStatus.js';
import { completePairing, resolveOwnerByPhone } from './phoneLinks.js';
import { DEFAULT_MODEL, cancelPendingAction, confirmPendingAction, runAgentTurn } from './agent.js';
import { getPendingActionForSession } from './actions.js';
import { getOrCreateSession } from './sessions.js';

export const PAIRING_INSTRUCTIONS = 'Oi! Eu sou o Zelinho Gerente do ZeloPDV. Para conversar comigo, abra o ZeloPDV em Gestão > Zelinho Gerente > Preferências, toque em "Conectar no WhatsApp" e me mande o código de 6 dígitos.';
export const PAIRED_REPLY = (nome) => `Pronto! Este WhatsApp está conectado à ${nome}. Pode me pedir coisas como "pausa o refri no cardápio" ou "como foi ontem?".`;
export const INVALID_CODE_REPLY = 'Esse código não é válido ou já expirou. Gere um novo no ZeloPDV e me mande de novo.';
export const INACTIVE_REPLY = 'A assinatura desta empresa não está ativa. Regularize no ZeloPDV para voltar a falar comigo.';
export const YES_WORDS = /^(sim|s|ok|confirmar|confirma|confirmo|pode|isso)[.!]?$/i;
export const NO_WORDS = /^(n[aã]o|n|cancelar|cancela|deixa|para)[.!]?$/i;

function respond(reply, { pendingAction = null, paired = false } = {}) {
  return { reply, pending_action: pendingAction, paired };
}

async function isOwnerSubscriptionActive(db, ownerUserId, now) {
  const { data, error } = await db
    .from('subscriptions')
    .select('status, current_period_end, manually_extended_until, updated_at')
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return isSubscriptionActiveStrict(data?.[0], now);
}

async function companyName(db, ownerUserId) {
  const { data } = await db.from('empresa_perfil').select('nome_exibicao').eq('user_id', ownerUserId).maybeSingle();
  return data?.nome_exibicao?.trim() || 'sua empresa';
}

export async function handleChannelMessage({ db, openai, model = DEFAULT_MODEL, phone, text = '', kind = 'message', actionId = null, now = new Date() }) {
  const phoneNormalized = normalizeBrazilianPhone(phone);
  if (!phoneNormalized) return respond(PAIRING_INSTRUCTIONS);
  const cleanText = String(text || '').trim();

  const ownerUserId = await resolveOwnerByPhone(db, phoneNormalized);
  if (!ownerUserId) {
    if (kind === 'message' && /^\d{6}$/.test(cleanText)) {
      const pairing = await completePairing(db, { phoneNormalized, code: cleanText, now });
      if (!pairing.ok) return respond(INVALID_CODE_REPLY);
      return respond(PAIRED_REPLY(await companyName(db, pairing.ownerUserId)), { paired: true });
    }
    return respond(PAIRING_INSTRUCTIONS);
  }

  if (!(await isOwnerSubscriptionActive(db, ownerUserId, now))) return respond(INACTIVE_REPLY, { paired: true });

  const common = { db, ownerUserId, actorUserId: ownerUserId, now };
  if (kind === 'confirm' && actionId) return respond((await confirmPendingAction({ ...common, actionId })).reply, { paired: true });
  if (kind === 'cancel' && actionId) return respond((await cancelPendingAction({ db, ownerUserId, actionId })).reply, { paired: true });

  if (YES_WORDS.test(cleanText) || NO_WORDS.test(cleanText)) {
    const session = await getOrCreateSession(db, { ownerUserId, channel: 'whatsapp', channelRef: phoneNormalized });
    const pending = await getPendingActionForSession(db, { sessionId: session.id, ownerUserId, now });
    if (pending) {
      const outcome = YES_WORDS.test(cleanText)
        ? await confirmPendingAction({ ...common, actionId: pending.id })
        : await cancelPendingAction({ db, ownerUserId, actionId: pending.id });
      return respond(outcome.reply, { paired: true });
    }
  }

  const turn = await runAgentTurn({ ...common, openai, model, channel: 'whatsapp', channelRef: phoneNormalized, message: cleanText || 'oi' });
  return respond(turn.reply, { pendingAction: turn.pendingAction, paired: true });
}
