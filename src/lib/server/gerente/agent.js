/**
 * @file Núcleo do Zelinho Gerente: um turno de conversa com function calling.
 * Leitura executa na hora; escrita vira ação pendente. Confirmação, cancelamento
 * e desfazer respondem com texto determinístico (sem LLM).
 */
import { appendMessages, getOrCreateSession, loadHistory } from './sessions.js';
import { NO_WORDS, YES_WORDS } from './confirmWords.js';
import { appendOptionsAsText, extractQuickReplies } from './quickReplies.js';

export { NO_WORDS, YES_WORDS };
import { cancelAction, confirmAction, createPendingAction, getPendingActionForSession, undoAction } from './actions.js';
import { executeTool, getOpenAiTools, getTool, summarizeAction, summarizeEffect } from './toolRegistry.js';
import { buildAgentSystemPrompt } from './prompt.js';
import { localDateOf } from '../intelligence/tz.js';

export const DEFAULT_MODEL = 'gpt-4.1-mini';
export const MODEL_COSTS_USD_PER_M = {
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
};
const FALLBACK_REPLY = 'Não consegui concluir dessa vez. Pode me pedir de outro jeito?';
const EMPTY_REPLY = 'Não entendi bem. Pode explicar de outro jeito?';
const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

function parseArgs(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function costUsd(model, usage) {
  const rate = MODEL_COSTS_USD_PER_M[model] || MODEL_COSTS_USD_PER_M[DEFAULT_MODEL];
  const cost = (usage.prompt_tokens / 1_000_000) * rate.input + (usage.completion_tokens / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function logAgentUsage(db, { actorUserId, model, usage }) {
  const { error } = await db.from('ai_usage_logs').insert({
    user_id: actorUserId,
    chat_type: 'gerente_agent',
    model,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    cost_usd: usage.cost_usd,
  });
  if (error) console.warn('[gerente/agent] ai_usage_logs:', error.message);
}

async function loadPerfil(db, ownerUserId) {
  const { data } = await db.from('empresa_perfil').select('nome_exibicao').eq('user_id', ownerUserId).maybeSingle();
  return data || {};
}

export async function runAgentTurn({ db, openai, ownerUserId, actorUserId, channel, channelRef = null, message, hints = [], model = DEFAULT_MODEL, now = new Date(), maxToolRounds = 4 }) {
  const perfil = await loadPerfil(db, ownerUserId);
  const session = await getOrCreateSession(db, { ownerUserId, channel, channelRef });
  const history = await loadHistory(db, session.id, 30);
  const today = localDateOf(now.toISOString());
  const systemPrompt = buildAgentSystemPrompt({ perfil, channel, hints, today });
  const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }];
  const ctx = { db, ownerUserId, now };
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolsUsed = [];
  const ambiguous = { produtos: null, categorias: null };
  let pendingAction = null;
  let reply = null;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: getOpenAiTools(),
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 600,
    });
    if (response.usage) {
      usage.prompt_tokens += response.usage.prompt_tokens || 0;
      usage.completion_tokens += response.usage.completion_tokens || 0;
      usage.total_tokens += response.usage.total_tokens || 0;
    }
    const assistant = response.choices?.[0]?.message;
    if (!assistant) break;
    const toolCalls = assistant.tool_calls || [];
    if (toolCalls.length === 0) {
      reply = typeof assistant.content === 'string' ? assistant.content.trim() : '';
      break;
    }

    messages.push({ role: 'assistant', content: assistant.content ?? null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      toolsUsed.push(name);
      let result;
      const tool = getTool(name);
      if (tool?.write) {
        if (!pendingAction) {
          const summary = summarizeAction(name, args);
          const created = await createPendingAction(db, { ownerUserId, sessionId: session.id, actorUserId, channel, toolName: name, args, summary, now });
          pendingAction = { ...created, effect: summarizeEffect(name, args) };
          result = { status: 'aguardando_confirmacao', resumo: pendingAction.summary, acao_id: pendingAction.id };
        } else {
          result = { status: 'nao_preparado', motivo: 'Só uma mudança por vez. A ação anterior já está aguardando confirmação; prepare a próxima depois que o dono confirmar.' };
        }
      } else {
        result = await executeTool(ctx, name, args);
        if (name === 'buscar_produto' && result?.ok && Array.isArray(result.data?.produtos) && result.data.produtos.length >= 2) {
          ambiguous.produtos = result.data.produtos.map((p) => p.nome);
        }
        if (name === 'listar_categorias' && result?.ok && Array.isArray(result.data?.categorias)) {
          ambiguous.categorias = result.data.categorias.map((c) => c.nome);
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  if (reply === null) reply = FALLBACK_REPLY;
  // O modelo pode terminar com "[[opcoes: A | B]]"; isso vira pills, não texto.
  const extracted = extractQuickReplies(reply);
  reply = extracted.reply;
  if (!reply) reply = EMPTY_REPLY;

  await appendMessages(db, {
    sessionId: session.id,
    ownerUserId,
    messages: [
      { role: 'user', content: message },
      { role: 'assistant', content: reply, tool_calls: toolsUsed.length ? toolsUsed.map((name) => ({ name })) : null },
    ],
  });

  const usageWithCost = { ...usage, cost_usd: costUsd(model, usage) };
  await logAgentUsage(db, { actorUserId, model, usage: usageWithCost });

  // Com ação pendente o cartão de confirmação é a única resposta esperada.
  // Sem pendente, valem as opções que o modelo sugeriu; se ele não sugeriu,
  // caem os fallbacks determinísticos, e só quando a resposta é uma pergunta.
  const asksQuestion = typeof reply === 'string' && reply.includes('?');
  let quickReplies = [];
  if (pendingAction) quickReplies = [];
  else if (extracted.options.length) quickReplies = extracted.options;
  else if (asksQuestion && ambiguous.produtos) quickReplies = [...ambiguous.produtos.slice(0, 5), 'Nenhum desses'];
  else if (asksQuestion && ambiguous.categorias && /categoria/i.test(reply)) quickReplies = [...ambiguous.categorias.slice(0, 5), 'Criar categoria nova'];
  if (channel === 'whatsapp') reply = appendOptionsAsText(reply, quickReplies);

  return { reply, pendingAction, toolsUsed, usage: usageWithCost, sessionId: session.id, quickReplies };
}

export function describeExecutedAction(action, result = {}) {
  const nome = result?.nome ?? result?.nome_produto ?? '';
  switch (action.tool_name) {
    case 'pausar_no_cardapio':
      return result.pausado_manualmente
        ? `Feito: pausei "${nome}" no cardápio digital. Ele continua no PDV. Para voltar, me peça "despausa ${nome}".`
        : `Feito: "${nome}" voltou para o cardápio digital.`;
    case 'pausar_no_cardapio_undo':
      return result.pausado_manualmente
        ? `Desfeito: "${nome}" voltou a ficar pausado no cardápio digital.`
        : `Desfeito: "${nome}" voltou para o cardápio digital.`;
    case 'ocultar_no_pdv':
      return result.ocultar_no_pdv
        ? `Feito: ocultei "${nome}" no PDV. O cardápio digital não muda.`
        : `Feito: "${nome}" voltou a aparecer no PDV.`;
    case 'ocultar_no_pdv_undo':
      return result.ocultar_no_pdv
        ? `Desfeito: "${nome}" voltou a ficar oculto no PDV.`
        : `Desfeito: "${nome}" voltou a aparecer no PDV.`;
    case 'criar_categoria':
      return result.created === false
        ? `A categoria "${result.nome}" já existia, então reaproveitei.`
        : `Feito: criei a categoria "${result.nome}".`;
    case 'criar_produto':
      return `Feito: cadastrei "${result.nome}" por ${brl(result.preco)} em "${result.categoria_nome}". Ele já aparece no PDV.`;
    case 'alterar_preco':
      return `Feito: "${nome}" passou de ${brl(result.preco_anterior)} para ${brl(result.preco)}.`;
    default:
      return 'Feito.';
  }
}

const CONFIRM_ERRORS = {
  NOT_FOUND: 'Não encontrei essa ação. Me peça de novo.',
  NOT_PENDING: 'Essa ação já foi tratada antes.',
  EXPIRED: 'Essa confirmação expirou. Me peça de novo e eu preparo outra vez.',
};

export async function confirmPendingAction({ db, ownerUserId, actorUserId, actionId, now = new Date() }) {
  const ctx = { db, ownerUserId, now };
  const outcome = await confirmAction(db, { actionId, ownerUserId, now, executeTool: (name, args) => executeTool(ctx, name, args) });
  if (!outcome.ok) {
    if (outcome.code === 'FAILED') return { ok: false, reply: outcome.error };
    return { ok: false, reply: CONFIRM_ERRORS[outcome.code] || 'Não consegui confirmar agora.' };
  }
  return { ok: true, reply: describeExecutedAction(outcome.action, outcome.result) };
}

/**
 * Resolve "sim"/"não" digitados quando há ação pendente na sessão, sem passar
 * pelo modelo. Devolve null quando não há o que resolver (o turno segue normal).
 */
export async function resolveTextConfirmation({ db, ownerUserId, actorUserId, channel, channelRef = null, message, now = new Date() }) {
  const text = String(message || '').trim();
  const yes = YES_WORDS.test(text);
  if (!yes && !NO_WORDS.test(text)) return null;
  const session = await getOrCreateSession(db, { ownerUserId, channel, channelRef });
  const pending = await getPendingActionForSession(db, { sessionId: session.id, ownerUserId, now });
  if (!pending) return null;
  const outcome = yes
    ? await confirmPendingAction({ db, ownerUserId, actorUserId, actionId: pending.id, now })
    : await cancelPendingAction({ db, ownerUserId, actionId: pending.id });
  const status = yes ? (outcome.ok ? 'executed' : 'failed') : (outcome.ok ? 'cancelled' : 'failed');
  return { reply: outcome.reply, action: { id: pending.id, status } };
}

export async function cancelPendingAction({ db, ownerUserId, actionId }) {
  const outcome = await cancelAction(db, { actionId, ownerUserId });
  if (!outcome.ok) return { ok: false, reply: CONFIRM_ERRORS[outcome.code] || 'Não consegui cancelar agora.' };
  return { ok: true, reply: 'Cancelado. Nada foi alterado.' };
}

export async function undoExecutedAction({ db, ownerUserId, actorUserId, actionId, channel, now = new Date() }) {
  const ctx = { db, ownerUserId, now };
  const outcome = await undoAction(db, { actionId, ownerUserId, actorUserId, channel, now, executeTool: (name, args) => executeTool(ctx, name, args) });
  if (!outcome.ok) {
    if (outcome.code === 'FAILED') return { ok: false, reply: outcome.error };
    if (outcome.code === 'NOT_UNDOABLE') return { ok: false, reply: 'Essa ação não pode ser desfeita automaticamente.' };
    return { ok: false, reply: 'Não encontrei essa ação.' };
  }
  return { ok: true, reply: describeExecutedAction(outcome.action, outcome.result) };
}
