# New Update Available System Audit Report

## Implementation Details

- Added build-version generation in `vite.config.js`.
- Added shared `APP_VERSION` export in `src/lib/version.js`.
- Added no-cache deployment version endpoint at `src/routes/api/version/+server.js`.
- Added `src/lib/components/UpdateAvailable.svelte` and mounted it globally from `src/routes/+layout.svelte`.
- The client polls `/api/version`, compares the remote deployment version with the current bundle version, and shows a subtle update toast only when they differ.
- The detector also integrates with Vite PWA service-worker refresh signals and validates those signals through `/api/version`.
- Cross-tab behavior uses `BroadcastChannel` so one tab detecting or deferring an update keeps other open tabs aligned.
- Critical flows are protected by delaying the prompt while text entry, modal dialogs, active POS sales, and order editor pages are detected.
- Refresh protection uses `sessionStorage` to suppress repeated prompts after a reload that did not yet pick up the new bundle.
- The refresh action updates the service worker where possible, clears app-level Workbox/SvelteKit/Vite-PWA caches, and reloads with an `appVersion` cache-busting query parameter.

## Affected Files

- `vite.config.js`
- `src/lib/version.js`
- `src/routes/api/version/+server.js`
- `src/lib/components/UpdateAvailable.svelte`
- `src/routes/+layout.svelte`
- `memory.md`
- `audit-report.md`

## Risks

- Critical-flow detection is intentionally conservative and heuristic. It protects the known POS flow through `sessionStorage.zelo_comanda`, modal detection, focused form fields, and order editor routes, but future workflows should add `data-update-blocking="true"` around any long-running critical surface.
- If a deployment platform does not provide a stable build identifier and `PUBLIC_APP_VERSION` is not set, the timestamp fallback changes per build, which is correct for detection but less useful for tracing incidents.
- Clearing app caches is scoped to names matching Workbox/SvelteKit/Vite-PWA. If a future service worker uses different cache names, refresh will still navigate but cache cleanup may need an update.
- A user who chooses "Later" will not see the same version again for two hours in that browser profile.

## Future Improvements

- Add an explicit `updateBlocking` Svelte store so checkout, ZeloChat typing, and order modules can declare critical state directly instead of relying only on DOM/session heuristics.
- Surface a compact build hash in an internal diagnostics page to help support confirm the active frontend version.
- Add Playwright coverage that stubs `/api/version` and validates prompt deferral during an active sale.
- Consider sending lightweight analytics events for update detected, later, and refresh clicked to measure stale-client duration in production.
