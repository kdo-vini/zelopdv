import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/pix/status/[paymentId]/+server.js');

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
    rpc: vi.fn((name, params) => ({
      single: vi.fn(async () => {
        state.writes.push({ table: 'rpc', operation: name, payload: params });
        return { data: state.rpcResult ?? null, error: state.rpcError ?? null };
      }),
    })),
    from: vi.fn((table) => {
      const selectResult = state.selectResults?.[table] ?? null;
      const buildUpdateChain = (payload, filters = []) => ({
        error: null,
        select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { ...selectResult, ...payload }, error: null })) })),
        eq: vi.fn((field, value) => {
          const nextFilters = [...filters, [field, value]];
          state.writes.push({
            table,
            operation: 'update',
            payload,
            filters: nextFilters,
          });
          return buildUpdateChain(payload, nextFilters);
        }),
        then: undefined,
      });

      return {
        select: vi.fn(() => makeSelectChain(selectResult)),
        update: vi.fn((payload) => buildUpdateChain(payload)),
        insert: vi.fn((payload) => {
          state.writes.push({ table, operation: 'insert', payload });
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'sub-new-1' },
                error: null,
              })),
            })),
          };
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
  };
}

function makeRequest(token = 'token') {
  return {
    headers: {
      get: (name) => (name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null),
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('API: billing/pix/status', () => {
  it('401 sem token', async () => {
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin({ writes: [], selectResults: {} }),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl({}));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      checkTransparentPixCharge: vi.fn(),
    }));

    const { GET } = await loadHandler();
    const res = await GET({
      params: { paymentId: 'pay-1' },
      request: makeRequest(null),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/autorizado/i);
  });

  it('404 se cobranca nao existe', async () => {
    const state = {
      user: { id: 'owner-1', email: 'owner@test.com' },
      writes: [],
      selectResults: {
        billing_payments: null,
      },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      checkTransparentPixCharge: vi.fn(),
    }));

    const { GET } = await loadHandler();
    const res = await GET({
      params: { paymentId: 'missing-pay' },
      request: makeRequest(),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/nao encontrada|não encontrada/i);
  });

  it('200 mantendo pending', async () => {
    const state = {
      user: { id: 'owner-1', email: 'owner@test.com' },
      writes: [],
      selectResults: {
        billing_payments: {
          id: 'pay-1',
          user_id: 'owner-1',
          subscription_id: null,
          provider: 'abacatepay',
          method: 'pix',
          status: 'pending',
          amount_expected_cents: 5900,
          br_code: '000201...',
          qr_code_base64: 'data:image/png;base64,abc123',
          expires_at: '2099-05-21T18:00:00.000Z',
          paid_at: null,
          provider_payment_id: 'abacate_123',
          provider_status: 'PENDING',
          plan_tier: 'pdv',
          has_mesas_addon: false,
          has_acessos_addon: false,
        },
        subscriptions: null,
      },
    };

    const checkTransparentPixCharge = vi.fn(async () => ({
      id: 'abacate_123',
      status: 'PENDING',
      expiresAt: '2099-05-21T18:00:00.000Z',
    }));

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      checkTransparentPixCharge,
    }));

    const { GET } = await loadHandler();
    const res = await GET({
      params: { paymentId: 'pay-1' },
      request: makeRequest(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('pending');
    expect(body.providerStatus).toBe('PENDING');
    expect(checkTransparentPixCharge).toHaveBeenCalledWith('abacate_123');
    expect(state.writes.filter((entry) => entry.table === 'subscriptions')).toHaveLength(0);
  });

  it('200 converte para paid e persiste pagamento e assinatura', async () => {
    const state = {
      user: { id: 'owner-1', email: 'owner@test.com' },
      writes: [],
      selectResults: {
        billing_payments: {
          id: 'pay-1',
          user_id: 'owner-1',
          subscription_id: null,
          provider: 'abacatepay',
          method: 'pix',
          status: 'pending',
          amount_expected_cents: 9900,
          br_code: '000201...',
          qr_code_base64: 'data:image/png;base64,abc123',
          expires_at: '2099-05-21T18:00:00.000Z',
          paid_at: null,
          provider_payment_id: 'abacate_123',
          provider_status: 'PENDING',
          plan_tier: 'bundle',
          has_mesas_addon: true,
          has_acessos_addon: true,
        },
        subscriptions: {
          id: 'sub-1',
          status: 'past_due',
          current_period_end: '2026-05-01T00:00:00.000Z',
          manually_extended_until: null,
        },
      },
      rpcResult: {
        id: 'pay-1', status: 'paid', paid_at: '2026-05-21T17:00:00.000Z', subscription_id: 'sub-1',
      },
    };

    const checkTransparentPixCharge = vi.fn(async () => ({
      id: 'abacate_123',
      status: 'PAID',
      expiresAt: '2099-05-21T18:00:00.000Z',
    }));

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('$lib/server/accessControl', () => makeAccessControl(state));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      checkTransparentPixCharge,
    }));

    const { GET } = await loadHandler();
    const res = await GET({
      params: { paymentId: 'pay-1' },
      request: makeRequest(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('paid');
    expect(checkTransparentPixCharge).toHaveBeenCalledWith('abacate_123');

    const settlement = state.writes.find(
      (entry) => entry.table === 'rpc' && entry.operation === 'settle_pix_payment'
    );
    expect(settlement).toBeTruthy();
    expect(settlement.payload).toMatchObject({
      p_payment_id: 'pay-1',
      p_provider_status: 'PAID',
      p_mapped_status: 'paid',
      p_amount_paid_cents: null,
    });
  });
});
