import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loadWhatsapp = async () => await import('../src/lib/server/whatsapp.js');

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('server WhatsApp sender', () => {
  it('sends onboarding messages through ZeloChat internal POST API', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: {
        ZELOCHAT_INTERNAL_API_KEY: 'test-key',
        ZELOCHAT_INTERNAL_SEND_URL: 'https://chat.test/internal/whatsapp/send-text',
      },
    }));

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { enviarBoasVindas, isWhatsAppConfigured } = await loadWhatsapp();
    const sent = await enviarBoasVindas('+55 11 99999-9999', 'Vini');

    expect(isWhatsAppConfigured()).toBe(true);
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://chat.test/internal/whatsapp/send-text');
    expect(options.method).toBe('POST');
    expect(options.headers['X-ZeloChat-Internal-Key']).toBe('test-key');
    expect(JSON.parse(options.body)).toMatchObject({
      to: '5511999999999',
    });
    expect(JSON.parse(options.body).message).toContain('Vini');
  });

  it('defaults to the ZeloChat backend API host', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: {
        ZELOCHAT_INTERNAL_API_KEY: 'test-key',
      },
    }));

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { enviarBoasVindas } = await loadWhatsapp();
    await enviarBoasVindas('5511999999999', 'Vini');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://chat.zelopdv.com.br/internal/whatsapp/send-text'
    );
  });

  it('builds the send URL from ZELOCHAT_API_BASE_URL when provided', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: {
        ZELOCHAT_INTERNAL_API_KEY: 'test-key',
        ZELOCHAT_API_BASE_URL: 'https://zelochat.example.com/',
      },
    }));

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { enviarBoasVindas } = await loadWhatsapp();
    await enviarBoasVindas('5511999999999', 'Vini');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://zelochat.example.com/internal/whatsapp/send-text'
    );
  });

  it('does not send when the ZeloChat internal key is missing', async () => {
    vi.doMock('$env/dynamic/private', () => ({ env: {} }));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { enviarBoasVindas, isWhatsAppConfigured } = await loadWhatsapp();
    const sent = await enviarBoasVindas('5511999999999', 'Vini');

    expect(isWhatsAppConfigured()).toBe(false);
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the provider error for onboarding logs', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: {
        ZELOCHAT_INTERNAL_API_KEY: 'test-key',
        ZELOCHAT_INTERNAL_SEND_URL: 'https://chat.test/internal/whatsapp/send-text',
      },
    }));

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: 'TECHNE_WHATSAPP_NOT_CONNECTED', message: 'Instância desconectada' }),
      { status: 409 }
    ));
    vi.stubGlobal('fetch', fetchMock);

    const { enviarFollowup28dDetalhado, getWhatsAppSendError } = await loadWhatsapp();
    const result = await enviarFollowup28dDetalhado('5511999999999', 'Vini');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(getWhatsAppSendError(result)).toBe('Instância desconectada');
  });
});
