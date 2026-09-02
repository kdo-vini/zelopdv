import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest({ auth = 'Bearer token' } = {}) {
  return { headers: { get: (name) => (name.toLowerCase() === 'authorization' ? auth : null) }, json: async () => ({}) };
}

function mockAuth(accessContext) {
  vi.doMock('$env/dynamic/private', () => ({ env: { GERENTE_WHATSAPP_NUMBER: '+55 14 90000-0000' } }));
  vi.doMock('$lib/server/accessControl', () => ({ getServerAccessContext: vi.fn(async () => accessContext) }));
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) }, from: vi.fn() } }));
}

const owner = { isSubUser: false, ownerUserId: 'owner-1', roleId: null, permissions: null };

describe('API: gerente/pair', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('GET devolve o vínculo mascarado', async () => {
    mockAuth(owner);
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({
      getLink: vi.fn(async () => ({ phone_normalized: '5514999991234', verified_at: '2026-09-02T12:00:00Z' })),
      maskPhone: () => '(14) *****-1234',
      unlinkPhone: vi.fn(),
      startPairing: vi.fn(),
    }));
    const { GET } = await import('../src/routes/api/gerente/pair/+server.js');
    const response = await GET({ request: makeRequest() });
    expect(await response.json()).toEqual({ linked: true, phone_masked: '(14) *****-1234', verified_at: '2026-09-02T12:00:00Z', whatsapp_number: '+55 14 90000-0000' });
  });

  it('DELETE desvincula', async () => {
    mockAuth(owner);
    const unlinkPhone = vi.fn(async () => {});
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({ getLink: vi.fn(), maskPhone: vi.fn(), unlinkPhone, startPairing: vi.fn() }));
    const { DELETE } = await import('../src/routes/api/gerente/pair/+server.js');
    const response = await DELETE({ request: makeRequest() });
    expect(await response.json()).toEqual({ ok: true });
    expect(unlinkPhone).toHaveBeenCalledWith(expect.anything(), 'owner-1');
  });

  it('POST start devolve código e número', async () => {
    mockAuth(owner);
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({ startPairing: vi.fn(async () => ({ code: '123456', expiresAt: '2026-09-02T12:10:00Z' })), getLink: vi.fn(), maskPhone: vi.fn(), unlinkPhone: vi.fn() }));
    const { POST } = await import('../src/routes/api/gerente/pair/start/+server.js');
    const response = await POST({ request: makeRequest() });
    expect(await response.json()).toEqual({ code: '123456', expires_at: '2026-09-02T12:10:00Z', whatsapp_number: '+55 14 90000-0000' });
  });

  it('subusuário recebe 403 nas três rotas', async () => {
    mockAuth({ isSubUser: true, ownerUserId: 'owner-1', roleId: 'r', permissions: {} });
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({ startPairing: vi.fn(), getLink: vi.fn(), maskPhone: vi.fn(), unlinkPhone: vi.fn() }));
    const pair = await import('../src/routes/api/gerente/pair/+server.js');
    const start = await import('../src/routes/api/gerente/pair/start/+server.js');
    expect((await pair.GET({ request: makeRequest() })).status).toBe(403);
    expect((await pair.DELETE({ request: makeRequest() })).status).toBe(403);
    expect((await start.POST({ request: makeRequest() })).status).toBe(403);
  });
});
