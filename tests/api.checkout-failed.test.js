import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// O funil só enxergava o lado feliz: `stripe_checkout_created` e
// `pix_charge_created`. Quem clicou em assinar e foi recusado pelo servidor
// sumia, e o buraco entre "abriu /assinatura" e "cobrança criada" ficava sem
// explicação. `checkout_failed` fecha isso.

const CARD = '../src/routes/api/billing/create-subscription/+server.js';
const PIX = '../src/routes/api/billing/pix/create/+server.js';

function makeRequest({ token = 'token', body = {} } = {}) {
  return {
    headers: { get: (name) => (name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) },
    json: async () => body,
  };
}

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result ?? null, error: null })),
    single: vi.fn(async () => ({ data: result ?? null, error: null })),
  };
  return chain;
}

function makeSupabaseAdmin({ user = { id: 'owner-1', email: 'dono@test.t' }, perfil = null } = {}) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => makeSelectChain(perfil)),
      // `last_seen_at` e fire-and-forget encadeando .then().catch() — tem que
      // ser Promise de verdade, senao o handler morre no catch geral.
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
  };
}

/** Coleta os eventos que o handler mandou pro PostHog. */
function makeAnalytics() {
  const captured = [];
  const background = [];
  vi.doMock('@vercel/functions', () => ({ waitUntil: (p) => background.push(p) }));
  vi.doMock('$lib/server/posthog', () => ({
    getPostHogClient: () => ({
      capture: (event) => captured.push(event),
      flush: async () => {},
    }),
  }));
  return {
    captured,
    settle: async () => { await Promise.all(background); },
    failures: () => captured.filter((e) => e.event === 'checkout_failed'),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('checkout_failed: cartão', () => {
  // O cartão não gateia mais por perfil incompleto (Fase 2.2 do onboarding em
  // dois passos): Stripe não exige documento e o produto não emite NFC-e. Quem
  // chega aqui sem CPF/CNPJ segue pro Checkout normalmente — ver
  // tests/api.create-subscription.test.js. `profile_incomplete` continua vivo
  // só do lado Pix, abaixo.

  it('registra sessão inválida mesmo sem ter a quem atribuir', async () => {
    const analytics = makeAnalytics();
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin() }));
    vi.doMock('$lib/server/stripe', () => ({ stripe: {} }));

    const { POST } = await import(CARD);
    const res = await POST({
      request: makeRequest({ token: null }),
      url: new URL('https://zelopdv.com.br/assinatura'),
      cookies: { get: () => null },
    });
    await analytics.settle();

    expect(res.status).toBe(401);
    expect(analytics.failures()[0]).toMatchObject({
      distinctId: 'anonymous',
      properties: { reason: 'unauthenticated', payment_method: 'card' },
    });
  });

  it('registra plano invalido com a selecao que o cliente mandou', async () => {
    const analytics = makeAnalytics();
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin() }));
    vi.doMock('$lib/server/stripe', () => ({ stripe: {} }));

    const { POST } = await import(CARD);
    const res = await POST({
      request: makeRequest({ body: { planTier: 'plano-que-nao-existe' } }),
      url: new URL('https://zelopdv.com.br/assinatura'),
      cookies: { get: () => null },
    });
    await analytics.settle();

    expect(res.status).toBe(400);
    expect(analytics.failures()[0].properties).toMatchObject({
      reason: 'invalid_plan',
      plan: 'plano-que-nao-existe',
    });
  });
});

describe('checkout_failed: Pix', () => {
  it('registra o perfil sem CPF/CNPJ que impede a cobranca', async () => {
    const analytics = makeAnalytics();
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin({ perfil: { nome_exibicao: 'Fixture', documento: null, contato: null } }),
    }));
    vi.doMock('$lib/server/accessControl', () => ({
      getServerAccessContext: vi.fn(async () => ({ isSubUser: false, ownerUserId: 'owner-1' })),
      resolveOwnerUserId: vi.fn(async () => 'owner-1'),
    }));
    vi.doMock('$lib/server/abacatePay', () => ({ isAbacatePayConfigured: () => true }));

    const { POST } = await import(PIX);
    const res = await POST({ request: makeRequest({ body: { planTier: 'pdv' } }) });
    await analytics.settle();

    expect(res.status).toBe(400);
    expect(analytics.failures()[0].properties).toMatchObject({
      payment_method: 'pix',
      reason: 'profile_incomplete',
      origin: 'server',
      plan: 'pdv',
    });
  });

  it('registra subusuario barrado no billing', async () => {
    const analytics = makeAnalytics();
    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: makeSupabaseAdmin({ user: { id: 'sub-1', email: 'operador@test.t' } }),
    }));
    vi.doMock('$lib/server/accessControl', () => ({
      getServerAccessContext: vi.fn(async () => ({ isSubUser: true, ownerUserId: 'owner-1' })),
      resolveOwnerUserId: vi.fn(async () => 'owner-1'),
    }));
    vi.doMock('$lib/server/abacatePay', () => ({ isAbacatePayConfigured: () => true }));

    const { POST } = await import(PIX);
    const res = await POST({ request: makeRequest({ body: { planTier: 'pdv' } }) });
    await analytics.settle();

    expect(res.status).toBe(403);
    expect(analytics.failures()[0]).toMatchObject({
      distinctId: 'sub-1',
      properties: { reason: 'subuser_forbidden', payment_method: 'pix' },
    });
  });
});

describe('checkout_failed: nenhuma saida de erro escapa', () => {
  // Esta e a assercao que impede a classe de bug: instrumentacao espalhada por
  // dez `return json(...)`, onde um caminho novo simplesmente esquece de somar
  // o evento e ninguem ve faltando, porque falta em silencio.
  it.each([
    ['cartão', 'src/routes/api/billing/create-subscription/+server.js'],
    ['Pix', 'src/routes/api/billing/pix/create/+server.js'],
  ])('%s devolve erro apenas via checkoutFailed', (_label, file) => {
    const source = readFileSync(resolve(file), 'utf8');
    // `json(...)` cru com status de erro significa um caminho fora do helper.
    expect(source).not.toMatch(/return json\((?:[^;]|\n)*?status:\s*[45]/);
    expect(source).toContain("import { checkoutFailed, CHECKOUT_FAILURE_REASONS as WHY } from '$lib/server/checkoutFailure'");
    expect(source).toMatch(/const fail = \(params\) => checkoutFailed\(/);
  });

  it('a tela de assinatura so reporta o que o servidor nao pode ver', () => {
    const page = readFileSync(resolve('src/routes/assinatura/+page.svelte'), 'utf8');
    // Sem isto o `!res.ok` dobraria a contagem: o servidor ja registrou.
    expect(page).toMatch(/reportCheckoutFailed\('card', 'no_session'\)/);
    expect(page).toMatch(/reportCheckoutFailed\('pix', 'no_session'\)/);
    expect(page).toMatch(/reportCheckoutFailed\('card', 'network'\)/);
    expect(page).toMatch(/reportCheckoutFailed\('pix', 'network'\)/);
    const okBranch = page.slice(page.indexOf('if (!res.ok)'), page.indexOf('if (!res.ok)') + 400);
    expect(okBranch).not.toContain('reportCheckoutFailed');
  });
});
