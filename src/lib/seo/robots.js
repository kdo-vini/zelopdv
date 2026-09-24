import { SITE_URL } from './site';

// Rotas autenticadas/privadas que nenhum crawler deve indexar. Mesma lista
// que o static/robots.txt anterior.
export const DISALLOWED_PATHS = ['/api/', '/app', '/gestao/', '/relatorios', '/perfil', '/assinatura'];

// Crawlers de IA generativa que queremos liberar explicitamente (GEO), além
// do "User-agent: *" padrão. Ver docs/marketing/GEO_PLAN_2026-09.md seção 4.
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Bingbot',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent'
];

function disallowLines() {
  return DISALLOWED_PATHS.map((path) => `Disallow: ${path}`).join('\n');
}

/**
 * Monta o robots.txt: um grupo "*" e um grupo por crawler de IA, cada um
 * repetindo a lista de Disallow (uma UA específica sobrescreve o "*" nos
 * crawlers, então precisa levar as próprias regras).
 * @returns {string}
 */
export function buildRobotsTxt() {
  const groups = ['*', ...AI_CRAWLERS].map(
    (agent) => `User-agent: ${agent}\nAllow: /\n${disallowLines()}`
  );

  return `${groups.join('\n\n')}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}
