import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/create-portal-session/+server.js');

beforeEach(() => {
  vi.resetModules();
});

describe('API: create-portal-session', () => {
  it('401 when authorization header is missing', async () => {
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: { billingPortal: { sessions: { create: vi.fn() } } }
    }));
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: { auth: { getUser: vi.fn() } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: { headers: { get: () => null } },
      url: { origin: 'https://app.test' }
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/autorizado/i);
  });

  it('500 when stripe is not configured', async () => {
    vi.doMock('../src/lib/server/stripe.js', () => ({ stripe: null }));
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: { auth: { getUser: vi.fn() } }
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: { headers: { get: () => 'Bearer token' } },
      url: { origin: 'https://app.test' }
    });

    expect(res.status).toBe(500);
  });

  it('returns portal url on success', async () => {
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: {
        billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://portal.test' })) } }
      }
    }));
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'u1', email: 'x@y.com' } },
            error: null
          }))
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { stripe_customer_id: 'cus_123' },
                    error: null
                  }))
                }))
              }))
            }))
          }))
        }))
      }
    }));

    const { POST } = await loadHandler();
    const res = await POST({
      request: { headers: { get: (name) => (name === 'authorization' ? 'Bearer token' : null) } },
      url: { origin: 'https://app.test' }
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://portal.test');
  });
});
