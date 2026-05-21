import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/pix/create/+server.js');

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => ({
      data: Array.isArray(result) ? result[0] ?? null : result ?? null,
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data: Array.isArray(result) ? result[0] ?? null : result ?? null,
      error: null,
    })),
  };

  return chain;
}

function makeSupabaseAdmin(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user ?? { id: 'owner-1', email: 'owner@test.com' } },
        error: state.authError ?? null,
      })),
    },
    from: vi.fn((table) => {
      const selectResult = state.selectResults?.[table] ?? null;

      return {
        select: vi.fn(() => makeSelectChain(selectResult)),
        insert: vi.fn((payload) => {
          state.writes.push({ table, operation: 'insert', payload });
          return {
            data: payload,
            error: null,
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: Array.isArray(payload) ? payload[0] ?? null : payload,
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({
                data: Array.isArray(payload) ? payload[0] ?? null : payload,
                error: null,
              })),
            })),
          };
        }),
        update: vi.fn((payload) => ({
          eq: vi.fn(async () => {
            state.writes.push({ table, operation: 'update', payload });
            return { error: null };
          }),
        })),
        upsert: vi.fn(async (payload) => {
          state.writes.push({ table, operation: 'upsert', payload });
          return { data: payload, error: null };
        }),
      };
    }),
  };
}

function makeAccessControl(state) {
  return {
    getServerAccessContext: vi.fn(async () => state.accessContext ?? {
      isSubUser: false,
      ownerUserId: state.user?.id ?? 'owner-1',
      roleId: null,
      permissions: null,
    }),
    resolveOwnerUserId: vi.fn(async () => state.accessContext?.ownerUserId ?? state.user?.id ?? 'owner-1'),
  };
}

function makeRequest({ token = 'token', body = {} } = {}) {
  return {
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'authorization') {
          return token ? `Bearer ${token}` : null;
        }
        if (name.toLowerCase() === 'content-type') {
          return 'application/json';
        }
        return null;
      },
    },
    json: async () => body,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('ABACATEPAY_API_KEY', 'abc_dev_test_key');
});

describe('API: billing/pix/create', () => {
  it('401 sem token', async () => {
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin({ writes: [], selectResults: {} }),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl({}));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: vi.fn(),
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: makeRequest({ token: null }),
      url: new URL('https://zelopdv.com.br/assinatura'),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/autorizado/i);
  });

  it('403 para subusuario ativo', async () => {
    const state = {
      user: { id: 'sub-1', email: 'sub@test.com' },
      writes: [],
      selectResults: {},
      accessContext: {
        isSubUser: true,
        ownerUserId: 'owner-1',
        roleId: 'role-gerente',
        permissions: {},
      },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: vi.fn(),
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: makeRequest({ body: { planTier: 'pdv' } }),
      url: new URL('https://zelopdv.com.br/assinatura'),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/subusu|titular/i);
  });

  it('400 para perfil sem documento', async () => {
    const state = {
      user: { id: 'owner-1', email: 'owner@test.com' },
      writes: [],
      selectResults: {
        empresa_perfil: { nome_exibicao: 'Loja Teste', documento: null, contato: '11999999999' },
        subscriptions: null,
      },
      accessContext: {
        isSubUser: false,
        ownerUserId: 'owner-1',
        roleId: null,
        permissions: null,
      },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: vi.fn(),
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: makeRequest({ body: { planTier: 'pdv' } }),
      url: new URL('https://zelopdv.com.br/assinatura'),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cpf|cnpj|documento|perfil/i);
  });

  it('200 com persistencia pending e retorno de QR/brCode', async () => {
    const state = {
      user: { id: 'owner-1', email: 'owner@test.com' },
      writes: [],
      selectResults: {
        empresa_perfil: { nome_exibicao: 'Loja Teste', documento: '12345678900', contato: '11999999999' },
        subscriptions: null,
      },
      accessContext: {
        isSubUser: false,
        ownerUserId: 'owner-1',
        roleId: null,
        permissions: null,
      },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: vi.fn(async () => ({
        id: 'pix_charge_123',
        status: 'PENDING',
        brCode: '00020101021226850014br.gov.bcb.pix2563pix.test/abc123520400005303986540510.005802BR5920Zelo PDV Teste6009Sao Paulo62070503***6304ABCD',
        brCodeBase64: 'data:image/png;base64,abc123',
        expiresAt: '2026-05-21T18:00:00.000Z',
      })),
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: makeRequest({
        body: {
          planTier: 'pdv',
          billingType: 'pix',
        },
      }),
      url: new URL('https://zelopdv.com.br/assinatura'),
    });
    const body = await res.json();

    const qrCode =
      body.qrCode ??
      body.qr_code ??
      body.qrCodeBase64 ??
      body.pix?.qrCode ??
      body.charge?.qrCode ??
      body.data?.qrCode ??
      body.data?.encodedImage;
    const brCode =
      body.brCode ??
      body.br_code ??
      body.copyPaste ??
      body.pix?.brCode ??
      body.charge?.brCode ??
      body.data?.brCode ??
      body.data?.payload;
    const pendingWrite = state.writes.find(({ payload }) => {
      const candidate = Array.isArray(payload) ? payload[0] : payload;
      return candidate?.status === 'pending';
    });

    expect(res.status).toBe(200);
    expect(pendingWrite).toBeTruthy();
    expect(qrCode).toBeTruthy();
    expect(brCode).toBeTruthy();
  });
});
