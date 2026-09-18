import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/billing/start-trial/+server.js');

function makeChain(getResult) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: getResult() ?? null, error: null })),
  };
  return chain;
}

function makeSupabaseAdmin(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.user ?? { id: 'user-1', email: 'user@test.com', user_metadata: {} } },
        error: state.authError ?? null,
      })),
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => makeChain(() => state.selectResults?.[table] ?? null)),
      insert: vi.fn((payload) => {
        state.writes.push({ table, operation: 'insert', payload });
        return Promise.resolve({ data: payload, error: state.insertErrors?.[table] ?? null });
      }),
      update: vi.fn((payload) => ({
        eq: vi.fn(async () => {
          state.writes.push({ table, operation: 'update', payload });
          return { error: state.updateErrors?.[table] ?? null };
        }),
      })),
    })),
  };
}

function makeRequest({ token = 'token' } = {}) {
  return {
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'authorization') return token ? `Bearer ${token}` : null;
        return null;
      },
    },
  };
}

function makeCookies(values = {}) {
  return { get: (name) => values[name] ?? null };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('API: billing/start-trial', () => {
  it('responde assim que a subscription é gravada, sem esperar e-mail/WhatsApp/referral/CAPI/PostHog', async () => {
    const state = {
      user: { id: 'user-1', email: 'user@test.com', user_metadata: {} },
      writes: [],
      selectResults: {
        subscriptions: null,
        empresa_perfil: { nome_exibicao: 'Loja Teste', contato: '11999999999' },
        email_onboarding_logs: null,
      },
    };

    const background = [];
    vi.doMock('@vercel/functions', () => ({ waitUntil: (p) => background.push(p) }));
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));

    // Nunca resolvem sozinhos — só quando o teste chamar resolve*() abaixo.
    // Isso prova que a resposta não fica presa esperando por eles.
    let resolveSendEmail;
    const sendEmail = vi.fn(() => new Promise((resolve) => { resolveSendEmail = resolve; }));
    vi.doMock('$lib/server/email', () => ({ sendEmail, isEmailConfigured: () => true }));

    let resolveWhatsApp;
    const enviarBoasVindasDetalhado = vi.fn(() => new Promise((resolve) => { resolveWhatsApp = resolve; }));
    vi.doMock('$lib/server/whatsapp', () => ({
      enviarBoasVindasDetalhado,
      getWhatsAppSendError: () => 'erro',
    }));

    const ensureReferralCodeForEmpresa = vi.fn(async () => {});
    const progressReferralForUser = vi.fn(async () => ({ claimed: false }));
    vi.doMock('$lib/server/referrals', () => ({ ensureReferralCodeForEmpresa, progressReferralForUser }));

    const sendCapiEvent = vi.fn(async () => null);
    vi.doMock('$lib/server/metaCapi', () => ({ sendCapiEvent }));

    const posthogFlush = vi.fn(async () => {});
    const posthogCapture = vi.fn();
    vi.doMock('$lib/server/posthog', () => ({
      getPostHogClient: () => ({ capture: posthogCapture, flush: posthogFlush }),
    }));

    const { POST } = await loadHandler();

    const response = await POST({
      request: makeRequest(),
      cookies: makeCookies(),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.trialEnd).toBe('string');
    // Contrato mudou: onboarding.emailDay0Sent/whatsappDay0Sent não existem mais.
    // Nenhum consumidor em src/, admin-dashboard/ ou tests/ lia esses campos
    // (grep confirmado antes da mudança).
    expect(body.onboarding).toBeUndefined();

    // A subscription foi inserida ANTES da resposta sair — é o que garante acesso.
    const subInsert = state.writes.find((w) => w.table === 'subscriptions' && w.operation === 'insert');
    expect(subInsert).toBeTruthy();
    expect(subInsert.payload.status).toBe('trialing');
    expect(subInsert.payload.user_id).toBe('user-1');

    // Exatamente um trabalho de background foi agendado via waitUntil.
    expect(background).toHaveLength(1);
    let backgroundSettled = false;
    background[0].then(() => { backgroundSettled = true; });
    // Dá espaço pro background avançar até onde ele consegue ir sozinho
    // (fetchPerfil, referral, CAPI) sem resolver os mocks pendentes — um
    // tick de macrotask garante que a fila de microtasks já foi drenada.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A resposta já saiu (200 acima) enquanto e-mail e WhatsApp ainda estão em voo.
    expect(sendEmail).toHaveBeenCalled();
    expect(enviarBoasVindasDetalhado).toHaveBeenCalled();
    expect(backgroundSettled).toBe(false);

    // Efeitos que não dependem de e-mail/WhatsApp já rodaram em background.
    expect(progressReferralForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wantedStatus: 'trial_started', source: 'start-trial' }),
    );
    expect(sendCapiEvent).toHaveBeenCalled();

    // Libera os dois mocks pendentes e espera o background terminar de vez.
    resolveSendEmail(true);
    resolveWhatsApp({ ok: true, status: 200, body: {} });
    await background[0];

    expect(backgroundSettled).toBe(true);
    expect(state.writes.some((w) => w.table === 'email_onboarding_logs' && w.operation === 'insert')).toBe(true);
    expect(state.writes.some((w) => w.table === 'subscriptions' && w.operation === 'update')).toBe(true);
    expect(posthogFlush).toHaveBeenCalled();
  });

  it('quando já existe subscription, responde com alreadyExists e manda onboarding/referral pra background', async () => {
    const state = {
      user: { id: 'user-2', email: 'user2@test.com', user_metadata: {} },
      writes: [],
      selectResults: {
        subscriptions: {
          id: 'sub-1',
          status: 'trialing',
          current_period_end: '2026-10-01T00:00:00.000Z',
          whatsapp_onboarding_sent_at: '2026-09-01T00:00:00.000Z',
        },
        empresa_perfil: { nome_exibicao: 'Loja Existente', contato: '11988888888' },
        email_onboarding_logs: { id: 'log-1' },
      },
    };

    const background = [];
    vi.doMock('@vercel/functions', () => ({ waitUntil: (p) => background.push(p) }));
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));

    const sendEmail = vi.fn(async () => true);
    vi.doMock('$lib/server/email', () => ({ sendEmail, isEmailConfigured: () => true }));

    const enviarBoasVindasDetalhado = vi.fn(async () => ({ ok: true, status: 200, body: {} }));
    vi.doMock('$lib/server/whatsapp', () => ({
      enviarBoasVindasDetalhado,
      getWhatsAppSendError: () => 'erro',
    }));

    const progressReferralForUser = vi.fn(async () => ({ claimed: false }));
    vi.doMock('$lib/server/referrals', () => ({
      ensureReferralCodeForEmpresa: vi.fn(async () => {}),
      progressReferralForUser,
    }));
    vi.doMock('$lib/server/metaCapi', () => ({ sendCapiEvent: vi.fn(async () => null) }));
    vi.doMock('$lib/server/posthog', () => ({ getPostHogClient: () => null }));

    const { POST } = await loadHandler();
    const response = await POST({ request: makeRequest(), cookies: makeCookies() });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      trialEnd: '2026-10-01T00:00:00.000Z',
      alreadyExists: true,
    });

    // Nenhuma linha nova de subscription é escrita neste caminho.
    expect(state.writes.some((w) => w.table === 'subscriptions' && w.operation === 'insert')).toBe(false);

    expect(background).toHaveLength(1);
    await background[0];

    // whatsapp_onboarding_sent_at já estava preenchido: não reenvia WhatsApp.
    expect(enviarBoasVindasDetalhado).not.toHaveBeenCalled();
    expect(progressReferralForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', wantedStatus: 'trial_started', source: 'start-trial-existing' }),
    );
  });
});
