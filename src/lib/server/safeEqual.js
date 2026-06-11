import crypto from 'node:crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns false if lengths differ (safe — lengths aren't secrets).
 */
export function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
