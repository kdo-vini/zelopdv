import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/auth/login/+server.js');
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

describe('API: auth/login', () => {
  it('retorna sessao quando autenticacao funciona', async () => {
    vi.doMock('$lib/server/supabaseAuth', () => ({
      supabaseAuth: {
        auth: {
          signInWithPassword: vi.fn(async () => ({
            data: {
              session: { access_token: 'access', refresh_token: 'refresh' },
              user: { id: 'user-1', email: 'owner@test.com' },
            },
            error: null,
          })),
        },
      },
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: makeRequest({ email: 'owner@test.com', password: 'Senha123!' }),
      getClientAddress: () => '127.0.0.1',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session.access_token).toBe('access');
  });

  it('aplica limite por ip+email e retorna 429', async () => {
    vi.doMock('$lib/server/supabaseAuth', () => ({
      supabaseAuth: {
        auth: {
          signInWithPassword: vi.fn(async () => ({
            data: { session: null, user: null },
            error: { message: 'Invalid login credentials' },
          })),
        },
      },
    }));

    const { POST } = await loadHandler();
    let lastResponse;

    for (let i = 0; i < 6; i += 1) {
      lastResponse = await POST({
        request: makeRequest({ email: 'owner@test.com', password: 'errada' }),
        getClientAddress: () => '127.0.0.1',
      });
    }

    const body = await lastResponse.json();
    expect(lastResponse.status).toBe(429);
    expect(body.code).toBe('rate_limited');
  });
});
