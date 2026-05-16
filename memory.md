# Update and Versioning Architecture

Zelo PDV exposes a build-scoped frontend version through `src/lib/version.js`.
`vite.config.js` defines `__ZELO_BUILD_VERSION__` for both client and server bundles using, in order:

- `PUBLIC_APP_VERSION`
- `VITE_PUBLIC_APP_VERSION`
- `VERCEL_GIT_COMMIT_SHA`
- `VERCEL_DEPLOYMENT_ID`
- `package.json` version plus build timestamp

The current deployment version is served by `GET /api/version`.
That endpoint returns JSON with `version` and `checkedAt`, and sends strict `no-store` cache headers so browsers, CDNs, and service workers do not reuse stale version data.

The root layout mounts `src/lib/components/UpdateAvailable.svelte`.
That component:

- polls `/api/version` after startup, on focus/visibility/online events, and on a regular interval;
- compares the deployed version with the client bundle's embedded `APP_VERSION`;
- listens for Vite PWA service-worker `onNeedRefresh` events and confirms them through `/api/version`;
- uses `BroadcastChannel` to share update availability, refresh, and "Later" decisions across tabs;
- defers the notification while a user is typing, a modal is open, a POS sale has items in `sessionStorage.zelo_comanda`, or an order editor route is active;
- stores refresh guards in `sessionStorage` to avoid repeated prompts after a failed/stale reload;
- stores "Later" deferrals in `localStorage` for the specific target version.

The refresh action asks the service worker to update when available, clears Workbox/SvelteKit/Vite-PWA app caches, and reloads the current URL with an `appVersion` query parameter for a cache-busting navigation.

Important operational note: on Vercel, the best production identifier is `VERCEL_GIT_COMMIT_SHA`; manual or non-Git deployments can set `PUBLIC_APP_VERSION` explicitly.
