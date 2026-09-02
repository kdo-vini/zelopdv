/**
 * @file Ações do Zelinho Gerente: proposta pendente → confirmação → execução.
 * O executor da ferramenta é injetado para manter este módulo testável sem RPC.
 */

export const ACTION_TTL_MS = 10 * 60 * 1000;

/** Ferramentas reversíveis: devolvem os argumentos que restauram o before_state. */
export const UNDOABLE_TOOLS = {
  pausar_no_cardapio: (args, before) => ({ ...args, pausado: before?.pausado_manualmente === true }),
  ocultar_no_pdv: (args, before) => ({ ...args, ocultar: before?.ocultar_no_pdv === true }),
};

const ACTION_COLUMNS = 'id, owner_user_id, session_id, channel, tool_name, arguments, summary, status, before_state, after_state, result, error, expires_at, created_at, executed_at';

function throwIfError(error) {
  if (error) throw new Error(error.message || String(error));
}

async function loadAction(db, actionId, ownerUserId) {
  const { data, error } = await db
    .from('gerente_agent_actions')
    .select(ACTION_COLUMNS)
    .eq('id', actionId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  throwIfError(error);
  return data || null;
}

async function patchAction(db, actionId, patch) {
  const { error } = await db.from('gerente_agent_actions').update(patch).eq('id', actionId);
  throwIfError(error);
}

export async function createPendingAction(db, { ownerUserId, sessionId, actorUserId = null, channel, toolName, args, summary, now = new Date() }) {
  const cancelled = await db
    .from('gerente_agent_actions')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'pending');
  throwIfError(cancelled.error);

  const inserted = await db
    .from('gerente_agent_actions')
    .insert({
      owner_user_id: ownerUserId,
      session_id: sessionId,
      actor_user_id: actorUserId,
      channel,
      tool_name: toolName,
      arguments: args ?? {},
      summary,
      status: 'pending',
      expires_at: new Date(now.getTime() + ACTION_TTL_MS).toISOString(),
    })
    .select('id, summary, expires_at')
    .single();
  throwIfError(inserted.error);
  return { id: inserted.data.id, summary: inserted.data.summary, expires_at: inserted.data.expires_at };
}

export async function getPendingActionForSession(db, { sessionId, ownerUserId, now = new Date() }) {
  const { data, error } = await db
    .from('gerente_agent_actions')
    .select(ACTION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'pending')
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= now.getTime()) return null;
  return data;
}

export async function confirmAction(db, { actionId, ownerUserId, executeTool, now = new Date() }) {
  const action = await loadAction(db, actionId, ownerUserId);
  if (!action) return { ok: false, code: 'NOT_FOUND' };
  if (action.status !== 'pending') return { ok: false, code: 'NOT_PENDING', action };
  if (new Date(action.expires_at).getTime() <= now.getTime()) {
    await patchAction(db, actionId, { status: 'expired' });
    return { ok: false, code: 'EXPIRED', action };
  }

  const result = await executeTool(action.tool_name, action.arguments || {});
  if (!result?.ok) {
    const message = result?.error || 'Não foi possível executar a ação.';
    await patchAction(db, actionId, { status: 'failed', error: message, executed_at: now.toISOString() });
    return { ok: false, code: 'FAILED', error: message, action };
  }

  await patchAction(db, actionId, {
    status: 'executed',
    before_state: result.before ?? null,
    after_state: result.after ?? null,
    result: result.data ?? null,
    executed_at: now.toISOString(),
  });
  return { ok: true, action: { ...action, status: 'executed', before_state: result.before ?? null, after_state: result.after ?? null }, result: result.data ?? null };
}

export async function cancelAction(db, { actionId, ownerUserId }) {
  const action = await loadAction(db, actionId, ownerUserId);
  if (!action) return { ok: false, code: 'NOT_FOUND' };
  if (action.status !== 'pending') return { ok: false, code: 'NOT_PENDING' };
  await patchAction(db, actionId, { status: 'cancelled' });
  return { ok: true };
}

export async function undoAction(db, { actionId, ownerUserId, executeTool, actorUserId = null, channel, now = new Date() }) {
  const action = await loadAction(db, actionId, ownerUserId);
  if (!action) return { ok: false, code: 'NOT_FOUND' };
  const inverse = UNDOABLE_TOOLS[action.tool_name];
  if (!inverse || action.status !== 'executed' || !action.before_state) return { ok: false, code: 'NOT_UNDOABLE' };

  const inverseArgs = inverse(action.arguments || {}, action.before_state);
  const result = await executeTool(action.tool_name, inverseArgs);
  if (!result?.ok) return { ok: false, code: 'FAILED', error: result?.error || 'Não foi possível desfazer.' };

  const inserted = await db
    .from('gerente_agent_actions')
    .insert({
      owner_user_id: ownerUserId,
      session_id: action.session_id,
      actor_user_id: actorUserId,
      channel: channel || action.channel,
      tool_name: `${action.tool_name}_undo`,
      arguments: inverseArgs,
      summary: `Desfazer: ${action.summary}`,
      status: 'executed',
      before_state: result.before ?? null,
      after_state: result.after ?? null,
      result: result.data ?? null,
      // expires_at é NOT NULL; só linhas 'pending' são checadas quanto a expiração, então aqui é apenas preenchimento, não um prazo real.
      expires_at: now.toISOString(),
      executed_at: now.toISOString(),
    })
    .select('id')
    .single();
  throwIfError(inserted.error);
  return { ok: true, action: { id: inserted.data.id, tool_name: `${action.tool_name}_undo` }, result: result.data ?? null };
}
