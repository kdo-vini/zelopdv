import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/stripe/webhook/+server.js');

beforeEach(() => {
  vi.resetModules();
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// Mock stripe and supabase by default
vi.mock('../src/lib/server/stripe.js', () => ({ stripe: { webhooks: { constructEvent: vi.fn() } } }));
vi.mock('@supabase/supabase-js', () => {
  const upsert = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => ({ upsert }));
  const createClient = vi.fn(() => ({ from }));
  return { createClient };
});

describe('API: stripe webhook', () => {
  it('returns 500 when webhook secret missing', async () => {
    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => '', headers: new Map() } });
    expect(res.status).toBe(500);
  });

  it('returns 500 when service role missing', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => '', headers: new Map() } });
    expect(res.status).toBe(500);
  });

  it('upserts subscription on subscription.updated', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_key';

    const constructEvent = vi.fn(() => ({
      type: 'customer.subscription.updated',
      data: { object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        metadata: { user_id: 'u1' },
        current_period_end: Math.floor(Date.now()/1000) + 3600,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: 'price_123' } }] }
      } }
    }));

    vi.doMock('../src/lib/server/stripe.js', () => ({ stripe: { webhooks: { constructEvent } } }));

    const { POST } = await loadHandler();
    const res = await POST({ request: { text: async () => 'raw', headers: { get: () => 'sig' } } });
    expect(res.status).toBe(200);
  });
});
