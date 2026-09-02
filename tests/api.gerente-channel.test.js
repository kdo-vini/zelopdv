import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest(body, key = 'secret') {
  return { headers: { get: (name) => (name.toLowerCase() === 'x-gerente-channel-key' ? key : null) }, json: async () => body };
}

describe('API: gerente/channel', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  function mock(handleResult = { reply: 'Olá!', pending_action: null, paired: true }) {
    vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'k', GERENTE_CHANNEL_INTERNAL_KEY: 'secret', GERENTE_AGENT_ENABLED: 'true' } }));
    vi.doMock('openai', () => ({ default: class { constructor() { this.chat = {}; } } }));
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));
    vi.doMock('$lib/server/rateLimit', () => ({ buildRateLimitKey: (...p) => p.join(':'), enforceRateLimit: () => ({ ok: true }), createRateLimitResponse: vi.fn() }));
    const handleChannelMessage = vi.fn(async () => handleResult);
    vi.doMock('$lib/server/gerente/channel', () => ({ handleChannelMessage }));
    return { handleChannelMessage };
  }

  it('recusa chave errada com 401', async () => {
    mock();
    const { POST } = await import('../src/routes/api/gerente/channel/+server.js');
    const response = await POST({ request: makeRequest({ phone: '5514999991234', text: 'oi', kind: 'message', message_id: 'm1' }, 'wrong') });
    expect(response.status).toBe(401);
  });

  it('repassa a mensagem e devolve o resultado', async () => {
    const { handleChannelMessage } = mock();
    const { POST } = await import('../src/routes/api/gerente/channel/+server.js');
    const response = await POST({ request: makeRequest({ phone: '5514999991234', text: 'oi', kind: 'message', message_id: 'm1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: 'Olá!', pending_action: null, paired: true });
    expect(handleChannelMessage).toHaveBeenCalledWith(expect.objectContaining({ phone: '5514999991234', text: 'oi', kind: 'message', actionId: null }));
  });

  it('valida kind e tamanho do texto', async () => {
    mock();
    const { POST } = await import('../src/routes/api/gerente/channel/+server.js');
    expect((await POST({ request: makeRequest({ phone: '5514999991234', text: 'oi', kind: 'explodir', message_id: 'm1' }) })).status).toBe(400);
    expect((await POST({ request: makeRequest({ phone: '5514999991234', text: 'x'.repeat(1501), kind: 'message', message_id: 'm1' }) })).status).toBe(400);
    expect((await POST({ request: makeRequest({ phone: '5514999991234', kind: 'confirm', message_id: 'm1' }) })).status).toBe(400);
  });

  it('503 sem chave configurada', async () => {
    mock();
    vi.doMock('$env/dynamic/private', () => ({ env: { OPENAI_API_KEY: 'k' } }));
    const { POST } = await import('../src/routes/api/gerente/channel/+server.js');
    expect((await POST({ request: makeRequest({ phone: '5514999991234', text: 'oi', kind: 'message', message_id: 'm1' }) })).status).toBe(503);
  });
});
