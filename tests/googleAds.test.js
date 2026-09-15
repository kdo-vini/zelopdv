import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// googleAds.js só toca `window` — o ambiente de teste padrão é node, então
// cada teste monta um `window` mínimo antes de importar o módulo (import
// dinâmico, depois de `vi.resetModules()`, pra garantir um `window` fresco
// por teste sem vazar estado entre casos).
async function loadGoogleAds() {
  return import('../src/lib/googleAds.js');
}

function installWindow({ gtagImpl } = {}) {
  const sessionStore = new Map();
  const win = {
    gtag: vi.fn(gtagImpl),
    sessionStorage: {
      getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
      setItem: (k, v) => sessionStore.set(k, v),
    },
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  };
  globalThis.window = win;
  return win;
}

describe('trackGoogleAdsInscricao — tetos de espera do tracking', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
  });

  it('sem timeoutMs, resolve assim que dispara o gtag — comportamento antigo intacto', async () => {
    const win = installWindow();
    const { trackGoogleAdsInscricao } = await loadGoogleAds();

    const result = await trackGoogleAdsInscricao({ transactionId: 'trial-1' });

    expect(result).toBe(true);
    expect(win.gtag).toHaveBeenCalledTimes(1);
    const [, , params] = win.gtag.mock.calls[0];
    expect(params).not.toHaveProperty('event_callback');
    expect(params).not.toHaveProperty('event_timeout');
  });

  it('com timeoutMs, aguarda o event_callback real do gtag em vez do teto', async () => {
    let capturedCallback;
    installWindow({
      gtagImpl: (_event, _name, params) => {
        capturedCallback = params.event_callback;
      },
    });
    const { trackGoogleAdsInscricao } = await loadGoogleAds();

    const promise = trackGoogleAdsInscricao({ transactionId: 'trial-2', timeoutMs: 1000 });

    // Simula o gtag confirmando o envio bem antes do teto de 1s.
    await vi.advanceTimersByTimeAsync(50);
    expect(capturedCallback).toBeTypeOf('function');
    capturedCallback();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('com timeoutMs, resolve pelo teto quando o gtag nunca chama o callback', async () => {
    installWindow({ gtagImpl: () => {} }); // gtag "engole" o callback (ex.: extensão de bloqueio)
    const { trackGoogleAdsInscricao } = await loadGoogleAds();

    const promise = trackGoogleAdsInscricao({ transactionId: 'trial-3', timeoutMs: 1000 });

    let settled = false;
    promise.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await promise).toBe(true);
  });

  it('sem gtag disponível, não espera nada e devolve false', async () => {
    // Sem window.gtag — simula bloqueador de anúncio / gtag não carregado.
    globalThis.window = { sessionStorage: { getItem: () => null, setItem: () => {} } };
    const { trackGoogleAdsInscricao } = await loadGoogleAds();

    const result = await trackGoogleAdsInscricao({ transactionId: 'trial-4', timeoutMs: 1000 });
    expect(result).toBe(false);
  });
});
