// Whitelist de atribuição aceita do cliente (localStorage / body).
// Espelha o contrato de POST /api/auth/signup — manter em sync.
const ACQUISITION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ttclid', 'msclkid',
  'origem', 'referrer', 'landing', 'captured_at',
];

/**
 * Sanitiza payload de aquisição do browser. Entrada não confiável.
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
  return Object.keys(clean).length ? clean : null;
}
