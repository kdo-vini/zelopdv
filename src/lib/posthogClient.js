const POSTHOG_KEY =
  import.meta.env.PUBLIC_POSTHOG_KEY ||
  import.meta.env.VITE_PUBLIC_POSTHOG_KEY ||
  import.meta.env.PUBLIC_POSTHOG_PROJECT_KEY ||
  import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_KEY ||
  '';

const POSTHOG_HOST =
  import.meta.env.PUBLIC_POSTHOG_HOST ||
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST ||
  'https://us.i.posthog.com';

const POSTHOG_UI_HOST =
  import.meta.env.PUBLIC_POSTHOG_UI_HOST ||
  import.meta.env.VITE_PUBLIC_POSTHOG_UI_HOST ||
  '';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const EXACT_PUBLIC_PATHS = new Set([
  '/',
  '/landing',
  '/cadastro',
  '/login',
  '/esqueci-senha',
  '/redefinir-senha',
  '/contato',
  '/precificacao',
  '/extensoes',
  '/vs-planilha',
  '/comparativos',
  '/zelo-impressao',
  '/pascoa',
  '/termos',
  '/privacidade',
]);

const PUBLIC_PREFIXES = ['/para-', '/blog', '/vs-', '/indica/'];
const BLOCKED_PREFIXES = ['/app', '/gestao', '/relatorios', '/perfil', '/assinatura', '/ferramentas'];
const SENSITIVE_QUERY_KEYS = [
  'access_token',
  'refresh_token',
  'token',
  'auth',
  'code',
  'email',
  'password',
];

let posthogInstance = null;
let initPromise = null;
let lastPageviewUrl = '';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isLocalHost() {
  if (!isBrowser()) return false;
  if (import.meta.env.PUBLIC_POSTHOG_ENABLE_LOCAL === 'true') return false;
  if (import.meta.env.VITE_PUBLIC_POSTHOG_ENABLE_LOCAL === 'true') return false;
  return LOCAL_HOSTS.has(window.location.hostname);
}

export function hasPostHogConfig() {
  return Boolean(POSTHOG_KEY);
}

export function isPostHogAllowedPath(pathname = '') {
  const path = pathname || '/';
  if (path === '/auth/callback' || path.startsWith('/auth/callback/')) return false;
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  if (EXACT_PUBLIC_PATHS.has(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function redactSensitiveQueryParams(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    const parsed = new URL(value, window.location.origin);
    let changed = false;
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[redacted]');
        changed = true;
      }
    }
    return changed ? parsed.toString() : value;
  } catch {
    return value.replace(
      /([?&](?:access_token|refresh_token|token|auth|code|email|password)=)[^&]+/gi,
      '$1[redacted]',
    );
  }
}

function sanitizeEvent(event) {
  if (!isBrowser() || !isPostHogAllowedPath(window.location.pathname)) return null;

  const props = event?.properties || {};
  for (const key of ['$current_url', 'current_url', '$referrer', '$initial_referrer']) {
    if (props[key]) props[key] = redactSensitiveQueryParams(props[key]);
  }

  return event;
}

async function ensurePostHog() {
  if (!isBrowser() || !POSTHOG_KEY || isLocalHost()) return null;
  if (posthogInstance) return posthogInstance;
  if (initPromise) return initPromise;

  initPromise = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ...(POSTHOG_UI_HOST ? { ui_host: POSTHOG_UI_HOST } : {}),
      defaults: '2026-01-30',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
      enable_heatmaps: true,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: sanitizeEvent,
    });

    posthogInstance = posthog;
    return posthogInstance;
  }).catch((err) => {
    console.warn('[posthog] inicializacao falhou:', err?.message || err);
    initPromise = null;
    return null;
  });

  return initPromise;
}

export async function syncPostHogForPath(pathname = '') {
  if (!isBrowser() || !POSTHOG_KEY || isLocalHost()) return false;

  const allowed = isPostHogAllowedPath(pathname || window.location.pathname);
  if (!allowed && !posthogInstance) return false;

  const posthog = await ensurePostHog();
  if (!posthog) return false;

  if (!allowed) {
    posthog.opt_out_capturing();
    return false;
  }

  if (posthog.has_opted_out_capturing?.()) {
    posthog.opt_in_capturing();
  }
  return true;
}

export async function capturePostHogPageview(pathname = '', href = '') {
  if (!isBrowser()) return false;

  const currentPath = pathname || window.location.pathname;
  const currentUrl = href || window.location.href;
  const canCapture = await syncPostHogForPath(currentPath);
  if (!canCapture || currentUrl === lastPageviewUrl) return false;

  lastPageviewUrl = currentUrl;
  posthogInstance.capture('$pageview', {
    path: currentPath,
    public_surface: true,
  });
  return true;
}

export async function capturePostHogEvent(event, properties = {}) {
  if (!isBrowser()) return false;
  const posthog = await ensurePostHog();
  if (!posthog) return false;
  posthog.capture(event, properties);
  return true;
}

export async function identifyPostHogUser(userId, properties = {}) {
  if (!isBrowser()) return false;
  const posthog = await ensurePostHog();
  if (!posthog) return false;
  posthog.identify(userId, properties);
  return true;
}

export async function capturePostHogException(error) {
  if (!isBrowser()) return false;
  const posthog = await ensurePostHog();
  if (!posthog) return false;
  posthog.captureException(error);
  return true;
}
