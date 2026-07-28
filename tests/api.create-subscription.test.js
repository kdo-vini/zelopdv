import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/create-subscription/+server.js');

function makeSupabaseAdmin(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user ?? { id: 'owner-1', email: 'owner@test.com' } },
        error: state.authError ?? null,
      })),
    },
    from: vi.fn((table) => {
      if (table === 'empresa_perfil') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: state.perfil ?? { nome_exibicao: 'Loja Teste', documento: '12345678900' },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'subscriptions') {
        const selectChain = {
          eq: vi.fn(() => selectChain),
          order: vi.fn(() => selectChain),
          limit: vi.fn(() => selectChain),
          maybeSingle: vi.fn(async () => ({
            data: state.existingSub ?? null,
            error: null,
          })),
        };

        return {
          select: vi.fn(() => selectChain),
          update: vi.fn((payload) => ({
            eq: vi.fn(async () => {
              state.updatedSubscriptions.push(payload);
              return { error: null };
            }),
          })),
          insert: vi.fn(async (payload) => {
            state.insertedSubscriptions.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
    }),
  };
}

function makeStripe(state) {
  return {
    customers: {
      list: vi.fn(async () => ({ data: state.customerList ?? [{ id: 'cus_123' }] })),
      create: vi.fn(async () => ({ id: 'cus_new' })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({
          id: 'cs_test_123',
          url: 'https://checkout.test/session',
        })),
      },
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doMock('$lib/server/referrals', () => ({
    progressReferralForUser: vi.fn(async () => null),
  }));
  vi.doMock('$lib/server/posthog', () => ({
    getPostHogClient: () => null,
  }));
});

describe('API: create-subscription', () => {
  it('preserves a trialing subscription until Stripe checkout completes', async () => {
    const state = {
      existingSub: {
        id: 'sub-row-1',
        provider_subscription_id: null,
        provider_customer_id: null,
        status: 'trialing',
        current_period_end: '2099-06-01T00:00:00.000Z',
        plan_tier: 'pdv',
        has_mesas_addon: false,
        has_acessos_addon: false,
        payment_provider: null,
      },
      updatedSubscriptions: [],
      insertedSubscriptions: [],
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: makeStripe(state),
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: {
        headers: { get: (name) => (name === 'authorization' ? 'Bearer token' : null) },
        json: async () => ({
          planTier: 'bundle',
          addons: { mesas: true, acessos: true },
        }),
      },
      url: new URL('https://zelopdv.com.br/assinatura'),
    });

    expect(response.status).toBe(200);
    expect(state.updatedSubscriptions).toHaveLength(1);
    expect(state.updatedSubscriptions[0]).toMatchObject({
      provider_customer_id: 'cus_123',
      payment_provider: 'stripe',
      status: 'trialing',
      plan_tier: 'pdv',
      has_mesas_addon: false,
      has_acessos_addon: false,
    });
  });

  it('does not preserve an expired trial when Stripe checkout starts', async () => {
    const state = {
      existingSub: {
        id: 'sub-row-1',
        provider_subscription_id: null,
        provider_customer_id: null,
        status: 'trialing',
        current_period_end: '2020-06-01T00:00:00.000Z',
        manually_extended_until: null,
        plan_tier: 'pdv',
        has_mesas_addon: false,
        has_acessos_addon: false,
        payment_provider: null,
      },
      updatedSubscriptions: [],
      insertedSubscriptions: [],
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: makeStripe(state),
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: {
        headers: { get: (name) => (name === 'authorization' ? 'Bearer token' : null) },
        json: async () => ({
          planTier: 'bundle',
          addons: { mesas: true, acessos: true },
        }),
      },
      url: new URL('https://zelopdv.com.br/assinatura'),
    });

    expect(response.status).toBe(200);
    expect(state.updatedSubscriptions).toHaveLength(1);
    expect(state.updatedSubscriptions[0]).toMatchObject({
      payment_provider: 'stripe',
      status: 'incomplete',
      plan_tier: 'bundle',
      has_mesas_addon: true,
      has_acessos_addon: true,
    });
  });

  it('records a first checkout as incomplete with the requested plan and addons', async () => {
    const state = {
      existingSub: null,
      updatedSubscriptions: [],
      insertedSubscriptions: [],
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: makeStripe(state),
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: {
        headers: { get: (name) => (name === 'authorization' ? 'Bearer token' : null) },
        json: async () => ({
          planTier: 'pdv',
          addons: { mesas: true, acessos: true },
        }),
      },
      url: new URL('https://zelopdv.com.br/assinatura'),
    });

    expect(response.status).toBe(200);
    expect(state.insertedSubscriptions).toHaveLength(1);
    expect(state.insertedSubscriptions[0]).toMatchObject({
      payment_provider: 'stripe',
      plan_tier: 'pdv',
      has_mesas_addon: true,
      has_acessos_addon: true,
      status: 'incomplete',
    });
  });
});
