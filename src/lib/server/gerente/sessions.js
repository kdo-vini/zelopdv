// src/lib/server/gerente/sessions.js
/**
 * @file Sessões e histórico do Zelinho Gerente. Só I/O, sem regra de negócio.
 * Todas as funções recebem o client (supabaseAdmin) e o owner explicitamente.
 */

function throwIfError(error) {
  if (error) throw new Error(error.message || String(error));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ ownerUserId: string, channel: 'app'|'whatsapp', channelRef?: string|null }} input
 * @returns {Promise<{ id: string }>}
 */
export async function getOrCreateSession(db, { ownerUserId, channel, channelRef = null }) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  let query = db
    .from('gerente_agent_sessions')
    .select('id')
    .eq('owner_user_id', ownerUserId)
    .eq('channel', channel);
  query = channelRef == null ? query.is('channel_ref', null) : query.eq('channel_ref', channelRef);
  const existing = await query.maybeSingle();
  throwIfError(existing.error);
  if (existing.data?.id) return { id: existing.data.id };

  const inserted = await db
    .from('gerente_agent_sessions')
    .insert({ owner_user_id: ownerUserId, channel, channel_ref: channelRef })
    .select('id')
    .single();
  throwIfError(inserted.error);
  return { id: inserted.data.id };
}

/**
 * Histórico para o modelo: só user/assistant com conteúdo. Tool rounds ficam
 * gravados para auditoria mas não são reenviados (evita pares tool_call/tool
 * quebrados após truncamento).
 * @returns {Promise<Array<{ role: 'user'|'assistant', content: string }>>}
 */
export async function loadHistory(db, sessionId, limit = 30) {
  const { data, error } = await db
    .from('gerente_agent_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  throwIfError(error);
  return (data || [])
    .filter((row) => (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string' && row.content.trim())
    .reverse()
    .map((row) => ({ role: row.role, content: row.content }));
}

/**
 * @param {{ sessionId: string, ownerUserId: string, messages: Array<{ role: string, content?: string|null, tool_calls?: any, tool_call_id?: string|null }> }} input
 */
export async function appendMessages(db, { sessionId, ownerUserId, messages }) {
  if (!messages?.length) return;
  const rows = messages.map((message) => ({
    session_id: sessionId,
    owner_user_id: ownerUserId,
    role: message.role,
    content: message.content ?? null,
    tool_calls: message.tool_calls ?? null,
    tool_call_id: message.tool_call_id ?? null,
  }));
  const inserted = await db.from('gerente_agent_messages').insert(rows);
  throwIfError(inserted.error);
  const updated = await db
    .from('gerente_agent_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', sessionId);
  throwIfError(updated.error);
}
