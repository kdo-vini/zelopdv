import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $lib/server/stripe by default as null
vi.mock('../src/lib/server/stripe.js', () => ({ stripe: null }));

const loadHandler = async () => await import('../src/routes/api/billing/create-portal-session/+server.js');

describe('API: create-portal-session', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('400 when missing customerId (with stripe configured)', async () => {
    vi.doMock('../src/lib/server/stripe.js', () => ({ stripe: { billingPortal: { sessions: { create: vi.fn() } } } }));
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({}) } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/customerId/i);
  });

  it('500 when stripe not configured', async () => {
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({ customerId: 'cus_123' }) } });
    expect(res.status).toBe(500);
  });

  it('returns portal url on success', async () => {
    vi.doMock('../src/lib/server/stripe.js', () => ({
      stripe: {
        billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://portal.test' })) } }
      }
    }));
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({ customerId: 'cus_123' }) } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://portal.test');
  });
});
