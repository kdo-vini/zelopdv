import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/create-checkout-session/+server.js');

beforeEach(() => {
  vi.resetModules();
  delete process.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL;
  delete process.env.PUBLIC_STRIPE_PAYMENT_LINK_URL;
  delete process.env.STRIPE_PRICE_ID_MONTHLY_59;
  delete process.env.STRIPE_SECRET_KEY;
});

// Default: stripe mock null unless set
vi.mock('../src/lib/server/stripe.js', () => ({ stripe: null }));

describe('API: create-checkout-session', () => {
  it('400 when payload missing userId/email', async () => {
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({}) } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/obrigat/);
  });

  it('redirects to payment link when configured', async () => {
    process.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/test';
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({ userId: 'u1', email: 'x@y.com' }) } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/buy\.stripe\.com/);
  });

  it('500 when price id missing and no payment link', async () => {
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({ userId: 'u1', email: 'x@y.com' }) } });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/STRIPE_PRICE_ID_MONTHLY_59/);
  });

  it('success path with price id and stripe configured', async () => {
    process.env.STRIPE_PRICE_ID_MONTHLY_59 = 'price_123';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: {
        customers: {
          list: vi.fn(async () => ({ data: [] })),
          create: vi.fn(async () => ({ id: 'cus_123' }))
        },
        checkout: {
          sessions: { create: vi.fn(async () => ({ url: 'https://checkout.test' })) }
        }
      }
    }));
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({ userId: 'u1', email: 'x@y.com' }) } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.url).toBe('https://checkout.test');
  });
});
