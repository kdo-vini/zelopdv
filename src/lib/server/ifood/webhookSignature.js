import { createHmac, timingSafeEqual } from 'node:crypto';

// Confirmed against the official iFood docs (2026-09-16):
// "Webhook — requisição" and the dedicated signature guide both state the
// signature is HMAC-SHA256 keyed by the app's `clientSecret`, computed over
// the exact raw request body bytes (no parsing/normalization), and
// hex-encoded with no algorithm prefix in the `X-IFood-Signature` header.
const HEX_SHA256_LENGTH = 64; // 32-byte digest -> 64 hex chars.
const HEX_PATTERN = /^[0-9a-f]+$/i;

/**
 * Verify an iFood webhook signature. Pure and side-effect free: no `$env`,
 * no I/O. Every rejection path returns before any buffer comparison so a
 * missing, malformed, or wrong-length header never reaches
 * `timingSafeEqual` — Node throws on length mismatch there, and comparing
 * unequal-length buffers would leak timing information anyway.
 *
 * @param {Uint8Array} rawBytes exact raw request body bytes, read before parsing
 * @param {string | null | undefined} signatureHeader raw `X-IFood-Signature` header value
 * @param {string} secret the app's `clientSecret`
 * @returns {boolean}
 */
export function verifyIfoodSignature(rawBytes, signatureHeader, secret) {
  if (!(rawBytes instanceof Uint8Array)) return false;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  if (typeof signatureHeader !== 'string') return false;

  const candidate = signatureHeader.trim();
  if (candidate.length !== HEX_SHA256_LENGTH || !HEX_PATTERN.test(candidate)) {
    return false;
  }

  const expectedDigest = createHmac('sha256', secret).update(Buffer.from(rawBytes)).digest();
  const candidateDigest = Buffer.from(candidate, 'hex');
  if (expectedDigest.length !== candidateDigest.length) return false;

  return timingSafeEqual(expectedDigest, candidateDigest);
}

export default verifyIfoodSignature;
