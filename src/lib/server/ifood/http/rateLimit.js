function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeAbortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Default sleep used whenever a caller does not inject one. It resolves
 * after `ms`, or rejects immediately (without waiting out the delay) if the
 * given `signal` aborts first, so a caller can cancel an in-flight wait.
 */
export function abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(makeAbortError());
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      cleanup();
      reject(makeAbortError());
    }

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * `Retry-After` is either an integer number of seconds or an HTTP-date. Both
 * forms are supported; anything else yields null rather than a made-up wait.
 */
export function parseRetryAfterMs(headers, clock = () => Date.now()) {
  const raw = headerValue(headers, 'retry-after');
  if (raw === null || raw === undefined || raw === '') return null;
  const trimmed = String(raw).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    const diff = parsedDate - clock();
    return diff > 0 ? diff : 0;
  }
  return null;
}

/**
 * Observes `Retry-After` and `X-RateLimit-*` response headers and computes
 * how long the next call must wait. There is no hardcoded per-endpoint
 * numeric limit here — the iFood contract snapshot documents that those
 * numbers are not homologated for this account, so only what the server
 * actually reports is honored.
 */
export function createIfoodRateLimiter({ clock = () => Date.now(), sleep } = {}) {
  let remaining = null;
  let resetAt = null;
  let retryUntil = null;

  function observe(headers, status) {
    const remainingHeader = numberOrNull(headerValue(headers, 'x-ratelimit-remaining'));
    const resetHeader = numberOrNull(headerValue(headers, 'x-ratelimit-reset'));

    if (remainingHeader !== null) remaining = remainingHeader;
    if (resetHeader !== null) resetAt = clock() + Math.max(0, resetHeader) * 1000;

    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(headers, clock);
      const fallbackMs = resetHeader !== null ? Math.max(0, resetHeader) * 1000 : 1000;
      retryUntil = clock() + (retryAfterMs ?? fallbackMs);
    }
  }

  function waitMs() {
    const now = clock();
    let wait = 0;
    if (retryUntil !== null && retryUntil > now) wait = Math.max(wait, retryUntil - now);
    if (remaining !== null && remaining <= 0 && resetAt !== null && resetAt > now) {
      wait = Math.max(wait, resetAt - now);
    }
    return wait;
  }

  /** `signal` lets a caller cancel a pending rate-limit wait (e.g. shutdown). */
  async function waitForSlot(signal) {
    const wait = waitMs();
    if (wait <= 0) return;
    if (typeof sleep === 'function') await sleep(wait, signal);
    else await abortableSleep(wait, signal);
  }

  return {
    observe,
    waitForSlot,
    waitMs,
    getState: () => ({ remaining, resetAt, retryUntil })
  };
}

export default createIfoodRateLimiter;
