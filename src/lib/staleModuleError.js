// Após um deploy, chunks antigos somem do CDN/servidor; o preload por hover do
// SvelteKit tenta importar um chunk que não existe mais e isso vira ruído no
// PostHog (o clique real recarrega a página sozinho). Detectamos essa
// mensagem para não confundir com um erro real de import quebrado.
const STALE_MODULE_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome
  /importing a module script failed/i, // Safari
  /error loading dynamically imported module/i // Firefox
];

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isStaleModuleImportError(error) {
  if (!error) return false;

  const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : null;

  if (!message) return false;

  return STALE_MODULE_PATTERNS.some((pattern) => pattern.test(message));
}
