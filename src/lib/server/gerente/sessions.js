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
    .eq('channel', channel)
    .eq('status', 'open');
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

  const update = { last_message_at: new Date().toISOString() };
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim(),
  );
  if (firstUserMessage) {
    const current = await db.from('gerente_agent_sessions').select('title').eq('id', sessionId).maybeSingle();
    throwIfError(current.error);
    if (!current.data?.title) {
      update.title = String(firstUserMessage.content).replace(/\s+/g, ' ').trim().slice(0, 60);
    }
  }

  const updated = await db.from('gerente_agent_sessions').update(update).eq('id', sessionId);
  throwIfError(updated.error);
}

/**
 * Fecha a conversa aberta de um canal, transformando-a em histórico. Não fecha
 * conversas sem nenhuma mensagem, para não encher o histórico de entradas vazias.
 * @param {{ ownerUserId: string, channel: 'app'|'whatsapp', channelRef?: string|null }} input
 * @returns {Promise<{ closed: boolean }>}
 */
export async function closeOpenSession(db, { ownerUserId, channel, channelRef = null }) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  let query = db
    .from('gerente_agent_sessions')
    .select('id, last_message_at')
    .eq('owner_user_id', ownerUserId)
    .eq('channel', channel)
    .eq('status', 'open');
  query = channelRef == null ? query.is('channel_ref', null) : query.eq('channel_ref', channelRef);
  const existing = await query.maybeSingle();
  throwIfError(existing.error);
  if (!existing.data?.id || !existing.data.last_message_at) return { closed: false };

  const updated = await db
    .from('gerente_agent_sessions')
    .update({ status: 'closed' })
    .eq('id', existing.data.id);
  throwIfError(updated.error);
  return { closed: true };
}

/**
 * Lista as conversas do dono que já têm pelo menos uma mensagem, mais recentes
 * primeiro. Título nulo vira 'Conversa'.
 * @param {{ ownerUserId: string, limit?: number }} input
 * @returns {Promise<Array<{ id: string, title: string, channel: string, status: string, created_at: string, last_message_at: string }>>}
 */
export async function listSessions(db, { ownerUserId, limit = 20 }) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  const { data, error } = await db
    .from('gerente_agent_sessions')
    .select('id, title, channel, status, created_at, last_message_at')
    .eq('owner_user_id', ownerUserId)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  throwIfError(error);
  return (data || [])
    .filter((row) => row.last_message_at)
    .map((row) => ({ ...row, title: row.title || 'Conversa' }));
}

/**
 * Mensagens de uma conversa, só se ela pertencer ao dono. Só role user/assistant
 * com conteúdo, em ordem cronológica.
 * @param {{ sessionId: string, ownerUserId: string, limit?: number }} input
 * @returns {Promise<{ found: boolean, messages: Array<{ role: 'user'|'assistant', content: string, created_at: string }> }>}
 */
export async function loadSessionMessages(db, { sessionId, ownerUserId, limit = 100 }) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  const session = await db
    .from('gerente_agent_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  throwIfError(session.error);
  if (!session.data?.id) return { found: false, messages: [] };

  const { data, error } = await db
    .from('gerente_agent_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  throwIfError(error);
  const messages = (data || [])
    .filter((row) => (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string' && row.content.trim())
    .map((row) => ({ role: row.role, content: row.content, created_at: row.created_at }));
  return { found: true, messages };
}
