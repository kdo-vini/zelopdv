import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { appendMessages, getOrCreateSession, loadHistory } from '../src/lib/server/gerente/sessions.js';

describe('gerente agent sessions', () => {
  it('reutiliza a sessão existente do owner no canal', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: { id: 'sess-1' }, error: null }] } });
    const session = await getOrCreateSession(db, { ownerUserId: 'owner-1', channel: 'app' });
    expect(session).toEqual({ id: 'sess-1' });
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'owner_user_id', value: 'owner-1' },
      { op: 'eq', field: 'channel', value: 'app' },
    ]));
    expect(db.calls).toHaveLength(1);
  });

  it('cria a sessão quando não existe, com channel_ref do WhatsApp', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [
      { data: null, error: null },
      { data: { id: 'sess-2' }, error: null },
    ] } });
    const session = await getOrCreateSession(db, { ownerUserId: 'owner-1', channel: 'whatsapp', channelRef: '5514999990000' });
    expect(session).toEqual({ id: 'sess-2' });
    expect(db.calls[1].op).toBe('insert');
    expect(db.calls[1].payload).toEqual({ owner_user_id: 'owner-1', channel: 'whatsapp', channel_ref: '5514999990000' });
  });

  it('carrega histórico em ordem cronológica só com user/assistant preenchidos', async () => {
    const db = makeDb({ tables: { gerente_agent_messages: [{ data: [
      { role: 'assistant', content: 'Pausei.', created_at: '2026-09-02T12:01:00Z' },
      { role: 'tool', content: '{"ok":true}', created_at: '2026-09-02T12:00:30Z' },
      { role: 'user', content: 'pausa o refri', created_at: '2026-09-02T12:00:00Z' },
      { role: 'assistant', content: '', created_at: '2026-09-02T11:59:00Z' },
    ], error: null }] } });
    const history = await loadHistory(db, 'sess-1', 30);
    expect(history).toEqual([
      { role: 'user', content: 'pausa o refri' },
      { role: 'assistant', content: 'Pausei.' },
    ]);
    expect(db.calls[0].filters).toEqual([{ op: 'eq', field: 'session_id', value: 'sess-1' }]);
  });

  it('grava mensagens com owner e atualiza last_message_at', async () => {
    const db = makeDb();
    await appendMessages(db, { sessionId: 'sess-1', ownerUserId: 'owner-1', messages: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá', tool_calls: [{ name: 'buscar_produto' }] },
    ] });
    expect(db.calls[0].table).toBe('gerente_agent_messages');
    expect(db.calls[0].payload).toEqual([
      { session_id: 'sess-1', owner_user_id: 'owner-1', role: 'user', content: 'oi', tool_calls: null, tool_call_id: null },
      { session_id: 'sess-1', owner_user_id: 'owner-1', role: 'assistant', content: 'olá', tool_calls: [{ name: 'buscar_produto' }], tool_call_id: null },
    ]);
    // Antes do update vem um select do título: a primeira mensagem do dono batiza a conversa.
    const update = db.calls.find((call) => call.table === 'gerente_agent_sessions' && call.op === 'update');
    expect(update).toBeTruthy();
    expect(typeof update.payload.last_message_at).toBe('string');
    expect(update.payload.title).toBe('oi');
  });

  it('propaga erro do banco', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: { message: 'boom' } }] } });
    await expect(getOrCreateSession(db, { ownerUserId: 'owner-1', channel: 'app' })).rejects.toThrow('boom');
  });
});
