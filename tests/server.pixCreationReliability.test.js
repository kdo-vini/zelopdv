import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { makePixReservationMock } from './helpers/pixReservationMock.js';

const input = { userId: '22222222-2222-4222-8222-222222222222', email: 'fixture@invalid.local',
  planTier: 'pdv', addons: {}, name: 'Fixture', taxId: '52998224725', phone: '5511999999999', source: 'test' };
const response = { id: 'fixture-provider', status: 'PENDING', amount: 5900,
  brCode: 'fixture-code', expiresAt: new Date(Date.now() + 3600_000).toISOString() };

async function load(state = { writes: [] }, provider = vi.fn(async () => response), list = vi.fn(async () => [])) {
  const rpc = makePixReservationMock(state);
  vi.doMock('$lib/server/abacatePay', () => ({ isAbacatePayConfigured: () => true,
    createTransparentPixCharge: provider, listTransparentPixCharges: list,
    checkTransparentPixCharge: vi.fn(async () => response),
  }));
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: { rpc,
    from: () => ({ update: updates => {
      const chain = { eq: () => chain, select: () => chain,
        maybeSingle: async () => ({ data: state.changedDuringSync ? null : Object.assign(state.reservation, updates), error: null }) };
      return chain;
    } }),
  } }));
  return { ...await import('../src/lib/server/billingPix.js'), state, provider, rpc, list };
}

beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Pix reservation HTTP orchestration', () => {
  it('confirms the reservation before the only POST and uses its stable reference/metadata', async () => {
    const state = { writes: [] };
    const provider = vi.fn(async data => {
      expect(state.writes[0].payload.creation_state).toBe('dispatching');
      expect(data.externalId).toBe(state.reservation.external_reference);
      expect(data.metadata.paymentId).toBe(state.reservation.id);
      expect(data.metadata.userId).toBe(input.userId);
      return response;
    });
    const client = await load(state, provider);
    await client.createOrReusePixCharge(input);
    expect(provider).toHaveBeenCalledOnce();
    expect(state.reservation.creation_state).toBe('ready');
  });

  it('does not POST when durable reservation cannot be confirmed', async () => {
    const client = await load({ writes: [], reserveError: new Error('Database unavailable') });
    await expect(client.createOrReusePixCharge(input)).rejects.toThrow('Database unavailable');
    expect(client.provider).not.toHaveBeenCalled();
  });

  it('two concurrent requests dispatch once; the other only consults the provider', async () => {
    let release;
    const provider = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const client = await load({ writes: [] }, provider);
    const first = client.createOrReusePixCharge(input);
    await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce());
    await expect(client.createOrReusePixCharge(input)).rejects.toMatchObject({ code: 'PIX_OUTCOME_UNKNOWN', retrySafe: false });
    expect(client.list).toHaveBeenCalledOnce();
    release(response);
    await first;
    expect(provider).toHaveBeenCalledOnce();
  });

  it.each(['transport', 'missing body', 'persist response'])('preserves unknown for %s, and retry never posts again', async kind => {
    const state = { writes: [] };
    const provider = vi.fn(async () => {
      if (kind === 'transport') throw new Error('Connection lost');
      if (kind === 'missing body') return { id: response.id };
      state.completeError = new Error('DB write failed');
      return response;
    });
    const client = await load(state, provider);
    await expect(client.createOrReusePixCharge(input)).rejects.toMatchObject({ code: 'PIX_OUTCOME_UNKNOWN', paymentId: expect.any(String) });
    delete state.completeError;
    await expect(client.createOrReusePixCharge(input)).rejects.toMatchObject({ code: 'PIX_OUTCOME_UNKNOWN' });
    expect(provider).toHaveBeenCalledOnce();
  });

  it('marks a known local pre-dispatch failure not_sent', async () => {
    const client = await load({ writes: [] }, vi.fn(async () => { throw Object.assign(new Error('Invalid config'), { dispatchStarted: false }); }));
    await expect(client.createOrReusePixCharge(input)).rejects.toThrow('Invalid config');
    expect(client.state.reservation.creation_state).toBe('not_sent');
  });

  it('recovers a response lost after POST by stable metadata and amount, without another POST', async () => {
    const client = await load({ writes: [] }, vi.fn(async () => { throw new Error('lost'); }));
    await expect(client.createOrReusePixCharge(input)).rejects.toMatchObject({ code: 'PIX_OUTCOME_UNKNOWN' });
    client.list.mockResolvedValue([{ ...response, metadata: client.state.reservation.metadata }]);
    const recovered = await client.createOrReusePixCharge(input);
    expect(recovered.reused).toBe(true);
    expect(recovered.row.br_code).toBe(response.brCode);
    expect(client.provider).toHaveBeenCalledOnce();
  });

  it.each(['foreign identity', 'wrong amount', 'multiple matches'])('does not attach %s during reconciliation', async kind => {
    const client = await load({ writes: [] }, vi.fn(async () => { throw new Error('lost'); }));
    await expect(client.createOrReusePixCharge(input)).rejects.toThrow();
    const metadata = client.state.reservation.metadata;
    client.list.mockResolvedValue(kind === 'multiple matches' ? [response, response]
      : [{ ...response, amount: kind === 'wrong amount' ? 1 : response.amount,
        metadata: kind === 'foreign identity' ? { ...metadata, userId: 'other' } : metadata }]);
    await expect(client.createOrReusePixCharge(input)).rejects.toMatchObject({ code: 'PIX_RECONCILIATION_CONFLICT' });
    expect(client.state.reservation.provider_payment_id).toBeUndefined();
    expect(client.provider).toHaveBeenCalledOnce();
  });

  it('rejects a stale nonpaid update after settlement changed the row', async () => {
    const client = await load({ writes: [], changedDuringSync: true });
    await expect(client.syncPixPaymentWithRemote({ payment: { id: 'fixture', status: 'pending' }, remotePayment: response })).rejects.toThrow('mudou');
  });

  it('preserves a legacy paid row even when paid_at is null', async () => {
    const client = await load();
    const payment = { id: 'legacy', status: 'paid', paid_at: null };
    await expect(client.syncPixPaymentWithRemote({ payment, remotePayment: response })).resolves.toEqual(payment);
  });
});

describe('AbacatePay deadlines with a real local HTTP body', () => {
  it('bounds a delayed body and marks a POST outcome uncertain, without retry', async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"data":'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    vi.stubEnv('ABACATEPAY_API_KEY', 'fixture');
    vi.stubEnv('ABACATEPAY_BASE_URL', `http://127.0.0.1:${server.address().port}/v2`);
    vi.doUnmock('$lib/server/abacatePay');
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      expect(ms).toBe(15_000); return originalTimeout(50);
    });
    try {
      const { createTransparentPixCharge } = await import('../src/lib/server/abacatePay.js');
      await expect(createTransparentPixCharge({ amount: 5900 })).rejects.toMatchObject({ dispatchStarted: true });
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });

  it('recognizes local configuration failure before any fetch', async () => {
    vi.stubEnv('ABACATEPAY_API_KEY', 'fixture'); vi.stubEnv('ABACATEPAY_BASE_URL', 'invalid base');
    vi.doUnmock('$lib/server/abacatePay');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { createTransparentPixCharge } = await import('../src/lib/server/abacatePay.js');
    await expect(createTransparentPixCharge({ amount: 5900 })).rejects.toMatchObject({ dispatchStarted: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses list externalId with a bounded result page and rejects additional pages', async () => {
    vi.stubEnv('ABACATEPAY_API_KEY', 'fixture'); vi.stubEnv('ABACATEPAY_BASE_URL', 'https://api.invalid/v2');
    vi.doUnmock('$lib/server/abacatePay');
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [response], pagination: { next: 'next' } })));
    vi.stubGlobal('fetch', fetch);
    const { listTransparentPixCharges } = await import('../src/lib/server/abacatePay.js');
    await expect(listTransparentPixCharges('pix_fixture')).rejects.toThrow('Mais de uma');
    expect(fetch.mock.calls[0][0].searchParams.get('externalId')).toBe('pix_fixture');
    expect(fetch.mock.calls[0][0].searchParams.get('limit')).toBe('2');
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });
});
