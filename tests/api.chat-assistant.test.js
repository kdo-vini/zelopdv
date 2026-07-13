import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/chat/assistant/+server.js');

function makeRequest(body) {
  return {
    headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer token' : null },
    json: async () => body,
  };
}

describe('API: chat/assistant', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 403 when a subuser supplies another company signal id', async () => {
    const signalFilters = [];
    const resolveOwnerUserId = vi.fn(async () => 'owner-1');
    const signalQuery = {
      select: vi.fn(() => signalQuery),
      eq: vi.fn((field, value) => {
        signalFilters.push({ field, value });
        return signalQuery;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };

    vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'test-key' } }));
    vi.doMock('$lib/server/accessControl', () => ({ resolveOwnerUserId }));
    vi.doMock('$lib/server/rateLimit', () => ({
      buildRateLimitKey: () => 'test',
      enforceRateLimit: () => ({ ok: true }),
      createRateLimitResponse: vi.fn(),
    }));
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'subuser-1' } }, error: null })) },
        from: vi.fn((table) => {
          if (table === 'business_signals') return { select: vi.fn(() => signalQuery) };
          if (table === 'empresa_perfil') {
            return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      },
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: makeRequest({ messages: [{ role: 'user', content: 'Me conte mais.' }], signal_id: 'signal-other' }),
    });

    expect(response.status).toBe(403);
    expect(resolveOwnerUserId).toHaveBeenCalledWith('subuser-1');
    expect(signalFilters).toEqual([
      { field: 'id', value: 'signal-other' },
      { field: 'user_id', value: 'owner-1' },
    ]);
  });

  it('does not reject a numeric signal_id as invalid (business_signals.id is bigint, not text)', async () => {
    const signalFilters = [];
    const resolveOwnerUserId = vi.fn(async () => 'owner-1');
    const signalQuery = {
      select: vi.fn(() => signalQuery),
      eq: vi.fn((field, value) => {
        signalFilters.push({ field, value });
        return signalQuery;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };

    vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'test-key' } }));
    vi.doMock('$lib/server/accessControl', () => ({ resolveOwnerUserId }));
    vi.doMock('$lib/server/rateLimit', () => ({
      buildRateLimitKey: () => 'test',
      enforceRateLimit: () => ({ ok: true }),
      createRateLimitResponse: vi.fn(),
    }));
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'subuser-1' } }, error: null })) },
        from: vi.fn((table) => {
          if (table === 'business_signals') return { select: vi.fn(() => signalQuery) };
          if (table === 'empresa_perfil') {
            return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      },
    }));

    const { POST } = await loadHandler();
    const response = await POST({
      request: makeRequest({ messages: [{ role: 'user', content: 'Me conte mais.' }], signal_id: 42 }),
    });

    // Signal lookup returns null in this mock (not found), so 403, not the 400 "Aviso inválido" seen for non-string ids.
    expect(response.status).toBe(403);
    expect(signalFilters).toEqual([
      { field: 'id', value: 42 },
      { field: 'user_id', value: 'owner-1' },
    ]);
  });
});
