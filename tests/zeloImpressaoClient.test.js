import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearZeloImpressaoPairing,
  detectZeloImpressao,
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
