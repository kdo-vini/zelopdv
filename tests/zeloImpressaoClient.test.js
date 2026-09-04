import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearZeloImpressaoPairing,
  detectZeloImpressao,
  sendPrintJob,
  ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE,
} from '../src/lib/zeloImpressaoClient.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    json: async () => body,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

afterEach(() => {
  clearZeloImpressaoPairing();
  delete globalThis.localStorage;
  delete globalThis.fetch;
});

describe('Zelo Impressão auto-connect', () => {
  it('requires canonical coordination before submitting an automatic order to an old agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await expect(sendPrintJob({ source: 'zelopdv', companyStoreId: 'owner',
      intent: { mode: 'automatic', orderId: 'order', purpose: 'order_ticket' },
    })).rejects.toMatchObject({ code: 'AUTO_PRINT_COORDINATION_REQUIRED', retrySafe: false });
    expect(globalThis.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health']);
  });
  it('passes the shared order intent and accepts another channel winning arbitration', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, capabilities: { canonicalAutoPrint: true } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: 'deduplicated', arbitration: { source: 'zelochat', duplicate: true } }));
    const intent = { mode: 'automatic', orderId: 'canonical-order', purpose: 'order_ticket' };
    const response = await sendPrintJob({ source: 'zelopdv', companyStoreId: 'owner', intent });
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toMatchObject({ companyStoreId: 'owner', intent });
    expect(response.status).toBe('deduplicated');
  });
  it('does not erase a saved pairing when an explicit diagnostic token is rejected', async () => {
    globalThis.localStorage = memoryStorage();
    globalThis.localStorage.setItem('zelo_impressao_token_v1', 'valid-saved-token');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, pairingRequired: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: 'PAIRING_REQUIRED' }, 401));
    expect((await detectZeloImpressao({ token: 'invalid-explicit', autoConnect: false })).paired).toBe(false);
    expect(globalThis.localStorage.getItem('zelo_impressao_token_v1')).toBe('valid-saved-token');
  });
  it('bounds response-body reading and marks a print with no acknowledgement as uncertain', async () => {
    globalThis.fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/health')) return jsonResponse({ ok: true });
      return { ...jsonResponse(null), json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted body')), { once: true });
      }) };
    });
    await expect(sendPrintJob({ source: 'zelopdv' }, { timeoutMs: 10 })).rejects.toMatchObject({ code: 'PRINT_OUTCOME_UNKNOWN' });
  }, 1000);

  it('preserves explicit job ids and gives intentional reprints separate ids', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await sendPrintJob({ source: 'zelopdv', jobId: 'known-attempt' });
    await sendPrintJob({ source: 'zelopdv' });
    await sendPrintJob({ source: 'zelopdv' });
    const jobs = globalThis.fetch.mock.calls.filter(([url]) => url.endsWith('/print')).map(([, options]) => JSON.parse(options.body));
    expect(jobs[0].jobId).toBe('known-attempt');
    expect(jobs[1].jobId).toBeTruthy();
    expect(jobs[1].jobId).not.toBe(jobs[2].jobId);
  });
  it('validates a stored token before declaring the browser paired', async () => {
    globalThis.localStorage = memoryStorage();
    globalThis.localStorage.setItem('zelo_impressao_token_v1', 'revoked-token');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, pairingRequired: true, paired: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: 'PAIRING_REQUIRED' }, 401));
    const result = await detectZeloImpressao({ autoConnect: false });
    expect(result.paired).toBe(false);
    expect(globalThis.localStorage.getItem('zelo_impressao_token_v1')).toBeNull();
  });

  it('distinguishes an unavailable agent from a lost print acknowledgement', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendPrintJob({ source: 'zelopdv' })).rejects.toMatchObject({ code: 'ZELO_IMPRESSAO_UNAVAILABLE' });
    expect(globalThis.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health']);

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(sendPrintJob({ source: 'zelopdv' })).rejects.toMatchObject({ code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false });
  });

  it('does not treat malformed acknowledgements or ambiguous server failures as success', async () => {
    for (const response of [jsonResponse(null), { ...jsonResponse(null), json: async () => { throw new Error('invalid JSON'); } }, jsonResponse({ message: 'failed' }, 500), jsonResponse({ message: 'legacy spool failure' }, 400)]) {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true })).mockResolvedValueOnce(response);
      await expect(sendPrintJob({ source: 'zelopdv' })).rejects.toMatchObject({ code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false });
    }
  });
  it('creates a browser session automatically when the agent is open', async () => {
    globalThis.localStorage = memoryStorage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, pairingRequired: true, paired: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, token: 'token-auto' }));
    globalThis.fetch = fetchMock;

    const result = await detectZeloImpressao();

    expect(result.paired).toBe(true);
    expect(result.autoConnected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/connect');
    expect(globalThis.localStorage.getItem('zelo_impressao_token_v1')).toBe('token-auto');
  });

  it('keeps the six-digit code as an explicit opt-out fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, pairingRequired: true, paired: false }),
    );
    globalThis.fetch = fetchMock;

    const result = await detectZeloImpressao({ autoConnect: false });

    expect(result.paired).toBe(false);
    expect(result.autoConnected).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.message).toBe(ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE);
  });

  it('does not expose the old agent response when automatic connection is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, pairingRequired: true, paired: false }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
    globalThis.fetch = fetchMock;

    const result = await detectZeloImpressao();

    expect(result.paired).toBe(false);
    expect(result.message).toBe(ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE);
    expect(result.message).not.toContain('Not Found');
  });
});
