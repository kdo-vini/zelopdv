// A neutral client bootstrap: no account data is rendered or HTTP-cached.
// With ssr disabled SvelteKit resolves the actual URL in the client router,
// including when Workbox serves this document for /app/mesas/:id.
export const ssr = false;
export const prerender = true;
