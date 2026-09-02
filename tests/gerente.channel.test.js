import { describe, expect, it, vi } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';

const now = new Date('2026-09-02T15:00:00Z');
const activeSub = { status: 'active', current_period_end: '2027-01-01T00:00:00Z', manually_extended_until: null, updated_at: '2026-09-01T00:00:00Z' };

async function load({ runAgentTurn, confirmPendingAction, cancelPendingAction, pending = null } = {}) {
  vi.resetModules();
  vi.doMock('../src/lib/server/gerente/agent.js', () => ({
    runAgentTurn: runAgentTurn || vi.fn(async () => ({ reply: 'Olá!', pendingAction: null })),
    confirmPendingAction: confirmPendingAction || vi.fn(async () => ({ ok: true, reply: 'Feito.' })),
    cancelPendingAction: cancelPendingAction || vi.fn(async () => ({ ok: true, reply: 'Cancelado. Nada foi alterado.' })),
    DEFAULT_MODEL: 'gpt-4.1-mini',
  }));
  vi.doMock('../src/lib/server/gerente/actions.js', () => ({ getPendingActionForSession: vi.fn(async () => pending) }));
  vi.doMock('../src/lib/server/gerente/sessions.js', () => ({ getOrCreateSession: vi.fn(async () => ({ id: 'sess-wa' })) }));
  return await import('../src/lib/server/gerente/channel.js');
}

describe('handleChannelMessage', () => {
  it('telefone desconhecido sem código recebe instruções de pareamento', async () => {
    const { handleChannelMessage, PAIRING_INSTRUCTIONS } = await load();
    const db = makeDb({ tables: { gerente_phone_links: [{ data: null, error: null }] } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '14999991234', text: 'oi', kind: 'message', now });
    expect(result).toEqual({ reply: PAIRING_INSTRUCTIONS, pending_action: null, paired: false });
  });

  it('telefone desconhecido com código válido é pareado', async () => {
    const { handleChannelMessage } = await load();
    const db = makeDb({ tables: {
      gerente_phone_links: [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }, { data: null, error: null }],
      gerente_pairing_codes: [{ data: { id: 'c1', owner_user_id: 'owner-1', expires_at: '2026-09-02T15:05:00Z' }, error: null }, { data: null, error: null }],
      empresa_perfil: [{ data: { nome_exibicao: 'Lanchonete do Zé' }, error: null }],
    } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '5514999991234', text: ' 123456 ', kind: 'message', now });
    expect(result.paired).toBe(true);
    expect(result.reply).toContain('conectado à Lanchonete do Zé');
  });

  it('código inválido responde a copy de código inválido', async () => {
    const { handleChannelMessage, INVALID_CODE_REPLY } = await load();
    const db = makeDb({ tables: { gerente_phone_links: [{ data: null, error: null }], gerente_pairing_codes: [{ data: null, error: null }] } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '5514999991234', text: '000000', kind: 'message', now });
    expect(result).toEqual({ reply: INVALID_CODE_REPLY, pending_action: null, paired: false });
  });

  it('telefone vinculado com assinatura inativa é bloqueado', async () => {
    const { handleChannelMessage, INACTIVE_REPLY } = await load();
    const db = makeDb({ tables: { gerente_phone_links: [{ data: { owner_user_id: 'owner-1' }, error: null }], subscriptions: [{ data: [{ ...activeSub, status: 'trial_expired' }], error: null }] } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '5514999991234', text: 'oi', kind: 'message', now });
    expect(result).toEqual({ reply: INACTIVE_REPLY, pending_action: null, paired: true });
  });

  it('telefone vinculado roda o agente no canal whatsapp', async () => {
    const runAgentTurn = vi.fn(async () => ({ reply: 'Confirma?', pendingAction: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', expires_at: 'x' } }));
    const { handleChannelMessage } = await load({ runAgentTurn });
    const db = makeDb({ tables: { gerente_phone_links: [{ data: { owner_user_id: 'owner-1' }, error: null }], subscriptions: [{ data: [activeSub], error: null }] } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '5514999991234', text: 'pausa o refri', kind: 'message', now });
    expect(runAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'whatsapp', channelRef: '5514999991234', message: 'pausa o refri' }));
    expect(result).toEqual({ reply: 'Confirma?', pending_action: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', expires_at: 'x' }, paired: true });
  });

  it('"sim" em texto confirma a pendente da sessão; "não" cancela; kind confirm usa action_id', async () => {
    const confirmPendingAction = vi.fn(async () => ({ ok: true, reply: 'Feito.' }));
    const cancelPendingAction = vi.fn(async () => ({ ok: true, reply: 'Cancelado. Nada foi alterado.' }));
    const { handleChannelMessage } = await load({ confirmPendingAction, cancelPendingAction, pending: { id: 'act-1' } });
    const tables = () => ({ gerente_phone_links: [{ data: { owner_user_id: 'owner-1' }, error: null }], subscriptions: [{ data: [activeSub], error: null }] });
    const yes = await handleChannelMessage({ db: makeDb({ tables: tables() }), openai: {}, phone: '5514999991234', text: 'Sim!', kind: 'message', now });
    expect(yes.reply).toBe('Feito.');
    expect(confirmPendingAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'act-1' }));
    const no = await handleChannelMessage({ db: makeDb({ tables: tables() }), openai: {}, phone: '5514999991234', text: 'não', kind: 'message', now });
    expect(no.reply).toBe('Cancelado. Nada foi alterado.');
    await handleChannelMessage({ db: makeDb({ tables: tables() }), openai: {}, phone: '5514999991234', kind: 'confirm', actionId: 'act-7', now });
    expect(confirmPendingAction).toHaveBeenLastCalledWith(expect.objectContaining({ actionId: 'act-7' }));
  });

  it('"sim" sem pendente vai para o agente normalmente', async () => {
    const runAgentTurn = vi.fn(async () => ({ reply: 'Sim o quê?', pendingAction: null }));
    const { handleChannelMessage } = await load({ runAgentTurn, pending: null });
    const db = makeDb({ tables: { gerente_phone_links: [{ data: { owner_user_id: 'owner-1' }, error: null }], subscriptions: [{ data: [activeSub], error: null }] } });
    const result = await handleChannelMessage({ db, openai: {}, phone: '5514999991234', text: 'sim', kind: 'message', now });
    expect(runAgentTurn).toHaveBeenCalled();
    expect(result.reply).toBe('Sim o quê?');
  });

  it('telefone inválido responde instruções sem consultar o banco', async () => {
    const { handleChannelMessage, PAIRING_INSTRUCTIONS } = await load();
    const db = makeDb();
    const result = await handleChannelMessage({ db, openai: {}, phone: '123', text: 'oi', kind: 'message', now });
    expect(result.reply).toBe(PAIRING_INSTRUCTIONS);
    expect(db.calls).toHaveLength(0);
  });
});
