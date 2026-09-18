// Helpers puros para instrumentar /login (Fase 1.3 do onboarding em dois
// passos — ver docs/projects/onboarding-dois-passos.md). Sem browser, sem
// rede: só mapeamento de dado que já existe em mãos na hora do evento.
import { maskPrivatePath } from './posthogClient';

const REDIRECT_QUERY_KEYS = ['redirect', 'redirectTo', 'redirect_to', 'next'];
const ALLOWED_REDIRECT_PATHS = [
  /^\/app$/,
  /^\/app\/mesas(?:\/:id)?$/,
  /^\/app\/pedidos(?:\/cozinha)?$/,
  /^\/gestao(?:\/(?:acessos|caixa|despesas|empresas|estoque|extensoes|fichario|indicacoes|mesas|pessoas|produtos))?$/,
  /^\/gestao\/gerente(?:\/(?:preferencias|semana))?$/,
  /^\/relatorios$/,
  /^\/perfil$/,
  /^\/assinatura$/,
  /^\/ferramentas(?:\/(?:cardapio|precificacao))?$/,
];
const ALLOWED_LOGIN_MESSAGES = new Set(['session_expired', 'deletion_scheduled']);

function sanitizeRedirectPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = maskPrivatePath(value);
  return ALLOWED_REDIRECT_PATHS.some((pattern) => pattern.test(path)) ? path : null;
}

/**
 * De onde veio o redirect que trouxe a pessoa pra /login, a partir da query
 * string — nunca da URL inteira, que pode carregar token/e-mail. Um alvo em
 * `?redirect=`/`?next=` é reduzido ao formato da rota via `maskPrivatePath`
 * (sem query, sem id). Um `?msg=` (vocabulário fixo do próprio app, ex.:
 * `session_expired`, `deletion_scheduled`) volta prefixado, sem mascarar —
 * não é rota nem carrega dado de ninguém.
 * @param {URLSearchParams} searchParams
 * @returns {string|null}
 */
export function deriveLoginRedirectFrom(searchParams) {
  if (!searchParams || typeof searchParams.get !== 'function') return null;

  for (const key of REDIRECT_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (!value) continue;
    return sanitizeRedirectPath(value);
  }

  const msg = searchParams.get('msg');
  if (ALLOWED_LOGIN_MESSAGES.has(msg)) return `msg:${msg}`;

  return null;
}

const RATE_LIMIT_CODE = 'rate_limited';
const NETWORK_MARKERS = [
  'failed to fetch',
  'load failed',
  'network',
  'fetch',
  'connection',
  'timeout',
  'timed out',
];

/**
 * Reduz o erro de login (falha de rede no fetch, resposta não-OK da API, ou
 * erro do supabase-js em `setSession`) a um código estável — nunca a mensagem
 * crua, que pode variar e não é o que se agrega num funil.
 * @param {{status?: number, code?: string, message?: string}} [error]
 * @returns {'invalid_credentials'|'email_not_confirmed'|'rate_limited'|'network'|'unknown'}
 */
export function mapLoginErrorToCode({ status, code, message } = {}) {
  if (status === 429 || code === RATE_LIMIT_CODE) return RATE_LIMIT_CODE;

  const msg = String(message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'invalid_credentials';
  if (msg.includes('email not confirmed')) return 'email_not_confirmed';
  if (NETWORK_MARKERS.some((marker) => msg.includes(marker))) return 'network';

  return 'unknown';
}
