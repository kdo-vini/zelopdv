import { describe, expect, it, vi, beforeEach } from 'vitest';

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result ?? null, error: null })),
    single: vi.fn(async () => ({ data: result ?? null, error: null })),
  };
  return chain;
}

const DEFAULT_PAYMENT_ROW = {
  id: 'pay-1',
  status: 'pending',
  amount_expected_cents: 5900,
  br_code: '00020101-BRCODE-TEST',
  qr_code_base64: 'data:image/png;base64,test',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  provider_payment_id: 'pix_provider_1',
  plan_tier: 'pdv',
  has_mesas_addon: false,
  has_pedidos_addon: false,
  has_acessos_addon: false,
  has_zelo_menu: false,
};

function makeSupabaseAdmin(state) {
  const authUser = state.authUser || { id: 'admin-1', email: 'admin@test.com' };
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authUser }, error: null })),
    },
    from: vi.fn((table) => {
      const selectResult = state.selectResults?.[table] ?? null;
      const insertResult = state.insertResults?.[table] ?? DEFAULT_PAYMENT_ROW;
      return {
        select: vi.fn(() => makeSelectChain(selectResult)),
        insert: vi.fn((payload) => {
          state.writes?.push({ table, operation: 'insert', payload });
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: Array.isArray(payload) ? payload[0] : (insertResult ?? payload), error: null })),
            })),
          };
        }),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    }),
  };
}

function mockFetch(ok, responseBody) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  }));
}

describe('POST /api/admin/billing/pix/create', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('ABACATEPAY_API_KEY', 'abc_dev_test_key');
    global.fetch = mockFetch(true, { id: 'pix_1', status: 'PENDING' });
  });

  async function load(state, whatsappMock) {
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    vi.doMock('$lib/server/whatsapp', () => ({
      sendWhatsAppTextDetailed: vi.fn(async () => (whatsappMock || { ok: true })),
    }));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: vi.fn(async () => ({
        id: 'pix_1', status: 'PENDING', brCode: '00020101-BRCODE-TEST',
        brCodeBase64: 'data:image/png;base64,test', expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })),
    }));
    return await import('../src/routes/api/admin/billing/pix/create/+server.js');
  }

  function makeRequest(body, token = 'Bearer token-admin') {
    return new Request('http://localhost:5174', {
      method: 'POST',
      headers: { authorization: token, 'content-type': 'application/json', origin: 'http://localhost:5174' },
      body: JSON.stringify(body),
    });
  }

  function defaultState(overrides = {}) {
    return {
      authUser: { id: 'admin-1', email: 'admin@test.com' },
      writes: [],
      selectResults: {
        super_admins: { id: 1, is_active: true },
        subscriptions: { id: 'sub-1', user_id: 'user-target', plan_tier: 'pdv', has_mesas_addon: false, has_pedidos_addon: false, has_acessos_addon: false, has_zelo_menu: false, status: 'active', payment_provider: 'abacatepay' },
        empresa_perfil: { nome_exibicao: 'Loja Teste', documento: '529.982.247-25', contato: '(11) 99999-9999' },
        billing_payments: null,
      },
      ...overrides,
    };
  }

  it('cria charge nova e retorna success + payment + whatsappSent true', async () => {
    const handler = await load(defaultState());

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.reused).toBe(false);
    expect(data.whatsappSent).toBe(true);
    expect(data.payment.brCode).toBe('00020101-BRCODE-TEST');
  });

  it('reusa pending existente com mesma selecao', async () => {
    const handler = await load(defaultState({
      selectResults: {
        super_admins: { id: 1, is_active: true },
        subscriptions: { id: 'sub-1', user_id: 'user-target', plan_tier: 'pdv', has_mesas_addon: false, has_pedidos_addon: false, has_acessos_addon: false, has_zelo_menu: false, status: 'active', payment_provider: 'abacatepay' },
        empresa_perfil: { nome_exibicao: 'Loja Teste', documento: '529.982.247-25', contato: '(11) 99999-9999' },
        billing_payments: { ...DEFAULT_PAYMENT_ROW, status: 'pending', expires_at: new Date(Date.now() + 3600_000).toISOString() },
      },
    }));

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.reused).toBe(true);
  });

  it('recusa requisição sem super admin', async () => {
    const handler = await load(defaultState({
      selectResults: { super_admins: null },
    }));

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.error).toContain('Acesso restrito');
  });

  it('recusa usuário sem assinatura', async () => {
    const handler = await load(defaultState({
      selectResults: {
        super_admins: { id: 1, is_active: true },
        subscriptions: null,
      },
    }));

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('não possui assinatura');
  });

  it('recusa perfil incompleto', async () => {
    const handler = await load(defaultState({
      selectResults: {
        super_admins: { id: 1, is_active: true },
        subscriptions: { id: 'sub-1', user_id: 'user-target', plan_tier: 'pdv', has_mesas_addon: false, has_pedidos_addon: false, has_acessos_addon: false, has_zelo_menu: false, status: 'active', payment_provider: 'abacatepay' },
        empresa_perfil: { nome_exibicao: 'Loja', documento: null, contato: '11999999999' },
      },
    }));

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Complete nome da empresa');
  });

  it('whatsapp error nao quebra resposta', async () => {
    const handler = await load(
      defaultState(),
      { ok: false, error: 'Falha ao enviar WhatsApp' },
    );

    const response = await handler.POST({ request: makeRequest({ userId: 'user-target' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.whatsappSent).toBe(false);
    expect(data.whatsappError).toBeTruthy();
  });
});
