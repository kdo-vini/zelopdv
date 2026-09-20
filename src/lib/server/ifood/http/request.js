import { abortableSleep, parseRetryAfterMs } from './rateLimit.js';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_BUDGET_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_CAP_MS = 8_000;
const DEFAULT_BACKOFF_BASE_MS = 250;

export { DEFAULT_TIMEOUT_MS };

/**
 * The only shape callers ever see for a failed iFood HTTP call. It never
 * carries request headers, Authorization, tokens, client credentials, query
 * strings with ids, or the response body — only enough for the caller to
 * decide whether to retry.
 */
export class IfoodHttpError extends Error {
  constructor({ status = null, code, retryable = false, retryAfterMs } = {}) {
    super('iFood HTTP request failed');
    this.name = 'IfoodHttpError';
    this.status = status;
    this.code = code;
    this.retryable = Boolean(retryable);
    if (retryAfterMs !== undefined && retryAfterMs !== null) {
      this.retryAfterMs = retryAfterMs;
    }
  }
}

function codeForClientStatus(status) {
  if (status === 401) return 'IFOOD_HTTP_UNAUTHORIZED';
  // Keep the numeric status in the code so operators/UI can map 412 vs 400
  // without reading a response body (bodies stay off the error object).
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return `IFOOD_HTTP_${status}`;
  }
  return 'IFOOD_HTTP_CLIENT';
}

function isAbortSignalError(error) {
  return error?.name === 'AbortError';
}

function abortedError() {
  return new IfoodHttpError({ code: 'IFOOD_HTTP_ABORTED', retryable: false });
}

function remainingBudgetMs(startedAt, clock, retryBudgetMs) {
  return retryBudgetMs - (clock() - startedAt);
}

/**
 * Low-level transport for the iFood merchant API: base URL resolution,
 * Bearer auth from an injected token cache, per-request timeout via
 * AbortSignal, exactly one retry after 401 (invalidating the cached token),
 * and bounded exponential-backoff-with-jitter retries for 429/5xx/timeout/
 * network failures. Non-retryable 4xx responses fail on the first attempt.
 *
 * Ambiguous outcomes (timeout, network error, 5xx — the request may or may
 * not have been processed by the server) are only auto-retried when the
 * call is idempotent. `retryUnsafe` controls this per call and defaults to
 * `true` for GET and `false` for every other method, so a POST like
 * `requestCancellation` never gets silently double-sent by this transport;
 * an explicit `429`/`401` is not ambiguous (the server did respond) and
 * always follows its own retry rule regardless of `retryUnsafe`.
 *
 * Every wait (rate-limit gating and backoff) accepts the caller's `signal`
 * so it can be cancelled without waiting out the full delay; an abort during
 * a wait or a fetch surfaces as a non-retryable `IFOOD_HTTP_ABORTED`.
 */
export function createIfoodRequestClient({
  baseUrl,
  fetch: fetchImpl,
  tokenCache,
  rateLimiter,
  clock = () => Date.now(),
  sleep = abortableSleep,
  random = Math.random,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryBudgetMs = DEFAULT_RETRY_BUDGET_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
} = {}) {
  if (!baseUrl) throw new TypeError('baseUrl is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (!tokenCache || typeof tokenCache.getToken !== 'function') {
    throw new TypeError('tokenCache is required');
  }

  const rootUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  function buildUrl(path, query) {
    const url = new URL(String(path).replace(/^\//, ''), rootUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, value);
      }
    }
    return url;
  }

  function backoffDelayMs(attempt, retryAfterMs) {
    if (typeof retryAfterMs === 'number' && retryAfterMs >= 0) return retryAfterMs;
    const cap = Math.min(DEFAULT_BACKOFF_CAP_MS, DEFAULT_BACKOFF_BASE_MS * 2 ** attempt);
    return Math.floor(random() * cap);
  }

  /**
   * Sleep for `delayMs` respecting the retry budget: if the delay would not
   * fit in what remains of the budget, this returns `false` immediately
   * without sleeping at all, so the caller can fail fast instead of waiting
   * out a delay it was always going to abandon (e.g. a 120s Retry-After
   * against a 20s budget). Returns `true` once the wait completed. Rejects
   * with an aborted `IfoodHttpError` if `signal` fires during the wait.
   */
  async function waitBoundedByBudget({ attempt, delayMs, startedAt, signal }) {
    if (attempt >= maxAttempts) return false;
    const remaining = remainingBudgetMs(startedAt, clock, retryBudgetMs);
    if (remaining <= 0 || delayMs > remaining) return false;
    try {
      await sleep(delayMs, signal);
    } catch (error) {
      if (isAbortSignalError(error)) throw abortedError();
      throw error;
    }
    return true;
  }

  async function performFetch(url, init, perTimeoutMs) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), perTimeoutMs);
    const signals = init.signal ? [init.signal, timeoutController.signal] : [timeoutController.signal];
    const combinedSignal = typeof AbortSignal.any === 'function' ? AbortSignal.any(signals) : timeoutController.signal;
    try {
      return await fetchImpl(url, { ...init, signal: combinedSignal });
    } catch (error) {
      if (timeoutController.signal.aborted) {
        throw new IfoodHttpError({ code: 'IFOOD_HTTP_TIMEOUT', retryable: true });
      }
      if (init.signal?.aborted) {
        throw abortedError();
      }
      throw new IfoodHttpError({ code: 'IFOOD_HTTP_NETWORK', retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBody(response) {
    if (response.status === 204) return null;
    if (typeof response.text !== 'function') return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function request({
    method = 'GET',
    path,
    query,
    headers = {},
    body,
    signal,
    timeoutMs: perCallTimeoutMs,
    retryUnsafe
  }) {
    if (!path) throw new TypeError('path is required');
    if (signal?.aborted) throw abortedError();

    const url = buildUrl(path, query);
    const effectiveTimeoutMs = perCallTimeoutMs ?? timeoutMs;
    const startedAt = clock();
    // Ambiguous failures (timeout/network/5xx) are only safe to retry
    // automatically for idempotent calls. GET is idempotent by default;
    // every other method must opt in explicitly (e.g. the ACK endpoint).
    const allowAmbiguousRetry = retryUnsafe ?? (method.toUpperCase() === 'GET');
    let retriedAuth = false;
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (rateLimiter && typeof rateLimiter.waitForSlot === 'function') {
        try {
          await rateLimiter.waitForSlot(signal);
        } catch (error) {
          if (isAbortSignalError(error)) throw abortedError();
          throw error;
        }
      }

      const token = await tokenCache.getToken();
      const init = {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal
      };

      let response;
      try {
        response = await performFetch(url, init, effectiveTimeoutMs);
      } catch (error) {
        if (error instanceof IfoodHttpError && error.retryable && allowAmbiguousRetry) {
          const delayMs = backoffDelayMs(attempt);
          const waited = await waitBoundedByBudget({ attempt, delayMs, startedAt, signal });
          if (waited) {
            attempt += 1;
            continue;
          }
        }
        throw error;
      }

      if (rateLimiter && typeof rateLimiter.observe === 'function') {
        rateLimiter.observe(response.headers, response.status);
      }

      if (response.status === 401) {
        if (!retriedAuth) {
          retriedAuth = true;
          if (typeof tokenCache.invalidate === 'function') tokenCache.invalidate();
          continue;
        }
        throw new IfoodHttpError({ status: 401, code: codeForClientStatus(401), retryable: false });
      }

      if (response.status === 429) {
        // A 429 is an explicit response (the request was not processed), so
        // it always follows its own retry rule regardless of retryUnsafe.
        const retryAfterMs = parseRetryAfterMs(response.headers, clock);
        const delayMs = backoffDelayMs(attempt, retryAfterMs);
        const waited = await waitBoundedByBudget({ attempt, delayMs, startedAt, signal });
        if (waited) {
          attempt += 1;
          continue;
        }
        throw new IfoodHttpError({
          status: 429,
          code: 'IFOOD_HTTP_RATE_LIMITED',
          retryable: true,
          ...(retryAfterMs !== null ? { retryAfterMs } : {})
        });
      }

      if (response.status >= 500) {
        if (allowAmbiguousRetry) {
          const delayMs = backoffDelayMs(attempt);
          const waited = await waitBoundedByBudget({ attempt, delayMs, startedAt, signal });
          if (waited) {
            attempt += 1;
            continue;
          }
        }
        throw new IfoodHttpError({ status: response.status, code: 'IFOOD_HTTP_SERVER', retryable: true });
      }

      if (response.status >= 400) {
        throw new IfoodHttpError({ status: response.status, code: codeForClientStatus(response.status), retryable: false });
      }

      const parsedBody = await readBody(response);
      return { status: response.status, headers: response.headers, body: parsedBody };
    }
  }

  return { request };
}

export default createIfoodRequestClient;
