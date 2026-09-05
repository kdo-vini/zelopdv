import { makePixReservationMock } from './helpers/pixReservationMock.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validatePixCustomerProfile,
  buildPixDescription,
  buildRenewalPixWhatsAppMessage,
  PIX_EXPIRATION_SECONDS,
} from '../src/lib/server/billingPix.js';

describe('validatePixCustomerProfile', () => {
  it('ok com perfil completo e normaliza taxId/phone', () => {
    const r = validatePixCustomerProfile({
      nome_exibicao: 'Loja Teste',
      documento: '529.982.247-25',
      contato: '(11) 99999-9999',
    });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Loja Teste');
    expect(r.taxId).toBe('52998224725');
    expect(r.phone).toBe('5511999999999');
  });

  it('missing_fields quando falta documento', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: null, contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_fields');
  });

  it('invalid_tax_id quando CPF invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '11111111111', contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_tax_id');
  });

  it('invalid_phone quando telefone invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '52998224725', contato: '123' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_phone');
  });

  it('missing_fields quando perfil null', () => {
    expect(validatePixCustomerProfile(null).code).toBe('missing_fields');
  });
});

describe('buildPixDescription', () => {
  it('usa nome do plano e limita a 37 chars', () => {
    const d = buildPixDescription('pdv');
    expect(d).toContain('ZeloPDV');
    expect(d.length).toBeLessThanOrEqual(37);
  });
  it('fallback Zelo para plano desconhecido', () => {
    expect(buildPixDescription('xxx')).toContain('Zelo');
  });
});

describe('buildRenewalPixWhatsAppMessage', () => {
  it('retorna message1 com texto e message2 com apenas o brCode, sem emoji', () => {
    const { message1, message2 } = buildRenewalPixWhatsAppMessage({
      nome: 'João Silva',
      planName: 'ZeloPDV',
      amountCents: 5900,
      brCode: '00020101-BRCODE-XYZ',
    });
    // message1: texto explicativo com nome, plano, valor
    expect(message1).toContain('João');
    expect(message1).toContain('ZeloPDV');
    expect(message1).toContain('59,00');
    // message1 NÃO inclui o brCode (fica na message2)
    expect(message1).not.toContain('00020101-BRCODE-XYZ');
    // message2: apenas o brCode (fácil de copiar)
    expect(message2).toBe('00020101-BRCODE-XYZ');
    // sem emoji: só ASCII + acentos latinos
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(message1)).toBe(false);
  });
});

describe('PIX_EXPIRATION_SECONDS', () => {
  it('vale 3600', () => {
    expect(PIX_EXPIRATION_SECONDS).toBe(3600);
  });
});

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result ?? null, error: null })),
    single: vi.fn(async () => ({ data: result ?? null, error: null })),
  };
  return chain;
}

function makeSupabaseAdmin(state) {
  return {
    rpc: makePixReservationMock(state),
    from: vi.fn((table) => ({
      select: vi.fn(() => makeSelectChain(state.selectResults?.[table] ?? null)),
      insert: vi.fn((payload) => {
        state.writes.push({ table, operation: 'insert', payload });
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: Array.isArray(payload) ? payload[0] : payload, error: null })),
          })),
        };
      }),
      update: vi.fn((payload) => ({
        eq: vi.fn(async () => {
          state.writes.push({ table, operation: 'update', payload });
          return { error: null };
        }),
      })),
    })),
  };
}

describe('syncPixPaymentWithRemote — liquidação Pix atômica', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('delega a liquidação do valor travado para a RPC transacional', async () => {
    const state = {
      writes: [],
      rpcResult: {
        id: 'pay-1',
        status: 'paid',
        paid_at: '2026-07-22T12:00:00Z',
        subscription_id: 'sub-new-1',
      },
    };
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    const { syncPixPaymentWithRemote } = await import('../src/lib/server/billingPix.js');

    const payment = {
      id: 'pay-1', user_id: 'user-1', status: 'pending',
      amount_expected_cents: 14900, plan_tier: 'chat',
      has_mesas_addon: false, has_acessos_addon: false, has_zelo_menu: true,
      external_reference: 'pix_user-1_123', paid_at: null,
    };
    const remotePayment = {
      status: 'PAID', paidAmount: 14900,
      updatedAt: '2026-07-22T12:00:00Z', externalId: 'pix_user-1_123',
    };

    await syncPixPaymentWithRemote({ payment, remotePayment, source: 'test' });

    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('settle_pix_payment');
    expect(state.rpcCalls[0].params).toMatchObject({
      p_payment_id: 'pay-1',
      p_provider_status: 'PAID',
      p_mapped_status: 'paid',
      p_amount_paid_cents: 14900,
      p_external_reference: 'pix_user-1_123',
    });
  });
});

describe('createOrReusePixCharge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('ABACATEPAY_API_KEY', 'abc_dev_test_key');
  });

  async function load(state, chargeImpl) {
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: chargeImpl,
    }));
    return await import('../src/lib/server/billingPix.js');
  }

  it('cria charge nova e insere billing_payments pending com kind subscription_renewal', async () => {
    const state = {
      writes: [],
      selectResults: {
        subscriptions: { id: 'sub-1', status: 'active', current_period_end: '2026-08-01T00:00:00Z' },
        billing_payments: null,
      },
    };
    const charge = vi.fn(async () => ({
      id: 'pix_1', status: 'PENDING', amount: 5900, brCode: 'BR-CODE-1',
      brCodeBase64: 'data:image/png;base64,xx', expiresAt: '2026-07-01T18:00:00Z',
    }));
    const { createOrReusePixCharge } = await load(state, charge);

    const res = await createOrReusePixCharge({
      userId: 'user-1', email: 'u@test.com', planTier: 'pdv',
      addons: { mesas: false, pedidos: false, acessos: false, menu: false },
      name: 'Loja', taxId: '52998224725', phone: '5511999999999', source: 'admin_renewal_pix',
    });

    expect(res.reused).toBe(false);
    expect(charge).toHaveBeenCalledOnce();
    const insert = state.writes.find(w => w.table === 'billing_payments' && w.operation === 'insert');
    expect(insert.payload.status).toBe('pending');
    expect(insert.payload.kind).toBe('subscription_renewal');
    expect(insert.payload.user_id).toBe('user-1');
    expect(insert.payload.subscription_id).toBe('sub-1');
    expect(insert.payload.plan_tier).toBe('pdv');
    expect(insert.payload.amount_expected_cents).toBe(5900);
    expect(insert.payload.metadata.source).toBe('admin_renewal_pix');
    expect(res.row.br_code).toBe('BR-CODE-1');
  });

  it('reusa pending valido com mesma selecao sem criar charge nova', async () => {
    const state = {
      writes: [],
      selectResults: {
        subscriptions: { id: 'sub-1', status: 'active' },
        billing_payments: {
          id: 'pay-existing', status: 'pending', amount_expected_cents: 5900,
          plan_tier: 'pdv', has_mesas_addon: false,
          has_acessos_addon: false, has_zelo_menu: false,
          br_code: 'BR-OLD', qr_code_base64: 'data:x', provider_payment_id: 'pix_old',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
    };
    const charge = vi.fn();
    const { createOrReusePixCharge } = await load(state, charge);

    const res = await createOrReusePixCharge({
      userId: 'user-1', email: 'u@test.com', planTier: 'pdv',
      addons: { mesas: false, pedidos: false, acessos: false, menu: false },
      name: 'Loja', taxId: '52998224725', phone: '5511999999999', source: 'zelo_saas_pix',
    });

    expect(res.reused).toBe(true);
    expect(charge).not.toHaveBeenCalled();
    expect(res.row.id).toBe('pay-existing');
  });
});
