import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { closeOpenSession, listSessions, loadSessionMessages } from '../src/lib/server/gerente/sessions.js';

const now = new Date('2026-09-02T12:00:00Z');

describe('closeOpenSession', () => {
  it('não faz nada quando não há sessão aberta', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: null }] } });
    const result = await closeOpenSession(db, { ownerUserId: 'owner-1', channel: 'app' });
    expect(result).toEqual({ closed: false });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'owner_user_id', value: 'owner-1' },
      { op: 'eq', field: 'channel', value: 'app' },
      { op: 'eq', field: 'status', value: 'open' },
    ]));
  });

  it('não fecha uma sessão aberta sem nenhuma mensagem', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: { id: 'sess-1', last_message_at: null }, error: null }] } });
    const result = await closeOpenSession(db, { ownerUserId: 'owner-1', channel: 'app' });
    expect(result).toEqual({ closed: false });
    expect(db.calls).toHaveLength(1);
  });

  it('fecha a sessão aberta que já tem mensagens', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [
      { data: { id: 'sess-1', last_message_at: now.toISOString() }, error: null },
      { data: null, error: null },
    ] } });
    const result = await closeOpenSession(db, { ownerUserId: 'owner-1', channel: 'app' });
    expect(result).toEqual({ closed: true });
    expect(db.calls[1].op).toBe('update');
    expect(db.calls[1].payload).toEqual({ status: 'closed' });
    expect(db.calls[1].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id', value: 'sess-1' }]));
  });

  it('propaga erro do banco', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: { message: 'boom' } }] } });
    await expect(closeOpenSession(db, { ownerUserId: 'owner-1', channel: 'app' })).rejects.toThrow('boom');
  });
});

describe('listSessions', () => {
  it('devolve só as conversas com mensagem, título padrão quando nulo', async () => {
    const rows = [
      { id: 'a', title: 'Pergunta sobre estoque', channel: 'app', status: 'open', created_at: '2026-09-02T09:00:00Z', last_message_at: '2026-09-02T10:00:00Z' },
      { id: 'b', title: null, channel: 'whatsapp', status: 'closed', created_at: '2026-09-01T09:00:00Z', last_message_at: '2026-09-01T10:00:00Z' },
      { id: 'c', title: 'Sem mensagem ainda', channel: 'app', status: 'open', created_at: '2026-09-02T08:00:00Z', last_message_at: null },
    ];
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: rows, error: null }] } });
    const result = await listSessions(db, { ownerUserId: 'owner-1' });
    expect(result).toEqual([
      { id: 'a', title: 'Pergunta sobre estoque', channel: 'app', status: 'open', created_at: '2026-09-02T09:00:00Z', last_message_at: '2026-09-02T10:00:00Z' },
      { id: 'b', title: 'Conversa', channel: 'whatsapp', status: 'closed', created_at: '2026-09-01T09:00:00Z', last_message_at: '2026-09-01T10:00:00Z' },
    ]);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'owner_user_id', value: 'owner-1' }]));
  });

  it('devolve lista vazia quando não há linhas', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: [], error: null }] } });
    const result = await listSessions(db, { ownerUserId: 'owner-1' });
    expect(result).toEqual([]);
  });

  it('propaga erro do banco', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: { message: 'boom' } }] } });
    await expect(listSessions(db, { ownerUserId: 'owner-1' })).rejects.toThrow('boom');
  });
});

describe('loadSessionMessages', () => {
  it('found:false quando a sessão não é do dono', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: null }] } });
    const result = await loadSessionMessages(db, { sessionId: 'sess-1', ownerUserId: 'owner-1' });
    expect(result).toEqual({ found: false, messages: [] });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'id', value: 'sess-1' },
      { op: 'eq', field: 'owner_user_id', value: 'owner-1' },
    ]));
  });

  it('devolve as mensagens em ordem, só user/assistant com conteúdo', async () => {
    const db = makeDb({ tables: {
      gerente_agent_sessions: [{ data: { id: 'sess-1' }, error: null }],
      gerente_agent_messages: [{ data: [
        { role: 'user', content: 'pausa o refri', created_at: '2026-09-02T12:00:00Z' },
        { role: 'tool', content: '{"ok":true}', created_at: '2026-09-02T12:00:10Z' },
        { role: 'assistant', content: 'Pausei.', created_at: '2026-09-02T12:00:20Z' },
        { role: 'assistant', content: '', created_at: '2026-09-02T12:00:30Z' },
      ], error: null }],
    } });
    const result = await loadSessionMessages(db, { sessionId: 'sess-1', ownerUserId: 'owner-1' });
    expect(result).toEqual({ found: true, messages: [
      { role: 'user', content: 'pausa o refri', created_at: '2026-09-02T12:00:00Z' },
      { role: 'assistant', content: 'Pausei.', created_at: '2026-09-02T12:00:20Z' },
    ] });
  });

  it('propaga erro do banco', async () => {
    const db = makeDb({ tables: { gerente_agent_sessions: [{ data: null, error: { message: 'boom' } }] } });
    await expect(loadSessionMessages(db, { sessionId: 'sess-1', ownerUserId: 'owner-1' })).rejects.toThrow('boom');
  });
});
