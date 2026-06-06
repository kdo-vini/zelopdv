import { createRateLimitResponse, enforceRateLimit, getRequestIp } from '$lib/server/rateLimit';

const DEFAULT_LIMIT = { limit: 120, windowMs: 60 * 1000 };

const ADMIN_API_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

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

function getAdminCorsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin || !ADMIN_API_ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('access-control-request-headers') || 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const isAdminApi = event.url.pathname.startsWith('/api/admin/');
  const adminCorsHeaders = isAdminApi ? getAdminCorsHeaders(event.request) : null;

  if (isAdminApi && event.request.method === 'OPTIONS') {
    return new Response(null, {
      status: adminCorsHeaders ? 204 : 403,
      headers: adminCorsHeaders || {},
    });
  }

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
      const response = createRateLimitResponse(result);
      if (adminCorsHeaders) {
        for (const [key, value] of Object.entries(adminCorsHeaders)) {
          response.headers.set(key, value);
        }
      }
      return response;
    }
  }

  const response = await resolve(event);
  if (adminCorsHeaders) {
    for (const [key, value] of Object.entries(adminCorsHeaders)) {
      response.headers.set(key, value);
    }
  }
  return response;
}
