import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/webhook/+server.js');

function makeSupabaseAdmin(row = { id: 'sub-row', user_id: 'u1', plan_tier: 'pdv' }) {
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
        update: vi.fn(() => ({
          eq: async () => ({ error: null })
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
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
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
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: null }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent: vi.fn() } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => '', headers: new Map() } });

    expect(res.status).toBe(500);
  });

  it('updates subscription on subscription.updated', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    const constructEvent = vi.fn(() => ({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { user_id: 'u1' },
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_123' } }] }
        }
      }
    }));

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: makeSupabaseAdmin() }));
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { webhooks: { constructEvent } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });

    expect(res.status).toBe(200);
  });
});
