import { createRateLimitResponse, enforceRateLimit, getRequestIp } from '$lib/server/rateLimit';

const DEFAULT_LIMIT = { limit: 120, windowMs: 60 * 1000 };

const LIMITS = {
  '/api/billing/webhook': { limit: 200, windowMs: 60 * 1000 },
  '/api/webhooks/abacatepay': { limit: 200, windowMs: 60 * 1000 },
  '/api/billing/create-subscription': { limit: 5, windowMs: 60 * 1000 },
  '/api/billing/pix/create': { limit: 10, windowMs: 60 * 1000 },
  '/api/billing/cancel-subscription': { limit: 5, windowMs: 60 * 1000 },
  '/api/billing/create-checkout-session': { limit: 10, windowMs: 60 * 1000 },
  '/api/billing/create-portal-session': { limit: 10, windowMs: 60 * 1000 },
  '/api/auth/login': { limit: 20, windowMs: 10 * 60 * 1000 },
  '/api/auth/signup': { limit: 10, windowMs: 60 * 60 * 1000 },
  '/api/auth/reset-password': { limit: 10, windowMs: 60 * 60 * 1000 },
  '/api/auth/pin-reset-otp': { limit: 10, windowMs: 60 * 60 * 1000 },
  '/api/chat/support': { limit: 10, windowMs: 60 * 60 * 1000 },
  '/api/chat/assistant': { limit: 60, windowMs: 60 * 60 * 1000 },
  '/api/access/users': { limit: 20, windowMs: 60 * 60 * 1000 },
  '/api/access/roles': { limit: 30, windowMs: 60 * 60 * 1000 },
  '/api/referrals/claim': { limit: 20, windowMs: 60 * 60 * 1000 },
  '/api/referrals/code': { limit: 30, windowMs: 60 * 60 * 1000 },
};

function getLimitConfig(pathname) {
  for (const [prefix, config] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return DEFAULT_LIMIT;
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  if (event.url.pathname.startsWith('/api/')) {
    const ip = getRequestIp({
      request: event.request,
      getClientAddress: () => event.getClientAddress(),
    });
    const config = getLimitConfig(event.url.pathname);
    const result = enforceRateLimit({
      key: `route:${event.url.pathname}:ip:${ip}`,
      logKey: `route:${event.url.pathname}:ip:${ip}`,
      route: event.url.pathname,
      ...config,
    });

    if (!result.ok) {
      return createRateLimitResponse(result);
    }
  }

  return resolve(event);
}
