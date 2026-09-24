// Catálogo único de assistentes de IA reconhecidos na atribuição de aquisição.
// Isomorphic — importado tanto no cliente (`attribution/client.js`) quanto no
// servidor (`server/acquisition.js`), pra nunca duplicar a lista de hosts/utm.
//
// Regra dura do projeto: nada de valor solto em código — qualquer lugar que
// precise reconhecer "veio de IA" deriva daqui, nunca reescreve um host ou um
// utm_source à mão.
//
// Cada entrada:
// - id: identificador estável, vira `ia_<id>` no canal e `ai_source` salvo.
// - label: nome de exibição (banner, textos).
// - hosts: sufixos de host aceitos (comparação por final de string, não substring).
// - utmSources: valores de utm_source aceitos (o ChatGPT, por exemplo, anexa
//   `utm_source=chatgpt.com` nos links que cita).
export const AI_SOURCES = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    utmSources: ['chatgpt.com', 'chatgpt', 'openai'],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    hosts: ['perplexity.ai'],
    utmSources: ['perplexity.ai', 'perplexity'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com', 'bard.google.com'],
    utmSources: ['gemini.google.com', 'gemini', 'bard'],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    // bing.com/chat é ambíguo com busca comum do Bing — só o host dedicado do Copilot conta.
    hosts: ['copilot.microsoft.com'],
    utmSources: ['copilot.microsoft.com', 'copilot'],
  },
  {
    id: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    utmSources: ['claude.ai', 'claude'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    utmSources: ['chat.deepseek.com', 'deepseek'],
  },
  {
    id: 'meta_ai',
    label: 'Meta AI',
    hosts: ['meta.ai'],
    utmSources: ['meta.ai', 'meta_ai', 'metaai'],
  },
  {
    id: 'grok',
    label: 'Grok',
    hosts: ['grok.com'],
    utmSources: ['grok.com', 'grok'],
  },
];

/** Índice id -> entrada, montado uma vez. */
const AI_SOURCES_BY_ID = new Map(AI_SOURCES.map((source) => [source.id, source]));

/** Devolve a entrada do catálogo, ou undefined se o id não existir. */
export function getAiSourceById(id) {
  return AI_SOURCES_BY_ID.get(id);
}

/**
 * Extrai o hostname em minúsculas de uma string que pode ser:
 * - uma URL completa (`https://chatgpt.com/c/...`)
 * - "host/path" sem protocolo (formato salvo por `safeReferrer()`)
 * - um host puro (`chatgpt.com`)
 * @param {string} value
 * @returns {string}
 */
function extractHost(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  // Tenta como URL completa primeiro (tem protocolo).
  try {
    const url = new URL(trimmed);
    if (url.hostname) return url.hostname.toLowerCase();
  } catch {
    // não é uma URL completa — segue para o parsing manual abaixo
  }

  // "host/path" ou host puro: corta no primeiro '/' e remove porta.
  const hostPart = trimmed.split('/')[0].split('?')[0].split('#')[0];
  return hostPart.split(':')[0].toLowerCase();
}

/** Sufixo seguro: `host === alvo` ou `host` termina em `.alvo` — nunca substring solta. */
function hostMatches(host, target) {
  if (!host || !target) return false;
  return host === target || host.endsWith(`.${target}`);
}

/**
 * Detecta a fonte de IA a partir do referrer e/ou utm_source. Comparação
 * case-insensitive; referrer aceita tanto "host/path" (formato salvo por
 * `safeReferrer()`) quanto URL completa.
 * @param {{referrer?: string, utm_source?: string}} params
 * @returns {string|null} id da fonte de IA, ou null se não reconhecida
 */
export function detectAiSource({ referrer = '', utm_source = '' } = {}) {
  const host = extractHost(referrer);
  const utm = String(utm_source || '').trim().toLowerCase();

  for (const source of AI_SOURCES) {
    if (host && source.hosts.some((candidate) => hostMatches(host, candidate))) {
      return source.id;
    }
    if (utm && source.utmSources.some((candidate) => candidate.toLowerCase() === utm)) {
      return source.id;
    }
  }

  return null;
}
