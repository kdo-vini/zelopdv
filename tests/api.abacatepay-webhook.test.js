import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/webhooks/abacatepay/+server.js');

function signPayload(rawBody, publicKey) {
  return crypto
    .createHmac('sha256', publicKey)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64');
}

function makeSupabaseAdmin(state) {
  return {
    rpc: vi.fn((name, params) => ({
      single: vi.fn(async () => {
        state.writes.push({ table: 'rpc', operation: name, payload: params });
        if (name === 'complete_pix_creation') {
          state.reservation = { ...state.reservation, creation_state: 'ready', provider_payment_id: params.p_remote.id };
          return { data: state.reservation, error: null };
        }
        return {
          data: state.rpcResult ?? { ...(state.payment || state.reservation || {}), status: 'paid', paid_at: '2026-05-21T17:00:00.000Z', subscription_id: 'sub-1' },
          error: state.rpcError ?? null,
        };
      }),
    })),
    from: vi.fn((table) => {
      if (table === 'billing_webhook_events') {
        const selectChain = {
          eq: vi.fn(() => selectChain),
          maybeSingle: vi.fn(async () => ({
            data: state.webhookExistingResult ?? null,
            error: state.webhookSelectError ?? null,
          })),
        };
        const insertChain = {
          select: vi.fn(() => insertChain),
          maybeSingle: vi.fn(async () => ({
            data: state.webhookInsertResult ?? { id: 'hook-1', event_id: 'evt_1' },
            error: state.webhookInsertError ?? null,
          })),
        };
        const tableApi = {
          select: vi.fn(() => selectChain),
          insert: vi.fn((payload) => {
            state.writes.push({ table, operation: 'insert', payload });
            return insertChain;
          }),
          update: vi.fn((payload) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                state.writes.push({ table, operation: 'update', payload });
                return { error: null };
              }),
            })),
          })),
        };

        return tableApi;
      }

      if (table === 'billing_payments') {
        const filters = [];
        const selectChain = {
          eq: vi.fn((field, value) => { filters.push([field, value]); return selectChain; }),
          maybeSingle: vi.fn(async () => ({
            data: state.payment ?? (filters.some(([field]) => field === 'provider_payment_id') ? null : state.reservation) ?? null,
            error: null,
          })),
        };

        return {
          select: vi.fn(() => selectChain),
          update: vi.fn((payload) => ({
            eq: vi.fn(async () => {
              state.writes.push({ table, operation: 'update', payload });
              return { error: null };
            }),
          })),
        };
      }

      if (table === 'subscriptions') {
        const selectChain = {
          eq: vi.fn(() => selectChain),
          order: vi.fn(() => selectChain),
          limit: vi.fn(() => selectChain),
          maybeSingle: vi.fn(async () => ({
            data: state.subscription ?? null,
            error: null,
          })),
        };

        return {
          select: vi.fn(() => selectChain),
          update: vi.fn((payload) => ({
            eq: vi.fn(async () => {
              state.writes.push({ table, operation: 'update', payload });
              return { error: null };
            }),
          })),
          insert: vi.fn((payload) => {
            state.writes.push({ table, operation: 'insert', payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: 'sub-new-1' },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
    }),
  };
}

function makeRequest(rawBody, signature) {
  return {
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'x-webhook-signature') return signature;
        return null;
      },
    },
    text: async () => rawBody,
  };
}

function setupWebhookEnv() {
  const webhookSecret = 'secret_ok';
  vi.stubEnv('ABACATEPAY_WEBHOOK_SECRET', webhookSecret);
  vi.stubEnv('ABACATEPAY_PUBLIC_KEY', 'public_test_key');
  vi.doMock('$env/dynamic/private', () => ({
    env: {
      ABACATEPAY_WEBHOOK_SECRET: webhookSecret,
      ABACATEPAY_PUBLIC_KEY: 'public_test_key',
    },
  }));
  return { webhookSecret, publicKey: 'public_test_key' };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('API: abacatepay webhook', () => {
  it('recovers a reserved payment before provider-id attachment using signed webhook + provider GET', async () => {
    const { webhookSecret, publicKey } = setupWebhookEnv();
    const state = { writes: [], reservation: {
      id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222',
      provider: 'abacatepay', method: 'pix', status: 'pending', creation_state: 'unknown',
      external_reference: 'pix_fixture_reserved', amount_expected_cents: 5900,
    } };
    const remote = { id: 'provider_fixture', externalId: state.reservation.external_reference,
      amount: 5900, paidAmount: 5900, status: 'PAID' };
    const list = vi.fn(async () => [remote]);
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    vi.doMock('$lib/server/abacatePay', () => ({ listTransparentPixCharges: list }));
    const rawBody = JSON.stringify({ id: 'event_fixture', event: 'transparent.completed', data: { transparent: remote } });
    const { POST } = await loadHandler();
    const response = await POST({ url: new URL(`https://fixture.invalid?webhookSecret=${webhookSecret}`),
      request: makeRequest(rawBody, signPayload(rawBody, publicKey)) });
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(state.reservation.external_reference);
    expect(state.writes.find(row => row.operation === 'complete_pix_creation')).toBeTruthy();
    expect(state.writes.some(row => row.operation === 'settle_pix_payment')).toBe(true);
  });
  it('rejeita segredo invalido', async () => {
    const { publicKey } = setupWebhookEnv();

    const state = { writes: [] };
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const rawBody = JSON.stringify({ id: 'evt_1', event: 'transparent.completed', data: {} });
    const signature = signPayload(rawBody, publicKey);

    const { POST } = await loadHandler();
    const res = await POST({
      url: new URL('https://zelopdv.com.br/api/webhooks/abacatepay?webhookSecret=wrong'),
      request: makeRequest(rawBody, signature),
    });

    expect(res.status).toBe(401);
  });

  it('idempotencia de evento duplicado', async () => {
    const { webhookSecret, publicKey } = setupWebhookEnv();

    const state = {
      writes: [],
      webhookInsertResult: null,
      webhookInsertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      webhookExistingResult: { id: 'hook-1', event_id: 'evt_1', status: 'processed' },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const rawBody = JSON.stringify({
      id: 'evt_1',
      event: 'transparent.completed',
      data: {
        transparent: {
          id: 'char_123',
          status: 'PAID',
          amount: 9900,
          paidAmount: 9900,
        },
      },
    });
    const signature = signPayload(rawBody, publicKey);

    const { POST } = await loadHandler();
    const res = await POST({
      url: new URL(`https://zelopdv.com.br/api/webhooks/abacatepay?webhookSecret=${webhookSecret}`),
      request: makeRequest(rawBody, signature),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.idempotent).toBe(true);
  });

  it('processa transparent.completed e marca pagamento como paid ativando assinatura', async () => {
    const { webhookSecret, publicKey } = setupWebhookEnv();

    const state = {
      writes: [],
      payment: {
        id: 'pay-1',
        user_id: 'owner-1',
        subscription_id: null,
        provider: 'abacatepay',
        method: 'pix',
        status: 'pending',
        amount_expected_cents: 9900,
        amount_paid_cents: null,
        currency: 'BRL',
        external_reference: 'pix_owner-1_123',
        br_code: '000201...',
        qr_code_base64: 'data:image/png;base64,abc123',
        expires_at: '2099-05-21T18:00:00.000Z',
        paid_at: null,
        provider_payment_id: 'char_123',
        provider_status: 'PENDING',
        plan_tier: 'pdv',
        has_mesas_addon: false,
        has_acessos_addon: false,
        metadata: {},
      },
      subscription: {
        id: 'sub-1',
        current_period_end: '2026-05-01T00:00:00.000Z',
        manually_extended_until: null,
      },
      rpcResult: {
        id: 'pay-1', status: 'paid', paid_at: '2026-05-21T17:00:00.000Z', subscription_id: 'sub-1',
      },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const payload = {
      id: 'evt_1',
      event: 'transparent.completed',
      data: {
        transparent: {
          id: 'char_123',
          externalId: 'pix_owner-1_123',
          amount: 9900,
          paidAmount: 9900,
          status: 'PAID',
          updatedAt: '2026-05-21T17:00:00.000Z',
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = signPayload(rawBody, publicKey);

    const { POST } = await loadHandler();
    const res = await POST({
      url: new URL(`https://zelopdv.com.br/api/webhooks/abacatepay?webhookSecret=${webhookSecret}`),
      request: makeRequest(rawBody, signature),
    });

    expect(res.status).toBe(200);
    expect(state.writes.some((entry) => entry.table === 'rpc' && entry.operation === 'settle_pix_payment')).toBe(true);
    expect(
      state.writes.some((entry) => entry.table === 'billing_webhook_events' && entry.operation === 'update' && entry.payload.status === 'processed')
    ).toBe(true);
  });

  it('reprocessa evento que ficou failed em uma tentativa anterior', async () => {
    const { webhookSecret, publicKey } = setupWebhookEnv();
    const state = {
      writes: [],
      webhookInsertResult: null,
      webhookInsertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      webhookExistingResult: { id: 'hook-1', event_id: 'evt_retry', status: 'failed' },
      payment: {
        id: 'pay-retry', user_id: 'owner-1', subscription_id: null, provider: 'abacatepay', method: 'pix',
        status: 'pending', amount_expected_cents: 9900, amount_paid_cents: null,
        external_reference: 'pix_owner-1_123', expires_at: '2099-05-21T18:00:00.000Z', paid_at: null,
        provider_payment_id: 'char_retry', provider_status: 'PENDING', plan_tier: 'pdv',
        has_mesas_addon: false, has_acessos_addon: false, has_zelo_menu: false, metadata: {},
      },
      rpcResult: { id: 'pay-retry', status: 'paid', paid_at: '2026-05-21T17:00:00.000Z', subscription_id: 'sub-retry' },
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    const payload = {
      id: 'evt_retry', event: 'transparent.completed',
      data: { transparent: { id: 'char_retry', externalId: 'pix_owner-1_123', amount: 9900, paidAmount: 9900, status: 'PAID' } },
    };
    const rawBody = JSON.stringify(payload);
    const signature = signPayload(rawBody, publicKey);

    const { POST } = await loadHandler();
    const res = await POST({
      url: new URL(`https://zelopdv.com.br/api/webhooks/abacatepay?webhookSecret=${webhookSecret}`),
      request: makeRequest(rawBody, signature),
    });

    expect(res.status).toBe(200);
    expect(state.writes.some((entry) => entry.table === 'rpc' && entry.operation === 'settle_pix_payment')).toBe(true);
    expect(state.writes.some((entry) => entry.table === 'billing_webhook_events' && entry.operation === 'update' && entry.payload.status === 'received')).toBe(true);
  });

  it('mantém retryável um evento recebido antes da linha local do pagamento', async () => {
    const { webhookSecret, publicKey } = setupWebhookEnv();
    const state = {
      writes: [],
      payment: null,
    };
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));

    const payload = {
      id: 'evt_payment_row_late',
      event: 'transparent.completed',
      data: { transparent: { id: 'char_late', amount: 9900, paidAmount: 9900, status: 'PAID' } },
    };
    const rawBody = JSON.stringify(payload);
    const signature = signPayload(rawBody, publicKey);

    const { POST } = await loadHandler();
    const res = await POST({
      url: new URL(`https://zelopdv.com.br/api/webhooks/abacatepay?webhookSecret=${webhookSecret}`),
      request: makeRequest(rawBody, signature),
    });

    expect(res.status).toBe(500);
    expect(state.writes.some((entry) => entry.table === 'billing_webhook_events' && entry.operation === 'update' && entry.payload.status === 'failed')).toBe(true);
  });
});
