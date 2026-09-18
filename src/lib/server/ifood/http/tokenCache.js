import { DEFAULT_TIMEOUT_MS, IfoodHttpError } from './request.js';

const DEFAULT_BASE_URL = 'https://merchant-api.ifood.com.br';
const DEFAULT_TOKEN_PATH = 'authentication/v1.0/oauth/token';
const DEFAULT_MIN_MARGIN_MS = 5_000;
const DEFAULT_MARGIN_RATIO = 0.1;

function computeExpiresAt(now, expiresInSeconds, { minMarginMs, marginRatio }) {
  const expiresInMs = Math.max(0, Number(expiresInSeconds) * 1000);
  const margin = Math.min(expiresInMs * 0.9, Math.max(minMarginMs, expiresInMs * marginRatio));
  return now + expiresInMs - margin;
}

/**
 * `client_credentials` token cache for the iFood centralized auth flow.
 * There is no hardcoded token lifetime: every renewal reads `expiresIn` from
 * the actual response. Concurrent callers share one in-flight fetch
 * (single-flight), and `invalidate()` lets a 401 caller force a fresh token.
 */
export function createIfoodTokenCache({
  fetch: fetchImpl,
  clock = () => Date.now(),
  clientId,
  clientSecret,
  baseUrl = DEFAULT_BASE_URL,
  tokenPath = DEFAULT_TOKEN_PATH,
  minMarginMs = DEFAULT_MIN_MARGIN_MS,
  marginRatio = DEFAULT_MARGIN_RATIO,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (!clientId || !clientSecret) throw new TypeError('iFood client credentials are required');

  const rootUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const tokenUrl = new URL(String(tokenPath).replace(/^\//, ''), rootUrl);

  let cachedToken = null;
  let expiresAt = 0;
  let inflight = null;

  async function fetchToken() {
    const form = new URLSearchParams({
      grantType: 'client_credentials',
      clientId,
      clientSecret
    });

    // The auth endpoint gets its own timeout, independent of the transport's
    // per-resource timeout, because a hung token fetch would otherwise stall
    // every caller sharing this single-flight promise indefinitely.
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    let response;
    try {
      response = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: form.toString(),
        signal: timeoutController.signal
      });
    } catch {
      // Both a timeout abort and any other network failure map to the same
      // generic, retryable auth failure — neither carries request detail.
      throw new IfoodHttpError({ code: 'IFOOD_AUTH_FAILED', retryable: true });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new IfoodHttpError({ status: response.status, code: 'IFOOD_AUTH_FAILED', retryable });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new IfoodHttpError({ code: 'IFOOD_AUTH_FAILED', retryable: false });
    }

    const accessToken = payload?.accessToken;
    const expiresIn = Number(payload?.expiresIn);
    if (typeof accessToken !== 'string' || !accessToken || !Number.isFinite(expiresIn)) {
      throw new IfoodHttpError({ code: 'IFOOD_AUTH_FAILED', retryable: false });
    }

    return {
      token: accessToken,
      expiresAt: computeExpiresAt(clock(), expiresIn, { minMarginMs, marginRatio })
    };
  }

  async function getToken() {
    const now = clock();
    if (cachedToken && now < expiresAt) return cachedToken;
    if (inflight) return inflight;

    inflight = fetchToken()
      .then((result) => {
        cachedToken = result.token;
        expiresAt = result.expiresAt;
        inflight = null;
        return cachedToken;
      })
      .catch((error) => {
        inflight = null;
        throw error;
      });

    return inflight;
  }

  function invalidate() {
    cachedToken = null;
    expiresAt = 0;
  }

  return { getToken, invalidate };
}

export default createIfoodTokenCache;
