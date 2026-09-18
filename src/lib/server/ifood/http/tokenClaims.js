/**
 * Decode the payload of an iFood access token when it is a JWT.
 * Returns null for opaque tokens or malformed input — never throws.
 * Does not verify the signature (API responses already authenticated the call).
 */
export function decodeIfoodJwtClaims(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken.includes('.')) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + pad, 'base64').toString('utf8');
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Merchants granted on the token via `merchant_scope` entries
 * (`"<merchantId>:<module>"`). Used when Merchant API `/merchants` /
 * `/status` are unavailable (app only homologated for Order/Events).
 */
export function merchantScopesFromClaims(claims) {
  const raw = claims?.merchant_scope;
  if (!Array.isArray(raw)) return [];
  const byMerchant = new Map();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const sep = entry.lastIndexOf(':');
    if (sep <= 0 || sep === entry.length - 1) continue;
    const merchantId = entry.slice(0, sep).trim();
    const moduleName = entry.slice(sep + 1).trim().toLowerCase();
    if (!merchantId || !moduleName) continue;
    const modules = byMerchant.get(merchantId) ?? new Set();
    modules.add(moduleName);
    byMerchant.set(merchantId, modules);
  }
  return [...byMerchant.entries()].map(([merchantId, modules]) => ({
    merchantId,
    modules: [...modules]
  }));
}

/** True if the JWT grants order, events, or merchant for this store. */
export function tokenGrantsMerchantAccess(claims, merchantId) {
  if (typeof merchantId !== 'string' || !merchantId.trim()) return false;
  const id = merchantId.trim();
  const entries = merchantScopesFromClaims(claims);
  const hit = entries.find((e) => e.merchantId === id);
  if (!hit) return false;
  return hit.modules.some((m) => m === 'order' || m === 'events' || m === 'merchant');
}
