import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/cron/expire-trials/+server.js');

function makeRequest(token = 'secret') {
  return {
    headers: {
      get: (name) => (name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null),
    },
  };
}

function makeSupabaseAdmin(state) {
  return {
    from: vi.fn((table) => {
      if (table !== 'subscriptions') throw new Error(`Unexpected table: ${table}`);

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(async () => ({ data: state.candidates, error: state.fetchError ?? null })),
          })),
        })),
        update: vi.fn((payload) => {
          state.updatePayload = payload;
          const chain = {
            in: vi.fn((field, ids) => {
              state.updateIn = { field, ids };
              return chain;
            }),
            eq: vi.fn((field, value) => {
              state.updateEq = { field, value };
              return chain;
            }),
            select: vi.fn(async () => ({
              data: (state.candidates || [])
                .filter((row) => state.updateIn.ids.includes(row.id))
                .map((row) => ({ id: row.id, user_id: row.user_id })),
              error: state.updateError ?? null,
            })),
          };
          return chain;
        }),
      };
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
  vi.doMock('$env/dynamic/private', () => ({ env: { CRON_SECRET: 'secret' } }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('API cron/expire-trials', () => {
  it('401 without cron token', async () => {
    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin({ candidates: [] }),
    }));

    const { GET } = await loadHandler();
    const res = await GET({ request: makeRequest(null) });

    expect(res.status).toBe(401);
  });

  it('expires only local trials without future manual extension', async () => {
    const state = {
      candidates: [
        {
          id: 'sub-local-expired',
          user_id: 'user-1',
          status: 'trialing',
          current_period_end: '2026-06-13T13:33:00.084Z',
          manually_extended_until: null,
          provider_subscription_id: null,
        },
        {
          id: 'sub-stripe-owned',
          user_id: 'user-2',
          status: 'trialing',
          current_period_end: '2026-06-13T13:33:00.084Z',
          manually_extended_until: null,
          provider_subscription_id: 'sub_stripe_123',
        },
        {
          id: 'sub-manual-extension',
          user_id: 'user-3',
          status: 'trialing',
          current_period_end: '2026-06-13T13:33:00.084Z',
          manually_extended_until: '2026-06-20T13:33:00.084Z',
          provider_subscription_id: null,
        },
      ],
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const { GET } = await loadHandler();
    const res = await GET({ request: makeRequest() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.expired).toBe(1);
    expect(body.skippedProviderOwned).toBe(1);
    expect(body.skippedManualExtension).toBe(1);
    expect(state.updatePayload).toMatchObject({ status: 'trial_expired' });
    expect(state.updateIn).toEqual({ field: 'id', ids: ['sub-local-expired'] });
    expect(state.updateEq).toEqual({ field: 'status', value: 'trialing' });
  });
});
