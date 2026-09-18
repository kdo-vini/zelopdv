import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canManageIfoodConnection,
  createIfoodConnectionRepository,
  createIfoodConnectionService,
  isIfoodEligibleSubscription,
  IFOOD_CONNECTION_AUTHORIZATION_WINDOW_MS
} from '../src/lib/server/ifood/connectionService.js';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';
const STATE_SECRET = 'connection-state-secret-fixture';

function owner(overrides = {}) {
  return { isSubUser: false, ownerUserId: 'owner-a', roleId: null, permissions: null, ...overrides };
}

function subUser(permissions = {}) {
  return { isSubUser: true, ownerUserId: 'owner-a', roleId: 'role-1', permissions };
}

function activeSubscription(overrides = {}) {
  return {
    status: 'active',
    plan_tier: 'pdv',
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    manually_extended_until: null,
    ...overrides
  };
}

function trialingSubscription() {
  return activeSubscription({ status: 'trialing' });
}

function expiredSubscription() {
  return activeSubscription({ status: 'canceled', current_period_end: new Date(Date.now() - 1000).toISOString() });
}

function authResult(userId = 'owner-a') {
  return { user: { id: userId } };
}

// --- Fake repository, faithful to `upsert_ifood_connection_v1`'s contract:
// unique merchant_id across tenants, live (non-revoked) connection blocks a
// different merchant on the SAME empresa, and `getConnection` never leaks a
// row belonging to another empresa. ---
function createFakeRepository({ activeOrderCount = 0 } = {}) {
  const byEmpresa = new Map();
  const byMerchant = new Map();
  let counter = 0;

  async function getConnection({ empresaId } = {}) {
    const row = byEmpresa.get(empresaId);
    return row ? { ...row } : null;
  }

  async function upsertConnection({ empresaId, merchantId, status } = {}) {
    const existing = byEmpresa.get(empresaId);

    if (existing && existing.merchantId !== merchantId && existing.status !== 'revoked') {
      return { outcome: 'conflict_other_merchant', connectionId: existing.connectionId, merchantId: existing.merchantId, status: existing.status };
    }

    if (existing && existing.merchantId === merchantId) {
      existing.status = status;
      existing.updatedAt = new Date().toISOString();
      return { outcome: 'updated', connectionId: existing.connectionId, merchantId, status };
    }

    const ownerOfMerchant = byMerchant.get(merchantId);
    if (ownerOfMerchant && ownerOfMerchant !== empresaId) {
      return { outcome: 'merchant_taken', connectionId: null, merchantId, status: null };
    }

    counter += 1;
    const row = {
      connectionId: `conn-${counter}`,
      merchantId,
      status,
      printOwner: 'zelo',
      lastWebhookAt: null,
      lastPollAt: null,
      lastTokenAt: null,
      workerHeartbeatAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    byEmpresa.set(empresaId, row);
    byMerchant.set(merchantId, empresaId);
    return { outcome: 'created', connectionId: row.connectionId, merchantId, status };
  }

  async function countActiveOrders() {
    return activeOrderCount;
  }

  return Object.freeze({ getConnection, upsertConnection, countActiveOrders });
}

function createFakeAdapter({ connected = new Set() } = {}) {
  return {
    async connectMerchant({ merchantId }) {
      return { merchantId, connected: connected.has(merchantId) };
    }
  };
}

function createService({ repository = createFakeRepository(), adapter = createFakeAdapter(), clock } = {}) {
  return createIfoodConnectionService({ repository, adapter, stateSecret: STATE_SECRET, ...(clock ? { clock } : {}) });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('canManageIfoodConnection / isIfoodEligibleSubscription', () => {
  it('owners always manage; sub-users need the explicit capability', () => {
    expect(canManageIfoodConnection(owner())).toBe(true);
    expect(canManageIfoodConnection(subUser())).toBe(false);
    expect(canManageIfoodConnection(subUser({ 'integracoes.ifood.gerenciar': true }))).toBe(true);
    expect(canManageIfoodConnection(subUser({ 'produtos.gerenciar': true }))).toBe(false);
    expect(canManageIfoodConnection(null)).toBe(false);
  });

  it('every catalog plan already clears R$59+, so eligibility is just an active/trialing subscription', () => {
    expect(isIfoodEligibleSubscription(activeSubscription({ plan_tier: 'pdv' }))).toBe(true);
    expect(isIfoodEligibleSubscription(activeSubscription({ plan_tier: 'chat' }))).toBe(true);
    expect(isIfoodEligibleSubscription(activeSubscription({ plan_tier: 'bundle' }))).toBe(true);
    expect(isIfoodEligibleSubscription(trialingSubscription())).toBe(true);
    expect(isIfoodEligibleSubscription(expiredSubscription())).toBe(false);
    expect(isIfoodEligibleSubscription(null)).toBe(false);
    expect(isIfoodEligibleSubscription(activeSubscription({ plan_tier: 'not-a-real-plan' }))).toBe(false);
  });
});

describe('RED authorization matrix — GET/POST /api/integrations/ifood/connection', () => {
  it('rejects an unauthenticated caller', async () => {
    const service = createService();
    const response = await service.getStatus({
      authResult: { user: null },
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(response.status).toBe(401);
  });

  it('rejects a session with no resolvable access context', async () => {
    const service = createService();
    const response = await service.getStatus({
      authResult: authResult(),
      accessContext: null,
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(response.status).toBe(401);
  });

  it('rejects a sub-user without the capability (403), allows one with it', async () => {
    const service = createService();

    const blocked = await service.startConnection({
      authResult: authResult(),
      accessContext: subUser({ 'pdv.acessar': true }),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('forbidden');

    const allowed = await service.startConnection({
      authResult: authResult(),
      accessContext: subUser({ 'integracoes.ifood.gerenciar': true }),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body.status).toBe('pending');
  });

  it('rejects an expired subscription (402), allows an active trial and a higher plan', async () => {
    const service = createService();

    const expired = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: expiredSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    expect(expired.status).toBe(402);
    expect(expired.body.error).toBe('subscription_required');

    const trial = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: trialingSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    expect(trial.status).toBe(201);

    const higherPlan = await service.startConnection({
      authResult: authResult('owner-b'),
      accessContext: owner({ ownerUserId: 'owner-b' }),
      subscription: activeSubscription({ plan_tier: 'bundle' }),
      empresaId: EMPRESA_B,
      body: { merchantId: 'merchant-2' }
    });
    expect(higherPlan.status).toBe(201);
  });

  it('rejects an invalid merchantId', async () => {
    const service = createService();
    const response = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: '   ' }
    });
    expect(response.status).toBe(400);
  });

  it('rejects a merchantId already connected to a DIFFERENT empresa (merchant de outra empresa)', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    const first = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'shared-merchant' }
    });
    expect(first.status).toBe(201);

    const second = await service.startConnection({
      authResult: authResult('owner-b'),
      accessContext: owner({ ownerUserId: 'owner-b' }),
      subscription: activeSubscription(),
      empresaId: EMPRESA_B,
      body: { merchantId: 'shared-merchant' }
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('merchant_already_connected');
  });

  it('rejects switching merchantId on a live connection instead of silently reassigning it', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-first' }
    });

    const conflict = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-second' }
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('connection_already_exists');
    expect(conflict.body.merchantId).toBe('merchant-first');
  });
});

describe('RED authorization matrix — GET/POST /api/integrations/ifood/authorization', () => {
  it('issues a pending prompt with state+URL and never a secret', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });

    const prompt = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(prompt.status).toBe(200);
    expect(prompt.body.status).toBe('pending');
    expect(typeof prompt.body.state).toBe('string');
    expect(prompt.body.state.length).toBeGreaterThan(0);
    expect(typeof prompt.body.authorizationUrl).toBe('string');
    expect(JSON.stringify(prompt.body)).not.toMatch(/clientSecret|accessToken|IFOOD_CLIENT_SECRET/i);
  });

  it('rejects an invalid/forged state', async () => {
    const repository = createFakeRepository();
    // Provider not yet confirming `merchant-1` at startConnection time, so the
    // synchronous-activation shortcut (Alavanca 2) does not fire here and the
    // connection stays `pending` -- exactly what this test needs to exercise
    // the state comparison.
    const service = createService({ repository, adapter: createFakeAdapter() });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });

    const response = await service.checkAuthorization({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { state: 'not-the-real-state' }
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('invalid_state');
  });

  it('stays pending (202) while the provider has not confirmed the merchant yet', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository, adapter: createFakeAdapter() });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    const prompt = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });

    const response = await service.checkAuthorization({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { state: prompt.body.state }
    });
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('pending');
  });

  it('activates on a confirmed state, then rejects a replay of the same state (connection_not_pending)', async () => {
    const repository = createFakeRepository();
    // Not confirmed yet at startConnection time -- stays `pending` so this
    // test can exercise `checkAuthorization` doing the activation, same as
    // before the synchronous-activation shortcut (Alavanca 2) existed. The
    // provider "confirms" only afterwards, mirroring the owner finishing
    // authorization on iFood's side after the connection was already created.
    const connected = new Set();
    const service = createService({ repository, adapter: createFakeAdapter({ connected }) });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    connected.add('merchant-1');
    const prompt = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });

    const activated = await service.checkAuthorization({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { state: prompt.body.state }
    });
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('active');

    const replay = await service.checkAuthorization({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { state: prompt.body.state }
    });
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe('connection_not_pending');
  });

  it('expires a stale authorization window (CSRF/state expirado)', async () => {
    let now = Date.now();
    const clock = () => now;
    const repository = createFakeRepository();
    const service = createService({ repository, adapter: createFakeAdapter(), clock });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    const prompt = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(prompt.body.status).toBe('pending');

    now += IFOOD_CONNECTION_AUTHORIZATION_WINDOW_MS + 60_000;

    const expiredPrompt = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(expiredPrompt.body.status).toBe('expired');

    const response = await service.checkAuthorization({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { state: prompt.body.state }
    });
    expect(response.status).toBe(410);
    expect(response.body.error).toBe('authorization_expired');
  });

  it('returns not_connected with no prompt when there is no connection at all', async () => {
    const service = createService();
    const response = await service.getAuthorizationPrompt({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'not_connected' });
  });
});

describe('pending connection accepts webhook (Task 6 conformance, re-proven for the self-service path)', () => {
  // Mirrors `enqueue_ifood_webhook_event_v1`'s resolver predicate exactly
  // (`WHERE c.merchant_id = p_merchant_id AND c.status <> 'revoked'`): any
  // connection created by `startConnection` before authorization completes
  // must already satisfy it, or a webhook arriving mid-flow would be
  // silently dropped as `unknown_merchant`.
  function resolvesForWebhook(connection) {
    return Boolean(connection) && connection.status !== 'revoked';
  }

  it('a freshly created pending connection resolves for webhook enqueue', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    const started = await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-pending-webhook' }
    });
    expect(started.body.status).toBe('pending');

    const connection = await repository.getConnection({ empresaId: EMPRESA_A });
    expect(resolvesForWebhook(connection)).toBe(true);
  });

  it('a revoked (disconnected) connection does NOT resolve for webhook enqueue', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-revoked-webhook' }
    });
    await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'disconnect' }
    });

    const connection = await repository.getConnection({ empresaId: EMPRESA_A });
    expect(connection.status).toBe('revoked');
    expect(resolvesForWebhook(connection)).toBe(false);
  });
});

describe('PATCH /api/integrations/ifood/connection — pause/resume/disconnect', () => {
  it('blocks pause and disconnect while there are active orders', async () => {
    const repository = createFakeRepository({ activeOrderCount: 2 });
    const service = createService({ repository });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });

    const pause = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'pause' }
    });
    expect(pause.status).toBe(409);
    expect(pause.body.error).toBe('active_orders_present');
    expect(pause.body.count).toBe(2);
  });

  it('allows pause/resume/disconnect with no active orders', async () => {
    const repository = createFakeRepository();
    const service = createService({ repository });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });

    const pause = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'pause' }
    });
    expect(pause.status).toBe(200);
    expect(pause.body.status).toBe('paused');

    const resume = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'resume' }
    });
    expect(resume.status).toBe(200);
    expect(resume.body.status).toBe('active');

    const disconnect = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'disconnect' }
    });
    expect(disconnect.status).toBe(200);
    expect(disconnect.body.status).toBe('revoked');
  });

  it('rejects an unknown action and a connection that no longer exists', async () => {
    const service = createService();
    const invalidAction = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'nope' }
    });
    expect(invalidAction.status).toBe(400);

    const notConnected = await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'pause' }
    });
    expect(notConnected.status).toBe(404);
  });
});

describe('GET /api/integrations/ifood/health — sanitized, no PII/payload', () => {
  it('reports healthy for a fresh active connection with recent heartbeat/token', async () => {
    let now = Date.now();
    const repository = createFakeRepository();
    const service = createService({ repository, clock: () => now });

    await service.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });
    await service.updateConnectionStatus({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { action: 'resume' }
    });

    const response = await service.getHealth({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      workerHeartbeatAt: new Date(now).toISOString(),
      lastTokenAt: new Date(now).toISOString()
    });
    expect(response.status).toBe(200);
    expect(response.body.healthy).toBe(true);
    expect(response.body.reasons).toEqual([]);
    expect(response.body).not.toHaveProperty('merchant');
  });

  it('returns 404 when there is no connection, and reports unhealthy reasons otherwise', async () => {
    const service = createService();
    const notConnected = await service.getHealth({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(notConnected.status).toBe(404);

    const repository = createFakeRepository();
    const staleService = createService({ repository });
    await staleService.startConnection({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A,
      body: { merchantId: 'merchant-1' }
    });

    const unhealthy = await staleService.getHealth({
      authResult: authResult(),
      accessContext: owner(),
      subscription: activeSubscription(),
      empresaId: EMPRESA_A
    });
    expect(unhealthy.status).toBe(200);
    expect(unhealthy.body.healthy).toBe(false);
    expect(unhealthy.body.reasons.length).toBeGreaterThan(0);
  });
});

describe('createIfoodConnectionRepository — RPC wiring', () => {
  function makeSupabase({ rpcImpl } = {}) {
    return { rpc: vi.fn(rpcImpl) };
  }

  it('maps get_ifood_connection_v1 rows from snake_case', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({
        maybeSingle: async () => ({
          data: { connection_id: 'c1', merchant_id: 'm1', status: 'pending', print_owner: 'zelo' },
          error: null
        })
      })
    });
    const repository = createIfoodConnectionRepository({ supabase });
    const connection = await repository.getConnection({ empresaId: EMPRESA_A });
    expect(connection).toMatchObject({ connectionId: 'c1', merchantId: 'm1', status: 'pending', printOwner: 'zelo' });
    expect(supabase.rpc).toHaveBeenCalledWith('get_ifood_connection_v1', { p_empresa_id: EMPRESA_A });
  });

  it('throws a generic error on RPC failure without leaking driver details', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'leaky detail' } }) })
    });
    const repository = createIfoodConnectionRepository({ supabase });
    await expect(repository.getConnection({ empresaId: EMPRESA_A })).rejects.toThrow(
      /iFood connection repository operation failed/
    );
  });

  it('requires a supabase client with rpc()', () => {
    expect(() => createIfoodConnectionRepository({})).toThrow(TypeError);
  });
});
