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

// Eventos que o proprio SDK gera a partir da TELA: carregam URL, estrutura de
// elemento ou mapa de clique. Numa rota privada eles sao conteudo do operador
// (e a URL pode ter token/id), entao morrem sempre.
//
// O resto — evento de negocio nomeado, $identify, $exception — atravessa. Ate
// 2026-09-14 `before_send` derrubava TUDO fora da area publica, o que fazia de
// `trial_auto_started`, `subscription_checkout_started`, `pix_payment_initiated`
// e dos `gerente_*` codigo morto silencioso: `capture()` retornava sem erro e
// o evento nunca chegava. Nao voltar a filtrar por rota aqui; filtre por EVENTO.
const SURFACE_EVENTS = new Set([
  '$pageview',
  '$pageleave',
  '$autocapture',
  '$rageclick',
  '$dead_click',
  '$web_vitals',
  '$screen',
  '$heatmap',
  '$$heatmap',
]);

// Propriedades que revelam a URL da rota privada.
const URL_PROPERTY_KEYS = ['$current_url', 'current_url', '$pathname', '$initial_current_url', '$initial_pathname'];
const REFERRER_PROPERTY_KEYS = ['$referrer', '$referring_domain', '$initial_referrer', '$initial_referring_domain'];
// Containers de propriedade de pessoa. No CaptureResult do posthog-js eles sao
// IRMAOS de `properties` (@posthog/types: capture.d.ts), mas algumas rotas do
// SDK tambem os aninham dentro de `properties` — varrer os dois lugares.
const PERSON_CONTAINERS = ['$set', '$set_once'];

// Segmento de path que identifica alguem: id de mesa, de pedido, de empresa.
const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;

/**
 * Reduz o path de uma rota privada ao formato da rota, sem query e sem id.
 * `/app/mesas/7f3a.../pagamento?token=x` -> `/app/mesas/:id/pagamento`.
 * O funil precisa saber DE ONDE o evento saiu; nao precisa saber de quem.
 */
export function maskPrivatePath(pathname = '') {
  const path = (pathname || '/').split('?')[0].split('#')[0];
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/') || '/';
}

/**
 * Unica autoridade sobre o que morre. Rota publica entrega tudo; rota privada
 * entrega evento de negocio e mata superficie.
 */
export function shouldDropPostHogEvent(eventName = '', pathname = '') {
  if (isPostHogAllowedPath(pathname)) return false;
  return SURFACE_EVENTS.has(eventName);
}

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

/** Troca a URL privada pelo formato da rota e apaga o referrer, em qualquer
 *  container de propriedade que o SDK use. */
function stripPrivateSurface(container, maskedPath) {
  if (!container || typeof container !== 'object') return;
  for (const key of URL_PROPERTY_KEYS) {
    if (container[key] !== undefined) container[key] = maskedPath;
  }
  for (const key of REFERRER_PROPERTY_KEYS) {
    // Numa rota privada o referrer e outra rota privada. Nao vale o risco.
    if (container[key] !== undefined) delete container[key];
  }
}

/**
 * Decide o destino de um evento a partir do path — pura, pra poder ser testada
 * sem navegador. Devolve `null` quando o evento morre.
 * @param {any} event CaptureResult do posthog-js
 * @param {string} pathname
 */
export function sanitizePostHogEvent(event, pathname) {
  if (shouldDropPostHogEvent(event?.event, pathname)) return null;

  const props = event?.properties || {};

  if (isPostHogAllowedPath(pathname)) {
    for (const key of ['$current_url', 'current_url', '$referrer', '$initial_referrer']) {
      if (props[key]) props[key] = redactSensitiveQueryParams(props[key]);
    }
    return event;
  }

  // Rota privada: o evento vale, a tela nao.
  const maskedPath = maskPrivatePath(pathname);
  for (const container of [props, event, ...PERSON_CONTAINERS.flatMap((key) => [event?.[key], props[key]])]) {
    stripPrivateSurface(container, maskedPath);
  }

  return event;
}

function sanitizeEvent(event) {
  if (!isBrowser()) return null;
  return sanitizePostHogEvent(event, window.location.pathname);
}

async function ensurePostHog() {
  if (!isBrowser() || !POSTHOG_KEY || isLocalHost()) return null;
  if (posthogInstance) return posthogInstance;
  if (initPromise) return initPromise;

  // O SDK pode subir direto numa rota privada (um `gerente_*` no /gestao e o
  // primeiro evento de quem nunca passou pelo marketing). Nesse caso ele nasce
  // sem os listeners de superficie, em vez de nascer com eles e desligar depois.
  const surfaceAllowed = isPostHogAllowedPath(window.location.pathname);

  initPromise = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ...(POSTHOG_UI_HOST ? { ui_host: POSTHOG_UI_HOST } : {}),
      defaults: '2026-01-30',
      capture_pageview: false,
      capture_pageleave: surfaceAllowed,
      autocapture: surfaceAllowed,
      enable_heatmaps: surfaceAllowed,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: sanitizeEvent,
    });

    // Migracao: a versao anterior chamava `opt_out_capturing()` ao entrar em
    // rota privada, e o opt-out fica gravado no localStorage do aparelho. Quem
    // abriu o PDV naquela versao ficaria mudo pra sempre. Nao existe consent UI
    // neste app, entao o unico opt-out possivel e aquele — desfazer e correto.
    if (posthog.has_opted_out_capturing?.()) {
      posthog.opt_in_capturing?.({ captureEventName: false });
    }

    posthogInstance = posthog;
    return posthogInstance;
  }).catch((err) => {
    console.warn('[posthog] inicializacao falhou:', err?.message || err);
    initPromise = null;
    return null;
  });

  return initPromise;
}

/**
 * Alinha a captura de SUPERFICIE ao path atual e responde se esse path e
 * publico. Nao inicializa o SDK so pra desligar coisa: entrar no PDV sem ter
 * passado pelo marketing continua sem baixar posthog-js.
 */
export async function syncPostHogForPath(pathname = '') {
  if (!isBrowser() || !POSTHOG_KEY || isLocalHost()) return false;

  const allowed = isPostHogAllowedPath(pathname || window.location.pathname);
  if (!allowed && !posthogInstance) return false;

  const posthog = await ensurePostHog();
  if (!posthog) return false;

  // Antes isto era `opt_out_capturing()`, que cala o `capture()` nomeado junto
  // com a superficie. Agora desliga so os listeners; quem decide o que morre e
  // o `before_send`, por evento.
  posthog.set_config?.({
    autocapture: allowed,
    capture_pageleave: allowed,
    enable_heatmaps: allowed,
  });

  return allowed;
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

/**
 * Registra evento de negocio, inclusive dentro do produto. O retorno diz a
 * verdade: `false` quando o evento nao vai ser enviado. O bug anterior era
 * justamente este contrato mentir — devolvia `true` e o `before_send` matava.
 */
export async function capturePostHogEvent(event, properties = {}) {
  if (!isBrowser()) return false;
  if (shouldDropPostHogEvent(event, window.location.pathname)) return false;
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
