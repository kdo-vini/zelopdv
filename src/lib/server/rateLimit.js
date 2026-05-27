import { json } from '@sveltejs/kit';

const DEFAULT_MAX_ENTRIES = 10_000;
const store = new Map();

function cleanupExpired(now) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function trimStore(now) {
  if (store.size < DEFAULT_MAX_ENTRIES) return;
  cleanupExpired(now);

  if (store.size < DEFAULT_MAX_ENTRIES) return;

  const orderedEntries = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  const removeCount = Math.ceil(orderedEntries.length * 0.1);
  for (const [key] of orderedEntries.slice(0, removeCount)) {
    store.delete(key);
  }
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function maskEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return '';

  const [local, domain] = normalized.split('@');
  const maskedLocal = local.length <= 2
    ? `${local[0] || '*'}*`
    : `${local.slice(0, 2)}***`;

  return `${maskedLocal}@${domain}`;
}

export function getRequestIp({ request, getClientAddress } = {}) {
  try {
    const ip = typeof getClientAddress === 'function' ? getClientAddress() : '';
    if (ip) return ip;
  } catch {
    // Fall through to headers.
  }

  const forwardedFor = request?.headers?.get?.('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  const realIp = request?.headers?.get?.('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

export function buildRateLimitKey(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== '')
    .map((part) => String(part).trim().toLowerCase())
    .join(':');
}

export function consumeRateLimit({ key, limit, windowMs, now = Date.now() }) {
  if (!key) throw new Error('Rate limit key is required.');
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('Rate limit must be > 0.');
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Rate limit window must be > 0.');

  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
  }

  entry.count += 1;
  store.set(key, entry);
  trimStore(now);

  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - entry.count);

  return {
    key,
    limit,
    windowMs,
    count: entry.count,
    remaining,
    resetAt: entry.resetAt,
    retryAfter,
    ok: entry.count <= limit,
  };
}

export function createRateLimitResponse(result, message = 'Muitas tentativas. Aguarde um instante e tente novamente.') {
  return json(
    {
      error: message,
      code: 'rate_limited',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
      },
    },
  );
}

export function enforceRateLimit(options) {
  const result = consumeRateLimit(options);
  if (!result.ok) {
    console.warn('[rate-limit]', {
      route: options.route || 'unknown',
      key: options.logKey || options.key,
      limit: options.limit,
      windowMs: options.windowMs,
      retryAfter: result.retryAfter,
    });
  }
  return result;
}

export function resetRateLimitStoreForTests() {
  store.clear();
}
