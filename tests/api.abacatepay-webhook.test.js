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
    from: vi.fn((table) => {
      if (table === 'billing_webhook_events') {
        const chain = {
          select: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: state.webhookInsertResult ?? { id: 'hook-1', event_id: 'evt_1' },
            error: state.webhookInsertError ?? null,
          })),
          insert: vi.fn((payload) => {
            state.writes.push({ table, operation: 'insert', payload });
            return chain;
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

        return chain;
      }

      if (table === 'billing_payments') {
        const selectChain = {
          eq: vi.fn(() => selectChain),
          maybeSingle: vi.fn(async () => ({
            data: state.payment ?? null,
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
        has_pedidos_addon: false,
        has_acessos_addon: false,
        metadata: {},
      },
      subscription: {
        id: 'sub-1',
        current_period_end: '2026-05-01T00:00:00.000Z',
        manually_extended_until: null,
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
    expect(
      state.writes.some((entry) => entry.table === 'billing_payments' && entry.operation === 'update' && entry.payload.status === 'paid')
    ).toBe(true);
    expect(
      state.writes.some((entry) => entry.table === 'subscriptions' && entry.operation === 'update' && entry.payload.status === 'active')
    ).toBe(true);
    expect(
      state.writes.some((entry) => entry.table === 'billing_webhook_events' && entry.operation === 'update' && entry.payload.status === 'processed')
    ).toBe(true);
  });
});
