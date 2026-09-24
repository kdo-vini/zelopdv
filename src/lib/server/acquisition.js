import { detectAiSource } from '$lib/attribution/aiSources.js';

// Whitelist de atribuição aceita do cliente (localStorage / body).
// Espelha o contrato de POST /api/auth/signup — manter em sync.
// `ai_source` entra na whitelist só pra sobreviver ao filtro de chave; o
// valor em si nunca vem do cliente (ver abaixo) — o cliente não é confiável
// pra dizer "eu vim de uma IA".
const ACQUISITION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ttclid', 'msclkid',
  'origem', 'referrer', 'landing', 'captured_at', 'ai_source',
];

/**
 * Sanitiza payload de aquisição do browser. Entrada não confiável.
 *
 * `ai_source` nunca é aceito do cliente: depois de filtrar pela whitelist,
 * recalculamos a partir do `referrer`/`utm_source` já sanitizados com
 * `detectAiSource`. Um valor spoofado (`ai_source: "chatgpt"` sem referrer/utm
 * batendo) é descartado; um caso legítimo que o cliente não detectou (ex.:
 * lib desatualizada) é preenchido aqui mesmo.
 * @param {unknown} raw
 * @returns {Record<string, string>|null}
 */
export function sanitizeAcquisition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clean = {};
  for (const key of ACQUISITION_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, 200);
    if (trimmed) clean[key] = trimmed;
  }

  const aiSource = detectAiSource({ referrer: clean.referrer, utm_source: clean.utm_source });
  if (aiSource) {
    clean.ai_source = aiSource;
  } else {
    delete clean.ai_source;
  }

  return Object.keys(clean).length ? clean : null;
}
