import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/webhook/+server.js');

function mockWebhookSecret(value = 'whsec_test') {
  vi.doMock('$env/dynamic/private', () => ({ env: { STRIPE_WEBHOOK_SECRET: value } }));
}

function makeSupabaseAdmin(row = { id: 'sub-row', user_id: 'u1', plan_tier: 'pdv' }, updates = []) {
  return {
    from: vi.fn((table) => {
      const chain = {
        insert: vi.fn(() => ({
          select: () => ({
            maybeSingle: async () => ({ data: { event_id: 'evt_1' }, error: null })
          })
        })),
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: table === 'subscriptions' ? row : null,
          error: null
        })),
        update: vi.fn((payload) => ({
          eq: async () => {
            updates.push({ table, payload });
            return { error: null };
          }
        }))
      };
      return chain;
    })
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('API: stripe webhook', () => {
  it('returns 400 when Stripe signature verification fails', async () => {
    mockWebhookSecret();
    const constructEvent = vi.fn(() => {
      throw new Error('bad signature');
    });
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin() }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(400);
    expect(constructEvent).toHaveBeenCalledOnce();
  });

  it('returns 500 when service role missing', async () => {
    mockWebhookSecret();
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: null }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent: vi.fn() } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => '', headers: new Map() } });

    expect(res.status).toBe(500);
  });

  it('updates subscription on subscription.updated', async () => {
    mockWebhookSecret();
    const updates = [];
    const periodEnd = Math.floor(Date.now() / 1000) + 3600;
    const constructEvent = vi.fn(() => ({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { user_id: 'u1' },
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_123' } }] }
        }
      }
    }));

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin(undefined, updates) }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(200);
    expect(updates.find((u) => u.table === 'subscriptions')?.payload.current_period_end)
      .toBe(new Date(periodEnd * 1000).toISOString());
  });

  it('reads current_period_end from subscription items when Stripe omits subscription-level period', async () => {
    mockWebhookSecret();
    const updates = [];
    const itemPeriodEnd = Math.floor(Date.now() / 1000) + 7200;
    const constructEvent = vi.fn(() => ({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { user_id: 'u1' },
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: 'price_123' }, current_period_end: itemPeriodEnd }
            ]
          }
        }
      }
    }));

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin(undefined, updates) }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(200);
    expect(updates.find((u) => u.table === 'subscriptions')?.payload.current_period_end)
      .toBe(new Date(itemPeriodEnd * 1000).toISOString());
  });

  it('writes monthly_value_cents from the sum of expanded item prices (real MRR, not estimated)', async () => {
    mockWebhookSecret();
    const updates = [];
    const periodEnd = Math.floor(Date.now() / 1000) + 3600;
    const constructEvent = vi.fn(() => ({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { user_id: 'u1' },
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: 'price_123', unit_amount: 19800 }, quantity: 1 },
              { price: { id: 'price_addon', unit_amount: 3000 }, quantity: 1 },
            ],
          },
        },
      },
    }));

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin(undefined, updates) }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(200);
    expect(updates.find((u) => u.table === 'subscriptions')?.payload.monthly_value_cents).toBe(22800);
  });

  it('omits monthly_value_cents when prices are unexpanded (does not overwrite with garbage)', async () => {
    mockWebhookSecret();
    const updates = [];
    const constructEvent = vi.fn(() => ({
      id: 'evt_4',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { user_id: 'u1' },
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_123' } }] },
        },
      },
    }));

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin(undefined, updates) }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(200);
    expect(updates.find((u) => u.table === 'subscriptions')?.payload).not.toHaveProperty('monthly_value_cents');
  });
});
