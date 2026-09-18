import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest({ auth = 'Bearer token', body = {} } = {}) {
  return {
    headers: { get: (name) => (name.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
  };
}

function mockAuth(accessContext) {
  vi.doMock('$lib/server/accessControl', () => ({ getServerAccessContext: vi.fn(async () => accessContext) }));
}

const owner = { isSubUser: false, ownerUserId: 'owner-1', roleId: null, permissions: null };

describe('API: gerente/semana/send-whatsapp', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('envia o resumo via ZeloChat para o telefone pareado', async () => {
    mockAuth(owner);
    const sendWhatsAppTextDetailed = vi.fn(async () => ({ ok: true }));
    const from = vi.fn((table) => {
      if (table === 'empresa_perfil') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { nome_exibicao: 'Lanchonete Teste', razao_social: null, contato: null }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    });
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) },
        from,
      },
    }));
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({
      getLink: vi.fn(async () => ({ phone_normalized: '5514999991234', verified_at: '2026-09-02T12:00:00Z' })),
      maskPhone: () => '(14) *****-1234',
    }));
    vi.doMock('$lib/server/whatsapp', () => ({
      sendWhatsAppTextDetailed,
      isWhatsAppConfigured: () => true,
      getWhatsAppSendError: () => 'erro',
    }));

    const { POST } = await import('../src/routes/api/gerente/semana/send-whatsapp/+server.js');
    const response = await POST({ request: makeRequest({ body: { semana: '2026-09-08' } }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, phone_masked: '(14) *****-1234' });
    expect(sendWhatsAppTextDetailed).toHaveBeenCalledWith('5514999991234', expect.stringContaining('Resumo semanal'));
    expect(sendWhatsAppTextDetailed.mock.calls[0][1]).toContain('Zelinho Gerente - Lanchonete Teste');
  });

  it('pede telefone quando não há vínculo nem contato', async () => {
    mockAuth(owner);
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } }, error: null })) },
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { nome_exibicao: 'Loja', contato: null }, error: null }),
            }),
          }),
        })),
      },
    }));
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({
      getLink: vi.fn(async () => null),
      maskPhone: vi.fn(),
    }));
    vi.doMock('$lib/server/whatsapp', () => ({
      sendWhatsAppTextDetailed: vi.fn(),
      isWhatsAppConfigured: () => true,
      getWhatsAppSendError: () => 'erro',
    }));

    const { POST } = await import('../src/routes/api/gerente/semana/send-whatsapp/+server.js');
    const response = await POST({ request: makeRequest() });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'NEED_PHONE' });
  });

  it('bloqueia subusuário', async () => {
    mockAuth({ isSubUser: true, ownerUserId: 'owner-1', roleId: 'r', permissions: {} });
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'sub-1' } }, error: null })) },
        from: vi.fn(),
      },
    }));
    vi.doMock('$lib/server/gerente/phoneLinks', () => ({ getLink: vi.fn(), maskPhone: vi.fn() }));
    vi.doMock('$lib/server/whatsapp', () => ({
      sendWhatsAppTextDetailed: vi.fn(),
      isWhatsAppConfigured: () => true,
      getWhatsAppSendError: () => 'erro',
    }));

    const { POST } = await import('../src/routes/api/gerente/semana/send-whatsapp/+server.js');
    expect((await POST({ request: makeRequest() })).status).toBe(403);
  });
});
