import { verifyIfoodSignature } from './webhookSignature.js';

// Matches `ifood_event_inbox_payload_size_check` in the persistence
// foundation migration — the route rejects an oversized body before the
// database ever sees it.
export const MAX_BODY_BYTES = 262144;
export const SIGNATURE_HEADER = 'x-ifood-signature';

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * Read a request body as raw bytes while enforcing a hard byte cap on the
 * stream itself. `content-length` is checked by the caller first as a fast
 * rejection, but it is attacker-controlled and can be absent or lie; this
 * loop is what actually stops an oversized body regardless of what the
 * header claimed.
 */
export async function readBodyWithCap(request, maxBytes) {
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        const error = new Error('BODY_TOO_LARGE');
        error.code = 'BODY_TOO_LARGE';
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best-effort: the stream may already be closed/errored.
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Parse and validate the confirmed single-event webhook envelope
 * (`id`, `merchantId`, `code`/`fullCode`, optional `orderId`/`createdAt`)
 * from already signature-verified raw bytes. Only well-formed UTF-8/JSON
 * objects with the required identity fields pass; an unrecognized
 * `code`/`fullCode` value is still accepted here — quarantine of unknown
 * event types happens downstream (Task 7), never at intake.
 */
export function decodeIfoodWebhookEvent(rawBytes) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const text = decoder.decode(rawBytes);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_SHAPE');
  }

  const eventId = typeof parsed.id === 'string' ? parsed.id.trim() : '';
  const merchantId = typeof parsed.merchantId === 'string' ? parsed.merchantId.trim() : '';
  const eventType = typeof parsed.fullCode === 'string' && parsed.fullCode.trim()
    ? parsed.fullCode.trim()
    : (typeof parsed.code === 'string' ? parsed.code.trim() : '');

  if (!eventId || !merchantId || !eventType) {
    throw new Error('INVALID_SHAPE');
  }

  const externalOrderId = typeof parsed.orderId === 'string' && parsed.orderId.trim()
    ? parsed.orderId.trim()
    : null;
  const occurredAt = typeof parsed.createdAt === 'string' && parsed.createdAt.trim()
    ? parsed.createdAt.trim()
    : null;

  return {
    eventId,
    merchantId,
    externalOrderId,
    eventType,
    externalRevision: 0,
    occurredAt,
    payload: parsed
  };
}

/**
 * Thin, testable core: signature verification happens strictly before any
 * parse attempt, and a `202` is only returned once the repository RPC has
 * actually committed (inserted, duplicate, or ignored-unknown-merchant).
 * Never echoes payload, ids, signature, or secret in any response.
 *
 * Kept out of `+server.js` on purpose: SvelteKit only allows HTTP-verb and
 * a handful of other well-known exports from a `+server.js` module, so this
 * helper (and everything it depends on) lives in its own pure module with
 * no `$env`/`supabaseAdmin` import — the route file wires those in.
 */
export async function handleIfoodWebhook({ request, secret, repository }) {
  if (!secret) {
    return jsonResponse(503, { error: 'unavailable' });
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: 'payload_too_large' });
    }
  }

  let rawBytes;
  try {
    rawBytes = await readBodyWithCap(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error?.code === 'BODY_TOO_LARGE') {
      return jsonResponse(413, { error: 'payload_too_large' });
    }
    return jsonResponse(400, { error: 'invalid_body' });
  }

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  if (!verifyIfoodSignature(rawBytes, signatureHeader, secret)) {
    return jsonResponse(401, { error: 'invalid_signature' });
  }

  let event;
  try {
    event = decodeIfoodWebhookEvent(rawBytes);
  } catch {
    return jsonResponse(400, { error: 'invalid_payload' });
  }

  try {
    const { outcome } = await repository.enqueueWebhookEvent(event);
    if (outcome !== 'inserted' && outcome !== 'duplicate' && outcome !== 'ignored') {
      console.error('[ifood-webhook] unrecognized enqueue outcome');
      return jsonResponse(503, { error: 'unavailable' });
    }
    return jsonResponse(202, { received: true });
  } catch (error) {
    console.error('[ifood-webhook] enqueue failed:', error?.message || 'unknown error');
    return jsonResponse(503, { error: 'unavailable' });
  }
}

export default handleIfoodWebhook;
