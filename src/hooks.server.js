import { json } from '@sveltejs/kit';

/**
 * In-memory rate limiter for API routes.
 * Resets per IP per route every WINDOW_MS milliseconds.
 * On Vercel, each serverless invocation has its own memory — this is a
 * best-effort guard, not a hard distributed limit. For a hard limit use
 * Vercel's built-in rate limiting or an edge KV store.
 */

const WINDOW_MS = 60 * 1000; // 1 minute

/** Max requests per IP per window for each route prefix */
const LIMITS = {
    '/api/billing/webhook':                   100,
    '/api/stripe/webhook':                    100,
    '/api/billing/create-checkout-session':    10,
    '/api/billing/create-portal-session':      10,
};
const DEFAULT_LIMIT = 300;

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

function getLimit(pathname) {
    for (const [prefix, limit] of Object.entries(LIMITS)) {
        if (pathname.startsWith(prefix)) return limit;
    }
    return DEFAULT_LIMIT;
}

function cleanup(now) {
    if (store.size < 5000) return;
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key);
    }
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    if (event.url.pathname.startsWith('/api/')) {
        const ip = event.getClientAddress();
        const key = `${ip}:${event.url.pathname}`;
        const now = Date.now();
        const limit = getLimit(event.url.pathname);

        let entry = store.get(key);
        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + WINDOW_MS };
        }

        entry.count++;
        store.set(key, entry);
        cleanup(now);

        if (entry.count > limit) {
            return json(
                { error: 'Too many requests. Try again in a minute.' },
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }
    }

    return resolve(event);
}
