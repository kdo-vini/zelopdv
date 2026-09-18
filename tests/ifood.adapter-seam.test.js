import { describe, expect, it, vi } from 'vitest';
import { createIfoodIntegration } from '../src/lib/server/ifood/createIfoodIntegration.js';
import { createMockIfoodAdapter } from '../src/lib/server/ifood/adapters/mockIfoodAdapter.js';
import { createHttpIfoodAdapter } from '../src/lib/server/ifood/adapters/httpIfoodAdapter.js';

// `createIfoodIntegration` (src/lib/server/ifood/createIfoodIntegration.js) is
// the seam every adapter must satisfy: it calls `adapter.connectMerchant`,
// `adapter.requestOrderAction`, and `adapter.pollEvents` (via
// `reconcileEvents`). Before this test existed, `httpIfoodAdapter` had no
// `connectMerchant`, so `integration.connectMerchant` would throw
// `TypeError: iFood adapter does not implement connectMerchant` against the
// real adapter even though the same call worked fine against the mock. This
// test runs the same integration operations against both adapters so that
// gap cannot silently reopen.

const MERCHANT_ID = 'merchant-fixture-seam';

function jsonHeaders(extra = {}) {
  const map = new Map(Object.entries({ 'content-type': 'application/json', ...extra }));
  return { get: (name) => map.get(String(name).toLowerCase()) ?? null };
}

function makeResponse({ status, jsonBody } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: jsonHeaders(),
    async json() {
      return jsonBody;
    },
    async text() {
      return jsonBody === undefined ? '' : JSON.stringify(jsonBody);
    }
  };
}

function buildFakeFetchHttpAdapter({ merchantStatusCode = 200 } = {}) {
  const fetchImpl = vi.fn(async (url, init) => {
    const href = String(url);
    if (href.includes('/oauth/token')) {
      return makeResponse({ status: 200, jsonBody: { accessToken: 'seam-token', type: 'Bearer', expiresIn: 300 } });
    }
    // connectMerchant uses the per-merchant status route, not the
    // (possibly paginated) merchants list — see httpIfoodAdapter.js.
    if (href.includes(`/merchant/v1.0/merchants/${MERCHANT_ID}/status`)) {
      return makeResponse({ status: merchantStatusCode, jsonBody: merchantStatusCode === 200 ? { available: true } : undefined });
    }
    if (href.includes('/merchant/v1.0/merchants') && init.method === 'GET') {
      return makeResponse({ status: 200, jsonBody: [{ id: MERCHANT_ID }] });
    }
    if (href.includes('/confirm')) {
      return makeResponse({ status: 202 });
    }
    if (href.includes('/events:polling')) {
      return makeResponse({ status: 204 });
    }
    throw new Error(`unexpected fetch in seam test: ${init.method} ${href}`);
  });

  return createHttpIfoodAdapter({
    clientId: 'seam-client-id',
    clientSecret: 'seam-client-secret',
    fetch: fetchImpl,
    sleep: vi.fn(async () => {}),
    random: () => 0
  });
}

function buildMockAdapter() {
  return createMockIfoodAdapter({
    merchants: [{ id: MERCHANT_ID }],
    responses: {
      connectMerchant: { merchantId: MERCHANT_ID, connected: true }
    },
    actionResult: { orderId: 'order-fixture-seam', action: 'confirm', accepted: true, status: 'accepted_http' }
  });
}

const adapters = [
  ['mockIfoodAdapter', buildMockAdapter],
  ['httpIfoodAdapter (fake fetch)', buildFakeFetchHttpAdapter]
];

describe.each(adapters)('createIfoodIntegration against %s', (_name, buildAdapter) => {
  function buildIntegration() {
    return createIfoodIntegration({
      adapter: buildAdapter(),
      repository: {},
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });
  }

  it('connectMerchant reports the same { merchantId, connected } shape', async () => {
    const integration = buildIntegration();
    await expect(integration.connectMerchant({ merchantId: MERCHANT_ID })).resolves.toEqual({
      merchantId: MERCHANT_ID,
      connected: true
    });
  });

  it('requestOrderAction reports accepted_http for a confirm action', async () => {
    const integration = buildIntegration();
    await expect(
      integration.requestOrderAction({ orderId: 'order-fixture-seam', action: 'confirm' })
    ).resolves.toMatchObject({ accepted: true, status: 'accepted_http' });
  });

  it('reconcileEvents (pollEvents) returns an array, empty when there is nothing to poll', async () => {
    const integration = buildIntegration();
    await expect(
      integration.reconcileEvents({ merchantIds: [MERCHANT_ID] })
    ).resolves.toEqual([]);
  });
});

describe('createIfoodIntegration.connectMerchant against httpIfoodAdapter (fake fetch) — status mapping', () => {
  function buildIntegration(merchantStatusCode) {
    return createIfoodIntegration({
      adapter: buildFakeFetchHttpAdapter({ merchantStatusCode }),
      repository: {},
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });
  }

  it('200 -> connected: true', async () => {
    const integration = buildIntegration(200);
    await expect(integration.connectMerchant({ merchantId: MERCHANT_ID })).resolves.toEqual({
      merchantId: MERCHANT_ID,
      connected: true
    });
  });

  it('403 -> connected: false', async () => {
    const integration = buildIntegration(403);
    await expect(integration.connectMerchant({ merchantId: MERCHANT_ID })).resolves.toEqual({
      merchantId: MERCHANT_ID,
      connected: false
    });
  });

  it('404 -> connected: false', async () => {
    const integration = buildIntegration(404);
    await expect(integration.connectMerchant({ merchantId: MERCHANT_ID })).resolves.toEqual({
      merchantId: MERCHANT_ID,
      connected: false
    });
  });

  it('503 -> throws instead of reporting connected: false (an outage is never mistaken for disconnection)', async () => {
    const integration = buildIntegration(503);
    await expect(integration.connectMerchant({ merchantId: MERCHANT_ID })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_SERVER',
      status: 503,
      retryable: true
    });
  });
});
