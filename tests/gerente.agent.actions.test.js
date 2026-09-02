import { describe, expect, it, vi } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { ACTION_TTL_MS, cancelAction, confirmAction, createPendingAction, getPendingActionForSession, undoAction } from '../src/lib/server/gerente/actions.js';

const now = new Date('2026-09-02T12:00:00Z');
const future = new Date(now.getTime() + 60_000).toISOString();
const past = new Date(now.getTime() - 60_000).toISOString();

function pendingRow(overrides = {}) {
  return {
    id: 'act-1', owner_user_id: 'owner-1', session_id: 'sess-1', channel: 'app', tool_name: 'pausar_no_cardapio',
    arguments: { produto_id: 7, nome_produto: 'Refri 2L', pausado: true }, summary: 'Pausar "Refri 2L" no cardápio',
    status: 'pending', expires_at: future, before_state: null, after_state: null, ...overrides,
  };
}

describe('gerente agent actions', () => {
  it('cancela pendentes anteriores da sessão e cria a nova com validade de 10 minutos', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [
      { data: null, error: null },
      { data: { id: 'act-2', summary: 'Pausar "Refri 2L" no cardápio', expires_at: new Date(now.getTime() + ACTION_TTL_MS).toISOString() }, error: null },
    ] } });
    const action = await createPendingAction(db, { ownerUserId: 'owner-1', sessionId: 'sess-1', actorUserId: 'owner-1', channel: 'app', toolName: 'pausar_no_cardapio', args: { produto_id: 7, pausado: true }, summary: 'Pausar "Refri 2L" no cardápio', now });
    expect(db.calls[0].op).toBe('update');
    expect(db.calls[0].payload).toEqual({ status: 'cancelled' });
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'session_id', value: 'sess-1' }, { op: 'eq', field: 'status', value: 'pending' }]));
    expect(db.calls[1].payload).toMatchObject({ owner_user_id: 'owner-1', session_id: 'sess-1', tool_name: 'pausar_no_cardapio', status: 'pending', expires_at: new Date(now.getTime() + ACTION_TTL_MS).toISOString() });
    expect(action.id).toBe('act-2');
  });

  it('executa a ferramenta na confirmação e grava before/after', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: pendingRow(), error: null }, { data: null, error: null }] } });
    const executeTool = vi.fn(async () => ({ ok: true, data: { nome: 'Refri 2L', pausado_manualmente: true }, before: { pausado_manualmente: false }, after: { pausado_manualmente: true } }));
    const result = await confirmAction(db, { actionId: 'act-1', ownerUserId: 'owner-1', executeTool, now });
    expect(executeTool).toHaveBeenCalledWith('pausar_no_cardapio', { produto_id: 7, nome_produto: 'Refri 2L', pausado: true });
    expect(result.ok).toBe(true);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id', value: 'act-1' }, { op: 'eq', field: 'owner_user_id', value: 'owner-1' }]));
    expect(db.calls[1].payload).toMatchObject({ status: 'executed', before_state: { pausado_manualmente: false }, after_state: { pausado_manualmente: true } });
  });

  it('marca falha quando a ferramenta devolve erro', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: pendingRow(), error: null }, { data: null, error: null }] } });
    const executeTool = vi.fn(async () => ({ ok: false, error: 'Esse produto não está publicado no cardápio.' }));
    const result = await confirmAction(db, { actionId: 'act-1', ownerUserId: 'owner-1', executeTool, now });
    expect(result).toMatchObject({ ok: false, code: 'FAILED', error: 'Esse produto não está publicado no cardápio.' });
    expect(db.calls[1].payload).toMatchObject({ status: 'failed', error: 'Esse produto não está publicado no cardápio.' });
  });

  it('expira ação vencida sem executar', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: pendingRow({ expires_at: past }), error: null }, { data: null, error: null }] } });
    const executeTool = vi.fn();
    const result = await confirmAction(db, { actionId: 'act-1', ownerUserId: 'owner-1', executeTool, now });
    expect(result).toMatchObject({ ok: false, code: 'EXPIRED' });
    expect(executeTool).not.toHaveBeenCalled();
    expect(db.calls[1].payload).toEqual({ status: 'expired' });
  });

  it('recusa ação de outro owner como NOT_FOUND', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: null, error: null }] } });
    const result = await confirmAction(db, { actionId: 'act-1', ownerUserId: 'owner-2', executeTool: vi.fn(), now });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('cancela só pendentes do owner', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: pendingRow(), error: null }, { data: null, error: null }] } });
    const result = await cancelAction(db, { actionId: 'act-1', ownerUserId: 'owner-1' });
    expect(result).toEqual({ ok: true });
    expect(db.calls[1].payload).toEqual({ status: 'cancelled' });
  });

  it('devolve a pendente viva da sessão', async () => {
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: pendingRow(), error: null }] } });
    const action = await getPendingActionForSession(db, { sessionId: 'sess-1', ownerUserId: 'owner-1', now });
    expect(action?.id).toBe('act-1');
  });

  it('desfaz pausa aplicando o before_state e registra nova ação', async () => {
    const executed = pendingRow({ status: 'executed', before_state: { pausado_manualmente: false }, after_state: { pausado_manualmente: true } });
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: executed, error: null }, { data: { id: 'act-9' }, error: null }] } });
    const executeTool = vi.fn(async () => ({ ok: true, data: { nome: 'Refri 2L', pausado_manualmente: false }, before: { pausado_manualmente: true }, after: { pausado_manualmente: false } }));
    const result = await undoAction(db, { actionId: 'act-1', ownerUserId: 'owner-1', executeTool, actorUserId: 'owner-1', channel: 'app' });
    expect(executeTool).toHaveBeenCalledWith('pausar_no_cardapio', { produto_id: 7, nome_produto: 'Refri 2L', pausado: false });
    expect(result.ok).toBe(true);
    expect(db.calls[1].payload).toMatchObject({ tool_name: 'pausar_no_cardapio_undo', status: 'executed' });
  });

  it('não desfaz ferramentas fora da lista', async () => {
    const executed = pendingRow({ status: 'executed', tool_name: 'criar_produto', before_state: null });
    const db = makeDb({ tables: { gerente_agent_actions: [{ data: executed, error: null }] } });
    const result = await undoAction(db, { actionId: 'act-1', ownerUserId: 'owner-1', executeTool: vi.fn(), actorUserId: 'owner-1', channel: 'app' });
    expect(result).toEqual({ ok: false, code: 'NOT_UNDOABLE' });
  });
});
