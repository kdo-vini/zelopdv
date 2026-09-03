import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { buildSignalContextPrompt, getSignalContextForOwner } from '$lib/server/intelligence/signalContext';
import { DEFAULT_MODEL, cancelPendingAction, confirmPendingAction, resolveTextConfirmation, runAgentTurn, undoExecutedAction } from '$lib/server/gerente/agent';

const MAX_MESSAGE_CHARS = 1500;

function sseResponse(frames) {
  const body = frames.map((frame) => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

function isEnabled() {
  return (env.GERENTE_AGENT_ENABLED || '').toLowerCase() !== 'false' && !!env.OPENAI_API_KEY;
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 64) : null;
}

export async function POST({ request }) {
  if (!isEnabled()) return json({ error: 'Zelinho Gerente indisponível.' }, { status: 503 });

  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { user, ownerUserId } = auth;

  const rateLimit = enforceRateLimit({
    key: buildRateLimitKey('gerente', 'agent', 'owner', ownerUserId),
    logKey: `gerente:agent:owner:${ownerUserId}`,
    route: '/api/gerente/agent',
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) return createRateLimitResponse(rateLimit, 'Muitas mensagens para o Zelinho. Tente de novo em uma hora.');

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const confirmId = cleanId(body?.confirm_action_id);
  const cancelId = cleanId(body?.cancel_action_id);
  const undoId = cleanId(body?.undo_action_id);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const db = supabaseAdmin;
  const common = { db, ownerUserId, actorUserId: user.id, now: new Date() };

  if (confirmId) return json(await confirmPendingAction({ ...common, actionId: confirmId }));
  if (cancelId) return json(await cancelPendingAction({ db, ownerUserId, actionId: cancelId }));
  if (undoId) return json(await undoExecutedAction({ ...common, actionId: undoId, channel: 'app' }));

  if (!message || message.length > MAX_MESSAGE_CHARS) return json({ error: 'Requisição inválida.' }, { status: 400 });

  // "sim"/"não" digitados com ação pendente resolvem direto, sem chamar o modelo.
  const resolved = await resolveTextConfirmation({ ...common, channel: 'app', channelRef: null, message });
  if (resolved) return sseResponse([{ content: resolved.reply }, { type: 'action_resolved', action: resolved.action }, '[DONE]']);

  const hints = [];
  if (body?.signal_id !== undefined && body?.signal_id !== null) {
    const signal = await getSignalContextForOwner(body.signal_id, ownerUserId, db);
    if (!signal) return json({ error: 'Aviso não encontrado.' }, { status: 403 });
    hints.push(buildSignalContextPrompt(signal));
  }
  if (body?.screen_context?.title && typeof body.screen_context.title === 'string') {
    hints.push(`O dono abriu a conversa a partir da tela "${body.screen_context.title.slice(0, 120)}".`);
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const result = await runAgentTurn({
      ...common,
      openai,
      channel: 'app',
      channelRef: null,
      message,
      hints,
      model: env.GERENTE_AGENT_MODEL || DEFAULT_MODEL,
    });
    const frames = [{ content: result.reply }];
    if (result.pendingAction) frames.push({ type: 'pending_action', action: result.pendingAction });
    if (Array.isArray(result.quickReplies) && result.quickReplies.length) frames.push({ type: 'quick_replies', options: result.quickReplies.slice(0, 6) });
    frames.push('[DONE]');
    return sseResponse(frames);
  } catch (error) {
    console.error('[gerente/agent] turn failed:', error?.message || error);
    return sseResponse([{ error: 'Erro ao falar com o Zelinho. Tente novamente.' }, '[DONE]']);
  }
}
