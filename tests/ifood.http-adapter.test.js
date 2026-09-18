import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIfoodTokenCache } from '../src/lib/server/ifood/http/tokenCache.js';
import { createIfoodRateLimiter, parseRetryAfterMs } from '../src/lib/server/ifood/http/rateLimit.js';
import { createIfoodRequestClient, IfoodHttpError } from '../src/lib/server/ifood/http/request.js';
import { createHttpIfoodAdapter } from '../src/lib/server/ifood/adapters/httpIfoodAdapter.js';

const CLIENT_ID = 'client-id-canary-value';
const CLIENT_SECRET = 'client-secret-canary-value';
const ACCESS_TOKEN = 'access-token-canary-value';

function jsonHeaders(extra = {}) {
  const map = new Map(Object.entries({ 'content-type': 'application/json', ...extra }));
  return {
    get(name) {
      return map.get(String(name).toLowerCase()) ?? null;
    }
  };
}

function makeResponse({ status, jsonBody, headers = {}, textBody } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: jsonHeaders(headers),
    async json() {
      if (jsonBody === undefined) throw new Error('no json body configured');
      return jsonBody;
    },
    async text() {
      if (textBody !== undefined) return textBody;
      if (jsonBody !== undefined) return JSON.stringify(jsonBody);
      return '';
    }
  };
}

function tokenResponse(expiresIn, overrides = {}) {
  return makeResponse({
    status: 200,
    jsonBody: { accessToken: ACCESS_TOKEN, type: 'Bearer', expiresIn, ...overrides }
  });
}

function makeClock(start = 0) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms) => {
    now += ms;
  };
  clock.set = (value) => {
    now = value;
  };
  return clock;
}

describe('createIfoodTokenCache', () => {
  it('honors expiresIn from the token response for cache lifetime', async () => {
    const clock = makeClock();
    const fetchImpl = vi.fn(async () => tokenResponse(100));
    const cache = createIfoodTokenCache({
      fetch: fetchImpl,
      clock,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      minMarginMs: 0,
      marginRatio: 0
    });

    const token = await cache.getToken();
    expect(token).toBe(ACCESS_TOKEN);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock.advance(99_000);
    await cache.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock.advance(2_000);
    await cache.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('renews early inside the configured safety margin', async () => {
    const clock = makeClock();
    const fetchImpl = vi.fn(async () => tokenResponse(100));
    const cache = createIfoodTokenCache({
      fetch: fetchImpl,
      clock,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      minMarginMs: 10_000,
      marginRatio: 0
    });

    await cache.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 95s elapsed of a 100s token with a 10s margin: still inside the margin,
    // so a fresh token must be fetched even though the token has not expired.
    clock.advance(95_000);
    await cache.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares a single in-flight fetch across concurrent callers', async () => {
    const clock = makeClock();
    let resolveFetch;
    const fetchImpl = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const cache = createIfoodTokenCache({
      fetch: fetchImpl,
      clock,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    });

    const calls = [cache.getToken(), cache.getToken(), cache.getToken(), cache.getToken()];
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch(tokenResponse(300));
    const tokens = await Promise.all(calls);
    expect(tokens).toEqual([ACCESS_TOKEN, ACCESS_TOKEN, ACCESS_TOKEN, ACCESS_TOKEN]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces the next call to fetch a fresh token', async () => {
    const clock = makeClock();
    const fetchImpl = vi.fn(async () => tokenResponse(300));
    const cache = createIfoodTokenCache({
      fetch: fetchImpl,
      clock,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    });

    await cache.getToken();
    cache.invalidate();
    await cache.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends grantType/clientId/clientSecret form-urlencoded to the documented token URL', async () => {
    const clock = makeClock();
    let capturedUrl;
    let capturedInit;
    const fetchImpl = vi.fn(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return tokenResponse(60);
    });
    const cache = createIfoodTokenCache({
      fetch: fetchImpl,
      clock,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    });

    await cache.getToken();
    expect(String(capturedUrl)).toBe(
      'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token'
    );
    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(capturedInit.body);
    expect(params.get('grantType')).toBe('client_credentials');
    expect(params.get('clientId')).toBe(CLIENT_ID);
    expect(params.get('clientSecret')).toBe(CLIENT_SECRET);
  });

  it('times out a hung token fetch and reports a sanitized retryable auth failure', async () => {
    vi.useFakeTimers();
    try {
      const clock = makeClock();
      const fetchImpl = vi.fn(
        (url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      );
      const cache = createIfoodTokenCache({
        fetch: fetchImpl,
        clock,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        timeoutMs: 50
      });

      const pending = cache.getToken();
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'IFOOD_AUTH_FAILED',
        retryable: true
      });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createIfoodRateLimiter', () => {
  it('waits until X-RateLimit-Reset when remaining hits zero', async () => {
    const clock = makeClock();
    const sleep = vi.fn(async (ms) => clock.advance(ms));
    const limiter = createIfoodRateLimiter({ clock, sleep });

    limiter.observe(jsonHeaders({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '5' }), 200);
    await limiter.waitForSlot();
    expect(sleep.mock.calls[0][0]).toBe(5_000);
  });

  it('waits for Retry-After after a 429', async () => {
    const clock = makeClock();
    const sleep = vi.fn(async (ms) => clock.advance(ms));
    const limiter = createIfoodRateLimiter({ clock, sleep });

    limiter.observe(jsonHeaders({ 'retry-after': '3' }), 429);
    await limiter.waitForSlot();
    expect(sleep.mock.calls[0][0]).toBe(3_000);
  });

  it('parseRetryAfterMs supports numeric seconds and does not misparse garbage', () => {
    const clock = makeClock(10_000);
    expect(parseRetryAfterMs(jsonHeaders({ 'retry-after': '2' }), clock)).toBe(2_000);
    expect(parseRetryAfterMs(jsonHeaders({}), clock)).toBeNull();
  });
});

describe('createIfoodRequestClient', () => {
  function tokenCacheStub(token = ACCESS_TOKEN) {
    return {
      getToken: vi.fn(async () => token),
      invalidate: vi.fn()
    };
  }

  function rateLimiterStub() {
    return {
      observe: vi.fn(),
      waitForSlot: vi.fn(async () => {})
    };
  }

  it('retries exactly once after 401 by invalidating the token, then fails if still unauthorized', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    const fetchImpl = vi.fn(async () => makeResponse({ status: 401 }));
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep: vi.fn(async () => {}),
      random: () => 0
    });

    await expect(request({ method: 'GET', path: '/merchant/v1.0/merchants' })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_UNAUTHORIZED',
      status: 401,
      retryable: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tokenCache.invalidate).toHaveBeenCalledTimes(1);
  });

  it('succeeds after a single 401 retry once the token is valid again', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return makeResponse({ status: 401 });
      return makeResponse({ status: 200, jsonBody: { ok: true } });
    });
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep: vi.fn(async () => {}),
      random: () => 0
    });

    const result = await request({ method: 'GET', path: '/merchant/v1.0/merchants' });
    expect(result).toEqual({ status: 200, headers: expect.anything(), body: { ok: true } });
    expect(tokenCache.invalidate).toHaveBeenCalledTimes(1);
  });

  it('retries 429 responses honoring Retry-After/X-RateLimit-Reset then succeeds', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = { observe: vi.fn(), waitForSlot: vi.fn(async () => {}) };
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return makeResponse({ status: 429, headers: { 'retry-after': '1' } });
      }
      return makeResponse({ status: 200, jsonBody: { ok: true } });
    });
    const sleep = vi.fn(async () => {});
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep,
      random: () => 0
    });

    const result = await request({ method: 'GET', path: '/merchant/v1.0/merchants' });
    expect(result.body).toEqual({ ok: true });
    expect(sleep.mock.calls[0][0]).toBe(1_000);
    expect(rateLimiter.observe).toHaveBeenCalled();
  });

  it('retries 5xx within the retry budget then fails with a sanitized server error', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    const fetchImpl = vi.fn(async () => makeResponse({ status: 503 }));
    const sleep = vi.fn(async () => {});
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep,
      random: () => 0,
      retryBudgetMs: 1_000,
      maxAttempts: 3
    });

    await expect(request({ method: 'GET', path: '/merchant/v1.0/merchants' })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_SERVER',
      status: 503,
      retryable: true
    });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('fails immediately without retry on a non-retryable 4xx', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    const fetchImpl = vi.fn(async () => makeResponse({ status: 400 }));
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep: vi.fn(async () => {}),
      random: () => 0
    });

    await expect(request({ method: 'GET', path: '/merchant/v1.0/merchants' })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_CLIENT',
      status: 400,
      retryable: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times out via AbortSignal and reports a sanitized timeout error', async () => {
    vi.useFakeTimers();
    try {
      const tokenCache = tokenCacheStub();
      const rateLimiter = rateLimiterStub();
      const fetchImpl = vi.fn(
        (url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      );
      const { request } = createIfoodRequestClient({
        baseUrl: 'https://merchant-api.ifood.com.br',
        fetch: fetchImpl,
        tokenCache,
        rateLimiter,
        sleep: vi.fn(async () => {}),
        random: () => 0,
        timeoutMs: 50,
        retryBudgetMs: 10,
        maxAttempts: 1
      });

      const pending = request({ method: 'GET', path: '/merchant/v1.0/merchants' });
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'IFOOD_HTTP_TIMEOUT',
        retryable: true
      });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not auto-retry an ambiguous POST timeout, since a retry could double-send', async () => {
    vi.useFakeTimers();
    try {
      const tokenCache = tokenCacheStub();
      const rateLimiter = rateLimiterStub();
      const fetchImpl = vi.fn(
        (url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      );
      const { request } = createIfoodRequestClient({
        baseUrl: 'https://merchant-api.ifood.com.br',
        fetch: fetchImpl,
        tokenCache,
        rateLimiter,
        sleep: vi.fn(async () => {}),
        random: () => 0,
        timeoutMs: 50,
        retryBudgetMs: 60_000,
        maxAttempts: 5
      });

      // POST defaults retryUnsafe to false: an ambiguous timeout must not be
      // auto-retried, unlike the earlier GET timeout test.
      const pending = request({
        method: 'POST',
        path: '/order/v1.0/orders/order-fixture-1/confirm'
      });
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'IFOOD_HTTP_TIMEOUT',
        retryable: true
      });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries an ambiguous POST failure when retryUnsafe is explicitly true (e.g. the idempotent ACK)', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return makeResponse({ status: 503 });
      return makeResponse({ status: 202 });
    });
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep: vi.fn(async () => {}),
      random: () => 0
    });

    const result = await request({
      method: 'POST',
      path: '/events/v1.0/events/acknowledgment',
      body: [{ id: 'event-fixture-1' }],
      retryUnsafe: true
    });
    expect(result.status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails fast without sleeping when a 429 delay would exceed the remaining budget', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    const fetchImpl = vi.fn(async () => makeResponse({ status: 429, headers: { 'retry-after': '120' } }));
    const sleep = vi.fn(async () => {});
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep,
      random: () => 0,
      retryBudgetMs: 20_000
    });

    await expect(request({ method: 'GET', path: '/merchant/v1.0/merchants' })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_RATE_LIMITED',
      retryAfterMs: 120_000
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending backoff wait quickly via the caller signal instead of waiting it out', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return makeResponse({ status: 503 });
    });
    const controller = new AbortController();
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      // Real (unfaked) timers: the point of this test is that abort resolves
      // long before the backoff delay itself would elapse.
      random: () => 1,
      retryBudgetMs: 60_000,
      maxAttempts: 5
    });

    const pending = request({
      method: 'GET',
      path: '/merchant/v1.0/merchants',
      signal: controller.signal
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'IFOOD_HTTP_ABORTED',
      retryable: false
    });
    // Give the first fetch/backoff-scheduling microtasks a turn, then abort
    // well before the (up to 250ms) backoff delay would naturally elapse.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await assertion;
    expect(calls).toBe(1);
  });

  it('omits empty query parameters from the request URL', async () => {
    const tokenCache = tokenCacheStub();
    const rateLimiter = rateLimiterStub();
    let capturedUrl;
    const fetchImpl = vi.fn(async (url) => {
      capturedUrl = url;
      return makeResponse({ status: 200, jsonBody: [] });
    });
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache,
      rateLimiter,
      sleep: vi.fn(async () => {}),
      random: () => 0
    });

    await request({
      method: 'GET',
      path: '/events/v1.0/events:polling',
      query: { types: undefined, groups: '', categories: undefined }
    });
    expect(String(capturedUrl)).toBe('https://merchant-api.ifood.com.br/events/v1.0/events:polling');
  });
});

describe('createHttpIfoodAdapter', () => {
  function buildAdapter({ fetchImpl, clock = makeClock(), sleep = vi.fn(async () => {}) } = {}) {
    return createHttpIfoodAdapter({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: fetchImpl,
      clock,
      sleep,
      random: () => 0
    });
  }

  it('sends x-polling-merchants and omits empty filters, returning [] on 204', async () => {
    let tokenCalls = 0;
    let capturedUrl;
    let capturedHeaders;
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/oauth/token')) {
        tokenCalls += 1;
        return tokenResponse(300);
      }
      capturedUrl = url;
      capturedHeaders = init.headers;
      return makeResponse({ status: 204 });
    });
    const adapter = buildAdapter({ fetchImpl });

    const events = await adapter.pollEvents({ merchantIds: ['merchant-fixture-1', 'merchant-fixture-2'] });
    expect(events).toEqual([]);
    expect(tokenCalls).toBe(1);
    expect(String(capturedUrl)).toBe('https://merchant-api.ifood.com.br/events/v1.0/events:polling');
    expect(capturedHeaders['x-polling-merchants']).toBe('merchant-fixture-1,merchant-fixture-2');
  });

  it('dedupes ack ids and posts a list of {id} objects, expecting 202', async () => {
    let capturedBody;
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      capturedBody = init.body;
      return makeResponse({ status: 202 });
    });
    const adapter = buildAdapter({ fetchImpl });

    const result = await adapter.ackEvents(['event-a', 'event-a', 'event-b']);
    expect(result.accepted).toBe(true);
    expect(JSON.parse(capturedBody)).toEqual([{ id: 'event-a' }, { id: 'event-b' }]);
  });

  it('ackEvents retries an ambiguous 5xx (idempotent) and still succeeds', async () => {
    let nonTokenCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      nonTokenCalls += 1;
      if (nonTokenCalls === 1) return makeResponse({ status: 503 });
      return makeResponse({ status: 202 });
    });
    const adapter = buildAdapter({ fetchImpl });

    const result = await adapter.ackEvents(['event-a']);
    expect(result.accepted).toBe(true);
    expect(nonTokenCalls).toBe(2);
  });

  it('confirm() does not auto-retry an ambiguous timeout (unlike the idempotent ACK)', async () => {
    vi.useFakeTimers();
    try {
      let nonTokenCalls = 0;
      const fetchImpl = vi.fn((url, init) => {
        if (String(url).includes('/oauth/token')) return Promise.resolve(tokenResponse(300));
        nonTokenCalls += 1;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });
      const adapter = createHttpIfoodAdapter({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        fetch: fetchImpl,
        clock: makeClock(),
        sleep: vi.fn(async () => {}),
        random: () => 0,
        timeoutMs: 50,
        retryBudgetMs: 60_000
      });

      const pending = adapter.confirm('order-fixture-1');
      const assertion = expect(pending).rejects.toMatchObject({ code: 'IFOOD_HTTP_TIMEOUT', retryable: true });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
      expect(nonTokenCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirm() on 202 returns accepted_http without claiming commercial confirmation', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 202 });
    });
    const adapter = buildAdapter({ fetchImpl });

    const result = await adapter.confirm('order-fixture-1');
    expect(result).toEqual({
      orderId: 'order-fixture-1',
      action: 'confirm',
      accepted: true,
      status: 'accepted_http'
    });
  });

  it('requestOrderAction dispatches to the matching adapter method', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 202 });
    });
    const adapter = buildAdapter({ fetchImpl });

    const result = await adapter.requestOrderAction({ orderId: 'order-fixture-1', action: 'dispatch' });
    expect(result.action).toBe('dispatch');
    expect(result.status).toBe('accepted_http');
  });

  it('surfaces getOrder 404 as a retryable-flagged error rather than crashing', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 404 });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.getOrder('order-fixture-missing')).rejects.toMatchObject({
      code: 'IFOOD_HTTP_NOT_FOUND',
      status: 404,
      retryable: true
    });
  });

  it('url-encodes ids and rejects empty ids before making a request', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 200, jsonBody: {} });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.getMerchantStatus('')).rejects.toThrow();
    await expect(adapter.getMerchantStatus('   ')).rejects.toThrow();

    let capturedUrl;
    const fetchImpl2 = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      capturedUrl = url;
      return makeResponse({ status: 200, jsonBody: {} });
    });
    const adapter2 = buildAdapter({ fetchImpl: fetchImpl2 });
    await adapter2.getMerchantStatus('merchant fixture/weird');
    expect(String(capturedUrl)).toBe(
      'https://merchant-api.ifood.com.br/merchant/v1.0/merchants/merchant%20fixture%2Fweird/status'
    );
  });

  it('connectMerchant reports connected:true on a 200 from the per-merchant status route (not listMerchants)', async () => {
    let capturedUrl;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      capturedUrl = url;
      return makeResponse({ status: 200, jsonBody: { available: true } });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.connectMerchant({ merchantId: 'merchant-fixture-1' })).resolves.toEqual({
      merchantId: 'merchant-fixture-1',
      connected: true
    });
    expect(String(capturedUrl)).toBe(
      'https://merchant-api.ifood.com.br/merchant/v1.0/merchants/merchant-fixture-1/status'
    );
  });

  it('connectMerchant reports connected:false on a 403 (not this app\'s merchant)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 403 });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.connectMerchant({ merchantId: 'merchant-fixture-foreign' })).resolves.toEqual({
      merchantId: 'merchant-fixture-foreign',
      connected: false
    });
  });

  it('connectMerchant reports connected:false on a 404 (merchant does not exist)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 404 });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.connectMerchant({ merchantId: 'merchant-fixture-missing' })).resolves.toEqual({
      merchantId: 'merchant-fixture-missing',
      connected: false
    });
  });

  it('connectMerchant propagates a 503 instead of reporting connected:false, so an outage is never mistaken for disconnection', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      return makeResponse({ status: 503 });
    });
    const adapter = buildAdapter({ fetchImpl });

    await expect(adapter.connectMerchant({ merchantId: 'merchant-fixture-1' })).rejects.toMatchObject({
      code: 'IFOOD_HTTP_SERVER',
      status: 503,
      retryable: true
    });
  });

  it('never leaks credentials, tokens, or Authorization in serialized errors', async () => {
    const scenarios = [
      { status: 401 },
      { status: 401 },
      { status: 429, headers: { 'retry-after': '1' } },
      { status: 503 }
    ];
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/oauth/token')) return tokenResponse(300);
      const next = scenarios.shift();
      return makeResponse(next ?? { status: 503 });
    });
    const adapter = createHttpIfoodAdapter({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: fetchImpl,
      clock: makeClock(),
      sleep: vi.fn(async () => {}),
      random: () => 0,
      retryBudgetMs: 50,
      maxAttempts: 2
    });

    let caught;
    try {
      await adapter.listMerchants();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();

    const secretMarkers = [CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN, 'Bearer', 'Authorization'];
    const serializedForms = [
      JSON.stringify(caught),
      String(caught),
      caught.message,
      caught.stack ?? '',
      JSON.stringify(Object.keys(caught))
    ];
    for (const form of serializedForms) {
      for (const marker of secretMarkers) {
        expect(form.includes(marker)).toBe(false);
      }
    }
    expect(Object.keys(caught).sort()).toEqual(
      [...new Set(['status', 'code', 'retryable', ...Object.keys(caught)])].sort()
    );
  });
});
