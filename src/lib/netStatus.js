// Detecção de erro de rede compartilhada entre o gate de assinatura (guards.js)
// e a fila offline (offlineDb.js). Módulo puro de propósito: NÃO importar Dexie
// nem o cliente Supabase aqui, para poder ser usado em qualquer contexto.

const NETWORK_ERROR_NEEDLES = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network error',
  'network request failed',
  'load failed',
  'connection',
  'internet',
  'offline',
  'timeout',
  'timed out',
  'aborted',
  'aborterror',
  'err_internet_disconnected',
  'err_network_changed'
];

/**
 * Decide se um erro é compatível com falha de conexão/timeout (vs. erro de
 * regra de negócio, RLS, FK, payload inválido etc.).
 *
 * Usado para: (a) decidir se uma venda entra na fila offline e (b) decidir se o
 * gate de assinatura pode cair no entitlement em cache em vez de expulsar o
 * operador. Erros confirmados pelo servidor (assinatura expirada, sem perfil)
 * NÃO são de rede e devem seguir o fluxo normal de redirecionamento.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const message = String(
    typeof error === 'string'
      ? error
      : error.message || error.error_description || error.details || error.hint || ''
  ).toLowerCase();

  return NETWORK_ERROR_NEEDLES.some((needle) => message.includes(needle));
}
