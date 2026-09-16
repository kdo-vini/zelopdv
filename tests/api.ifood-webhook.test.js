import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyIfoodSignature } from '../src/lib/server/ifood/webhookSignature.js';

const loadRoute = async () => await import('../src/routes/api/integrations/ifood/webhook/+server.js');
const loadWebhookHandler = async () => await import('../src/lib/server/ifood/webhookHandler.js');

const SECRET = 'ifood_test_secret_do_not_leak_9f3a';
const MAX_BODY_BYTES = 262144;

function sign(bodyBytes, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(bodyBytes)).digest('hex');
}

function encode(payload) {
  return new TextEncoder().encode(JSON.stringify(payload));
}

function bodyStreamFromBytes(bytes, chunkSize) {
  const size = chunkSize && chunkSize > 0 ? chunkSize : Math.max(bytes.length, 1);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + size, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    }
  });
}

function makeRequest({ bodyBytes, signature, contentLength, chunkSize, extraHeaders = {} }) {
  const headerMap = new Map();
  if (signature !== undefined) headerMap.set('x-ifood-signature', signature);
  if (contentLength !== undefined) headerMap.set('content-length', String(contentLength));
  for (const [key, value] of Object.entries(extraHeaders)) headerMap.set(key.toLowerCase(), value);

  return {
    headers: {
      get: (name) => {
        const value = headerMap.get(String(name).toLowerCase());
        return value === undefined ? null : value;
      }
    },
    body: bodyStreamFromBytes(bodyBytes, chunkSize)
  };
}

function makeRepository(result) {
  return {
    enqueueWebhookEvent: vi.fn(async () => result ?? { outcome: 'inserted' })
  };
}

function makeFailingRepository(error) {
  return {
    enqueueWebhookEvent: vi.fn(async () => {
      throw error ?? new Error('db unavailable');
    })
  };
}

const validPayload = Object.freeze({
  id: 'event-fixture-1',
  merchantId: 'merchant-fixture-1',
  code: 'PLC',
  fullCode: 'PLACED',
  orderId: 'order-fixture-1',
  createdAt: '2026-09-16T12:00:00.000Z'
});

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('verifyIfoodSignature (unit)', () => {
  it('accepts a correctly computed hex HMAC-SHA256 signature over the exact bytes', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, sign(bytes), SECRET)).toBe(true);
  });

  it('is case-insensitive for the hex encoding of a valid signature', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, sign(bytes).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, sign(bytes, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('rejects when a single byte of the body changed after signing', () => {
    const bytes = encode(validPayload);
    const signature = sign(bytes);
    const tampered = new Uint8Array(bytes);
    tampered[0] = tampered[0] ^ 0xff;
    expect(verifyIfoodSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, null, SECRET)).toBe(false);
    expect(verifyIfoodSignature(bytes, undefined, SECRET)).toBe(false);
  });

  it('rejects a malformed (non-hex) signature', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, 'not-hex-'.repeat(8), SECRET)).toBe(false);
  });

  it('rejects a wrong-length signature without throwing', () => {
    const bytes = encode(validPayload);
    const short = sign(bytes).slice(0, 10);
    const long = `${sign(bytes)}00`;
    expect(() => verifyIfoodSignature(bytes, short, SECRET)).not.toThrow();
    expect(verifyIfoodSignature(bytes, short, SECRET)).toBe(false);
    expect(verifyIfoodSignature(bytes, long, SECRET)).toBe(false);
  });

  it('rejects an empty or non-string secret instead of throwing', () => {
    const bytes = encode(validPayload);
    expect(verifyIfoodSignature(bytes, sign(bytes), '')).toBe(false);
    expect(verifyIfoodSignature(bytes, sign(bytes), null)).toBe(false);
  });
});

describe('POST /api/integrations/ifood/webhook — handleIfoodWebhook', () => {
  it('persists a valid signed event and returns 202 only after the repository call resolves', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository({ outcome: 'inserted' });

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ received: true });
    expect(repository.enqueueWebhookEvent).toHaveBeenCalledTimes(1);
    expect(repository.enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-fixture-1',
        merchantId: 'merchant-fixture-1',
        eventType: 'PLACED',
        externalOrderId: 'order-fixture-1'
      })
    );
  });

  it('rejects a tampered body with 401 and never calls the repository', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const signature = sign(bytes);
    const tampered = new Uint8Array(bytes);
    tampered[0] = tampered[0] ^ 0xff;
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: tampered, signature }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(401);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 401 (not 400) for invalid JSON with a bad signature, proving parsing never runs before verification', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = new TextEncoder().encode('{ this is not valid json');
    const parseSpy = vi.spyOn(JSON, 'parse');
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: 'f'.repeat(64) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(401);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header with 401', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(401);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a malformed signature header with 401', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: 'zz-not-hex' }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(401);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a wrong-length signature header with 401', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes).slice(0, 20) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(401);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for a validly signed but invalid-JSON body', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = new TextEncoder().encode('{ this is not valid json');
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(400);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for a validly signed body missing required fields', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const incomplete = { id: 'event-fixture-2', code: 'PLC' }; // merchantId missing
    const bytes = encode(incomplete);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(400);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a body whose declared content-length exceeds the cap with 413, before reading', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes), contentLength: MAX_BODY_BYTES + 1 }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(413);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('cuts off a stream that exceeds the cap even with no content-length header', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const oversized = new Uint8Array(MAX_BODY_BYTES + 1024).fill(97); // 'a'
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: oversized, signature: 'f'.repeat(64), chunkSize: 65536 }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(413);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('cuts off a stream that exceeds the cap even when content-length lies and understates the size', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const oversized = new Uint8Array(MAX_BODY_BYTES + 1024).fill(97);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: oversized, signature: 'f'.repeat(64), contentLength: 10, chunkSize: 65536 }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(413);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('acknowledges a duplicate event with 202', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository({ outcome: 'duplicate' });

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(202);
    expect(repository.enqueueWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('acknowledges an event for an unknown/revoked merchant with 202 and does not treat it as an error', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository({ outcome: 'ignored' });

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('returns 503 without committing when the repository/database fails', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeFailingRepository(new Error('connection reset'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: SECRET,
      repository
    });

    expect(response.status).toBe(503);
    expect(repository.enqueueWebhookEvent).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('fails closed with 503 when the webhook secret is not configured, without touching the repository', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const repository = makeRepository();

    const response = await handleIfoodWebhook({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) }),
      secret: null,
      repository
    });

    expect(response.status).toBe(503);
    expect(repository.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('never echoes payload fields, ids, signature, or the secret in any response body', async () => {
    const { handleIfoodWebhook } = await loadWebhookHandler();
    const bytes = encode(validPayload);
    const signature = sign(bytes);
    const scenarios = [
      { secret: SECRET, signature, repository: makeRepository({ outcome: 'inserted' }) },
      { secret: SECRET, signature: 'f'.repeat(64), repository: makeRepository() },
      { secret: SECRET, signature, repository: makeFailingRepository() },
      { secret: null, signature, repository: makeRepository() }
    ];

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const scenario of scenarios) {
      const response = await handleIfoodWebhook({
        request: makeRequest({ bodyBytes: bytes, signature: scenario.signature }),
        secret: scenario.secret,
        repository: scenario.repository
      });
      const text = await response.text();
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(signature);
      expect(text).not.toContain('event-fixture-1');
      expect(text).not.toContain('merchant-fixture-1');
      expect(text).not.toContain('order-fixture-1');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    errorSpy.mockRestore();
  });
});

describe('POST /api/integrations/ifood/webhook — route wiring', () => {
  it('returns 503 when supabaseAdmin is not configured', async () => {
    vi.stubEnv('IFOOD_CLIENT_SECRET', SECRET);
    vi.doMock('$env/dynamic/private', () => ({ env: { IFOOD_CLIENT_SECRET: SECRET } }));
    vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: null }));

    const { POST } = await loadRoute();
    const bytes = encode(validPayload);
    const response = await POST({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) })
    });

    expect(response.status).toBe(503);
  });

  it('wires env + supabaseAdmin end to end for a valid signed request', async () => {
    vi.stubEnv('IFOOD_CLIENT_SECRET', SECRET);
    vi.doMock('$env/dynamic/private', () => ({ env: { IFOOD_CLIENT_SECRET: SECRET } }));
    const rpcSingle = vi.fn(async () => ({
      data: { inbox_id: 'inbox-1', event_id: 'event-fixture-1', inserted: true, status: 'queued', outcome: 'inserted' },
      error: null
    }));
    const rpc = vi.fn(() => ({ single: rpcSingle }));
    vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: { rpc } }));

    const { POST } = await loadRoute();
    const bytes = encode(validPayload);
    const response = await POST({
      request: makeRequest({ bodyBytes: bytes, signature: sign(bytes) })
    });

    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith(
      'enqueue_ifood_webhook_event_v1',
      expect.objectContaining({ p_event_id: 'event-fixture-1', p_merchant_id: 'merchant-fixture-1' })
    );
  });
});
