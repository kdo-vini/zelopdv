/**
 * Zelo Design System — which surface a route renders on.
 *
 *  - `app`    internal system: light surfaces, navy actions
 *  - `brand`  what the end customer sees before logging in: navy, white actions
 *  - `legacy` the pre-Zelo dark theme, kept until each area is migrated
 *
 * The surface is written to `<html data-surface>` on the server (hooks.server.js)
 * and kept in sync on client navigations (+layout.svelte), so there is no flash.
 * See docs/DESIGN_SYSTEM.md → "Superfícies" and "Migração".
 */

export const SURFACE_COOKIE = 'zelo_ui';
export const SURFACE_PREVIEW_VALUE = 'v2';
export const SURFACE_QUERY_PARAM = 'tema';

/** Route prefixes that belong to the internal system. Mirrors `sidebarLayoutPrefixes` in +layout.svelte plus the PWA offline shell. */
export const APP_SURFACE_PREFIXES = Object.freeze([
  '/app',
  '/gestao',
  '/relatorios',
  '/perfil',
  '/assinatura',
  '/ferramentas',
  '/offline-shell',
]);

/**
 * Surfaces already live for everyone. A surface that is not live renders as
 * `legacy` unless the visitor opted into the preview (`?tema=novo`).
 * Phase 2 turns `brand` on; phase 6 turns `app` on and removes `legacy`.
 */
export const LIVE_SURFACES = Object.freeze({ brand: false, app: false });

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`);
}

/** @param {string} pathname @returns {'app' | 'brand'} */
export function surfaceForPath(pathname = '/') {
  const path = pathname || '/';
  return APP_SURFACE_PREFIXES.some((prefix) => matchesPrefix(path, prefix)) ? 'app' : 'brand';
}

/**
 * @param {{ pathname: string, preview?: boolean, live?: { brand: boolean, app: boolean } }} input
 * @returns {'app' | 'brand' | 'legacy'}
 */
export function resolveSurface({ pathname, preview = false, live = LIVE_SURFACES }) {
  const target = surfaceForPath(pathname);
  return preview || live[target] ? target : 'legacy';
}

/**
 * Reads the `?tema=` query value. `novo` opts in, `atual` opts out.
 * @param {string | null | undefined} value
 * @returns {'on' | 'off' | null}
 */
export function previewFromQuery(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'novo' || normalized === 'v2') return 'on';
  if (normalized === 'atual' || normalized === 'legado') return 'off';
  return null;
}

/** @param {string | null | undefined} cookieValue */
export function previewFromCookie(cookieValue) {
  return cookieValue === SURFACE_PREVIEW_VALUE;
}

/** `dark` class kept on <html> for legacy `dark:` utilities; only dark surfaces carry it. */
export function htmlClassForSurface(surface) {
  return surface === 'app' ? '' : 'dark';
}

/**
 * Client-side sync after SvelteKit navigations (the server already set the
 * first paint). Pages can pin a subtree with their own `data-surface`.
 * @param {Document} doc
 * @param {string} pathname
 */
export function applySurfaceToDocument(doc, pathname) {
  if (!doc?.documentElement) return;
  const match = doc.cookie.match(new RegExp(`(?:^|; )${SURFACE_COOKIE}=([^;]*)`));
  const surface = resolveSurface({ pathname, preview: previewFromCookie(match?.[1]) });
  const root = doc.documentElement;
  if (root.dataset.surface !== surface) root.dataset.surface = surface;
  root.classList.toggle('dark', htmlClassForSurface(surface) === 'dark');
}
