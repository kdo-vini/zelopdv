import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/auth/signup/+server.js');
const loadRateLimit = async () => await import('../src/lib/server/rateLimit.js');

function makeRequest(body) {
  return {
    headers: {
      get: () => null,
    },
    json: async () => body,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const { resetRateLimitStoreForTests } = await loadRateLimit();
  resetRateLimitStoreForTests();
});

describe('API: auth/signup', () => {
  it('cria usuario confirmado e retorna sessao para login automatico', async () => {
    let releaseAnalytics;
    const flush = vi.fn(() => new Promise((resolve) => { releaseAnalytics = resolve; }));
    const waitUntil = vi.fn();
    vi.doMock('$lib/server/posthog', () => ({ getPostHogClient: () => ({ capture: vi.fn(), flush }) }));
    vi.doMock('@vercel/functions', () => ({ waitUntil }));
    const createUser = vi.fn(async () => ({
      data: { user: { id: 'user-1', email: 'owner@test.com' } },
      error: null,
    }));
    const signInWithPassword = vi.fn(async () => ({
      data: {
        session: { access_token: 'access', refresh_token: 'refresh' },
        user: { id: 'user-1', email: 'owner@test.com' },
      },
      error: null,
    }));

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: {
          admin: { createUser },
        },
      },
    }));
    vi.doMock('$lib/server/supabaseAuth', () => ({
      supabaseAuth: {
        auth: { signInWithPassword },
      },
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: makeRequest({
        email: ' Owner@Test.com ',
        password: 'Senha123!',
        referralCode: 'INDICA10',
      }),
      getClientAddress: () => '127.0.0.1',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
    // Response has already resolved while the analytics transport is pending.
    releaseAnalytics();
    await waitUntil.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.session.access_token).toBe('access');
    expect(createUser).toHaveBeenCalledWith({
      email: 'owner@test.com',
      password: 'Senha123!',
      email_confirm: true,
      user_metadata: { referral_code: 'INDICA10' },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@test.com',
      password: 'Senha123!',
    });
  });

  it('retorna existingUser quando o email ja existe', async () => {
    const createUser = vi.fn(async () => ({
      data: { user: null },
      error: { status: 409, message: 'User already registered' },
    }));
    const signInWithPassword = vi.fn();

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: {
          admin: { createUser },
        },
      },
    }));
    vi.doMock('$lib/server/supabaseAuth', () => ({
      supabaseAuth: {
        auth: { signInWithPassword },
      },
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: makeRequest({ email: 'owner@test.com', password: 'Senha123!' }),
      getClientAddress: () => '127.0.0.1',
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.existingUser).toBe(true);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
