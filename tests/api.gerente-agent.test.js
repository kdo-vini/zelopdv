import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/gerente/agent/+server.js');

function makeRequest(body, { auth = 'Bearer token' } = {}) {
  return {
    headers: { get: (name) => (name.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
  };
}

async function readSse(response) {
  const text = await response.text();
  return text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6));
}

function mockCommon({ accessContext, agent = {} }) {
  vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'k', GERENTE_AGENT_ENABLED: 'true' } }));
  vi.doMock('openai', () => ({ default: class { constructor() { this.chat = { completions: { create: vi.fn() } }; } } }));
  vi.doMock('$lib/server/accessControl', () => ({ getServerAccessContext: vi.fn(async () => accessContext) }));
  vi.doMock('$lib/server/rateLimit', () => ({ buildRateLimitKey: (...p) => p.join(':'), enforceRateLimit: () => ({ ok: true }), createRateLimitResponse: vi.fn() }));
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) }, from: vi.fn() } }));
  vi.doMock('$lib/server/intelligence/signalContext', () => ({
    getSignalContextForOwner: vi.fn(async (id, owner) => (id === 'sig-1' && owner === 'owner-1' ? { id: 'sig-1', type: 'STOCK_ZERO_WITH_DEMAND' } : null)),
    buildSignalContextPrompt: vi.fn(() => 'PROMPT DO SINAL'),
  }));
  const runAgentTurn = vi.fn(async () => ({ reply: 'Olá!', pendingAction: null, toolsUsed: [], usage: {}, sessionId: 's' }));
  const confirmPendingAction = vi.fn(async () => ({ ok: true, reply: 'Feito.' }));
  const cancelPendingAction = vi.fn(async () => ({ ok: true, reply: 'Cancelado. Nada foi alterado.' }));
  const undoExecutedAction = vi.fn(async () => ({ ok: true, reply: 'Desfeito.' }));
  vi.doMock('$lib/server/gerente/agent', () => ({ runAgentTurn, confirmPendingAction, cancelPendingAction, undoExecutedAction, DEFAULT_MODEL: 'gpt-4.1-mini', ...agent }));
  return { runAgentTurn, confirmPendingAction, cancelPendingAction, undoExecutedAction };
}

const owner = { isSubUser: false, ownerUserId: 'owner-1', roleId: null, permissions: null };

describe('API: gerente/agent', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('bloqueia subusuário com 403 antes de qualquer trabalho', async () => {
    const mocks = mockCommon({ accessContext: { isSubUser: true, ownerUserId: 'owner-1', roleId: 'r', permissions: { 'relatorios.ver': true } } });
    const { POST } = await loadHandler();
    const response = await POST({ request: makeRequest({ message: 'oi' }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Por enquanto, só o dono da empresa conversa com o Zelinho Gerente.' });
    expect(mocks.runAgentTurn).not.toHaveBeenCalled();
  });

  it('responde SSE com conteúdo e ação pendente', async () => {
    const mocks = mockCommon({ accessContext: owner });
    mocks.runAgentTurn.mockResolvedValueOnce({ reply: 'Confirma?', pendingAction: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', effect: 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.', expires_at: '2026-09-02T15:10:00Z' }, quickReplies: ['Sim', 'Não'], toolsUsed: ['pausar_no_cardapio'], usage: {}, sessionId: 's' });
    const { POST } = await loadHandler();
    const response = await POST({ request: makeRequest({ message: 'pausa o refri' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const frames = await readSse(response);
    expect(JSON.parse(frames[0])).toEqual({ content: 'Confirma?' });
    expect(JSON.parse(frames[1])).toEqual({ type: 'pending_action', action: { id: 'act-1', summary: 'Pausar "Refri" no cardápio digital', effect: 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.', expires_at: '2026-09-02T15:10:00Z' } });
    expect(JSON.parse(frames[2])).toEqual({ type: 'quick_replies', options: ['Sim', 'Não'] });
    expect(frames[3]).toBe('[DONE]');
    const call = mocks.runAgentTurn.mock.calls[0][0];
    expect(call).toMatchObject({ ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'pausa o refri', model: 'gpt-4.1-mini' });
  });

  it('injeta o contexto do sinal como hint e recusa sinal de outro tenant', async () => {
    const mocks = mockCommon({ accessContext: owner });
    const { POST } = await loadHandler();
    const ok = await POST({ request: makeRequest({ message: 'e esse aviso?', signal_id: 'sig-1' }) });
    expect(ok.status).toBe(200);
    expect(mocks.runAgentTurn.mock.calls[0][0].hints).toEqual(['PROMPT DO SINAL']);
    const denied = await POST({ request: makeRequest({ message: 'x', signal_id: 'sig-other' }) });
    expect(denied.status).toBe(403);
  });

  it('confirma, cancela e desfaz com resposta JSON', async () => {
    const mocks = mockCommon({ accessContext: owner });
    const { POST } = await loadHandler();
    const confirm = await POST({ request: makeRequest({ confirm_action_id: 'act-1' }) });
    expect(await confirm.json()).toEqual({ ok: true, reply: 'Feito.' });
    expect(mocks.confirmPendingAction).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'owner-1', actorUserId: 'owner-1', actionId: 'act-1' }));
    const cancel = await POST({ request: makeRequest({ cancel_action_id: 'act-1' }) });
    expect(await cancel.json()).toEqual({ ok: true, reply: 'Cancelado. Nada foi alterado.' });
    const undo = await POST({ request: makeRequest({ undo_action_id: 'act-1' }) });
    expect(await undo.json()).toEqual({ ok: true, reply: 'Desfeito.' });
    expect(mocks.undoExecutedAction).toHaveBeenCalledWith(expect.objectContaining({ channel: 'app' }));
  });

  it('rejeita corpo sem ação e mensagem longa', async () => {
    mockCommon({ accessContext: owner });
    const { POST } = await loadHandler();
    expect((await POST({ request: makeRequest({}) })).status).toBe(400);
    expect((await POST({ request: makeRequest({ message: 'x'.repeat(1501) }) })).status).toBe(400);
  });

  it('devolve 503 com o kill switch ligado', async () => {
    mockCommon({ accessContext: owner });
    vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'k', GERENTE_AGENT_ENABLED: 'false' } }));
    const { POST } = await loadHandler();
    const response = await POST({ request: makeRequest({ message: 'oi' }) });
    expect(response.status).toBe(503);
  });

  it('devolve 401 sem token', async () => {
    mockCommon({ accessContext: owner });
    const { POST } = await loadHandler();
    const response = await POST({ request: makeRequest({ message: 'oi' }, { auth: null }) });
    expect(response.status).toBe(401);
  });
});
