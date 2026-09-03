import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest({ auth = 'Bearer token' } = {}) {
  return { headers: { get: (name) => (name.toLowerCase() === 'authorization' ? auth : null) } };
}

const owner = { isSubUser: false, ownerUserId: 'owner-1', roleId: null, permissions: null };

function mockCommon({ accessContext, overrides = {} } = {}) {
  vi.doMock('$lib/server/accessControl', () => ({ getServerAccessContext: vi.fn(async () => accessContext) }));
  vi.doMock('$lib/server/rateLimit', () => ({ buildRateLimitKey: (...p) => p.join(':'), enforceRateLimit: () => ({ ok: true }), createRateLimitResponse: vi.fn() }));
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) }, from: vi.fn() } }));
  const listSessions = vi.fn(async () => [{ id: 'sess-1', title: 'Conversa', channel: 'app', status: 'closed', created_at: '2026-09-02T10:00:00Z', last_message_at: '2026-09-02T10:05:00Z' }]);
  const closeOpenSession = vi.fn(async () => ({ closed: true }));
  const loadSessionMessages = vi.fn(async (_db, { sessionId }) => (sessionId === 'sess-1'
    ? { found: true, messages: [{ role: 'user', content: 'oi', created_at: '2026-09-02T10:00:00Z' }] }
    : { found: false, messages: [] }));
  vi.doMock('$lib/server/gerente/sessions', () => ({ listSessions, closeOpenSession, loadSessionMessages, ...overrides }));
  return { listSessions, closeOpenSession, loadSessionMessages };
}

describe('API: gerente/sessions', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('bloqueia subusuário com 403', async () => {
    mockCommon({ accessContext: { isSubUser: true, ownerUserId: 'owner-1', roleId: 'r', permissions: { 'relatorios.ver': true } } });
    const { GET } = await import('../src/routes/api/gerente/sessions/+server.js');
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Por enquanto, só o dono da empresa conversa com o Zelinho Gerente.' });
  });

  it('devolve 401 sem token', async () => {
    mockCommon({ accessContext: owner });
    const { GET } = await import('../src/routes/api/gerente/sessions/+server.js');
    const response = await GET({ request: makeRequest({ auth: null }) });
    expect(response.status).toBe(401);
  });

  it('lista as conversas do dono', async () => {
    const mocks = mockCommon({ accessContext: owner });
    const { GET } = await import('../src/routes/api/gerente/sessions/+server.js');
    const response = await GET({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessions: [{ id: 'sess-1', title: 'Conversa', channel: 'app', status: 'closed', created_at: '2026-09-02T10:00:00Z', last_message_at: '2026-09-02T10:05:00Z' }] });
    expect(mocks.listSessions).toHaveBeenCalledWith(expect.anything(), { ownerUserId: 'owner-1' });
  });

  it('POST fecha a conversa aberta do canal app e devolve ok/closed', async () => {
    const mocks = mockCommon({ accessContext: owner });
    const { POST } = await import('../src/routes/api/gerente/sessions/+server.js');
    const response = await POST({ request: makeRequest() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, closed: true });
    expect(mocks.closeOpenSession).toHaveBeenCalledWith(expect.anything(), { ownerUserId: 'owner-1', channel: 'app' });
  });
});

describe('API: gerente/sessions/[id]', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('bloqueia subusuário com 403', async () => {
    mockCommon({ accessContext: { isSubUser: true, ownerUserId: 'owner-1', roleId: 'r', permissions: { 'relatorios.ver': true } } });
    const { GET } = await import('../src/routes/api/gerente/sessions/[id]/+server.js');
    const response = await GET({ request: makeRequest(), params: { id: 'sess-1' } });
    expect(response.status).toBe(403);
  });

  it('devolve as mensagens da conversa do dono', async () => {
    mockCommon({ accessContext: owner });
    const { GET } = await import('../src/routes/api/gerente/sessions/[id]/+server.js');
    const response = await GET({ request: makeRequest(), params: { id: 'sess-1' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: [{ role: 'user', content: 'oi', created_at: '2026-09-02T10:00:00Z' }] });
  });

  it('404 para conversa de outro dono', async () => {
    mockCommon({ accessContext: owner });
    const { GET } = await import('../src/routes/api/gerente/sessions/[id]/+server.js');
    const response = await GET({ request: makeRequest(), params: { id: 'not-mine' } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Conversa não encontrada.' });
  });
});
