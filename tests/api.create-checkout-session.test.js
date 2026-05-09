import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/create-checkout-session/+server.js');

beforeEach(() => {
  vi.resetModules();
});

describe('API: create-checkout-session', () => {
  it('returns 410 because the legacy endpoint is discontinued', async () => {
    const { POST } = await loadHandler();
    const res = await POST({ request: { json: async () => ({}) } });
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.use).toBe('/api/billing/create-subscription');
  });
});
