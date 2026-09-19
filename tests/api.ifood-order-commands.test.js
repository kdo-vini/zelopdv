import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIfoodCommandService } from '../src/lib/server/ifood/commandService.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORDER_ID = '22222222-2222-4222-8222-222222222222';
const EMPRESA_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'auth-fixture';
const SECRET = 'credential-fixture';

const INTENTS = [
  ['confirm', 'pedidos.acessar'],
  ['start_preparation', 'pedidos.cozinha'],
  ['ready_to_pickup', 'pedidos.cozinha'],
  ['dispatch', 'pedidos.acessar'],
  ['verify_delivery_code', 'pedidos.acessar'],
  ['cancel', 'pedidos.cancelar'],
];

function makeRequest({ token = TOKEN, body = {}, invalidJson = false } = {}) {
  return {
    headers: {
      get: (name) => name.toLowerCase() === 'authorization' && token
        ? `Bearer ${token}`
        : null,
    },
    json: vi.fn(async () => {
      if (invalidJson) throw new Error('invalid json');
      return body;
    }),
  };
}

function makeRpcResult(result) {
  return {
    single: vi.fn(async () => ({ data: result, error: null })),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  };
}

function makeSupabase({ user = { id: 'owner-1' }, authError = null, rpcResults = {}, profile = { id: EMPRESA_ID }, rpcError = null } = {}) {
  const rpc = vi.fn((name) => {
    const result = rpcResults[name] ?? null;
    return {
      single: vi.fn(async () => ({ data: result, error: rpcError })),
      maybeSingle: vi.fn(async () => ({ data: result, error: rpcError })),
      then: (resolve, reject) => Promise.resolve({ data: result, error: rpcError }).then(resolve, reject),
    };
  });

  const from = vi.fn((table) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: table === 'empresa_perfil' ? profile : null, error: null })),
    };
    return query;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: authError })),
    },
    from,
    rpc,
    _unused: makeRpcResult,
  };
}

function baseAccessContext(overrides = {}) {
  return {
    isSubUser: false,
    ownerUserId: 'owner-1',
    roleId: null,
    permissions: null,
    ...overrides,
  };
}

function commandBody(intent = 'confirm', overrides = {}) {
  return { intent, expectedRevision: 1, ...overrides };
}

function extrasForIntent(intent) {
  if (intent === 'cancel') return { cancellationCode: '501' };
  if (intent === 'verify_delivery_code') return { code: '654321' };
  return {};
}

async function loadCommandsRoute({ supabase, accessContext = baseAccessContext(), adapter } = {}) {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env: {
    IFOOD_CLIENT_ID: 'provider-client-fixture',
    IFOOD_CLIENT_SECRET: SECRET,
  } }));
  vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: supabase }));
  vi.doMock('$lib/server/accessControl.js', () => ({
    getServerAccessContext: vi.fn(async () => accessContext),
  }));
  if (adapter) {
    vi.doMock('../src/lib/server/ifood/adapters/httpIfoodAdapter.js', () => ({
      createHttpIfoodAdapter: vi.fn(() => adapter),
    }));
  }
  return import('../src/routes/api/integrations/ifood/orders/[orderId]/commands/+server.js');
}

async function loadCancellationRoute({ supabase, accessContext = baseAccessContext(), adapter, env = {} } = {}) {
  vi.resetModules();
  vi.doMock('$env/dynamic/private', () => ({ env }));
  vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: supabase }));
  vi.doMock('$lib/server/accessControl.js', () => ({
    getServerAccessContext: vi.fn(async () => accessContext),
  }));
  vi.doMock('$lib/server/ifood/adapters/httpIfoodAdapter.js', () => ({
    createHttpIfoodAdapter: vi.fn(() => adapter),
  }));
  return import('../src/routes/api/integrations/ifood/orders/[orderId]/cancellation-reasons/+server.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('createIfoodCommandService', () => {
  it('authenticates, resolves access, derives a server-owned idempotency key, and queues an intent', async () => {
    const repository = {
      enqueueCommand: vi.fn(async (input) => ({
        outcome: 'queued',
        commandId: 'command-1',
        status: 'queued',
        received: input,
      })),
    };
    const accessResolver = vi.fn(async () => baseAccessContext());
    const service = createIfoodCommandService({ repository, accessResolver });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: commandBody('confirm'),
    });

    expect(result).toEqual({ status: 202, body: { commandId: 'command-1', status: 'queued' } });
    expect(accessResolver).toHaveBeenCalledWith('owner-1');
    expect(repository.enqueueCommand).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: EMPRESA_ID,
      zeloOrderId: ORDER_ID,
      intent: 'confirm',
      expectedRevision: 1,
      idempotencyKey: `ifood:command:v1:${EMPRESA_ID}:${ORDER_ID}:confirm:1`,
      payload: {},
    }));
  });

  it('maps every repository outcome to a stable HTTP result', async () => {
    const outcomes = [
      ['queued', 202, { commandId: 'command-1', status: 'queued' }],
      ['requeued', 202, { commandId: 'command-1', status: 'queued' }],
      ['duplicate', 200, { commandId: 'command-1', status: 'accepted_http' }],
      ['not_found', 404, { error: 'order_not_found' }],
      ['revision_conflict', 409, { error: 'revision_conflict' }],
      ['connection_unavailable', 409, { error: 'connection_unavailable' }],
      ['invalid_transition', 422, { error: 'invalid_transition' }],
      ['invalid_payload', 422, { error: 'invalid_payload' }],
    ];

    for (const [outcome, status, body] of outcomes) {
      const repository = {
        enqueueCommand: vi.fn(async () => ({
          outcome,
          commandId: 'command-1',
          status: outcome === 'duplicate' ? 'accepted_http' : 'queued',
        })),
      };
      const service = createIfoodCommandService({
        repository,
        accessResolver: async () => baseAccessContext(),
      });

      const result = await service.enqueueCommand({
        authResult: { user: { id: 'owner-1' } },
        empresaId: EMPRESA_ID,
        orderId: ORDER_ID,
        body: commandBody('confirm'),
      });

      expect(result).toEqual({ status, body });
    }
  });

  it('returns 401 before access or repository work when authentication is missing', async () => {
    const accessResolver = vi.fn();
    const repository = { enqueueCommand: vi.fn() };
    const service = createIfoodCommandService({ repository, accessResolver });

    await expect(service.enqueueCommand({
      authResult: null,
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: commandBody(),
    })).resolves.toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(accessResolver).not.toHaveBeenCalled();
    expect(repository.enqueueCommand).not.toHaveBeenCalled();
  });

  it.each(INTENTS)('allows a sub-user with the PDV-aligned permission for %s', async (intent, permission) => {
    const repository = { enqueueCommand: vi.fn(async () => ({ outcome: 'queued', commandId: 'command-1', status: 'queued' })) };
    const service = createIfoodCommandService({
      repository,
      accessResolver: async () => baseAccessContext({
        isSubUser: true,
        roleId: 'role-1',
        permissions: { [permission]: true },
      }),
    });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'sub-user-1' } },
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: commandBody(intent, extrasForIntent(intent)),
    });

    expect(result.status).toBe(202);
    expect(repository.enqueueCommand).toHaveBeenCalledOnce();
  });

  it.each(INTENTS)('returns 403 when a sub-user lacks the permission for %s', async (intent) => {
    const repository = { enqueueCommand: vi.fn() };
    const service = createIfoodCommandService({
      repository,
      accessResolver: async () => baseAccessContext({ isSubUser: true, permissions: {} }),
    });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'sub-user-1' } },
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: commandBody(intent, extrasForIntent(intent)),
    });

    expect(result).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(repository.enqueueCommand).not.toHaveBeenCalled();
  });

  it('does not trust a client idempotency key and turns missing cancellation code into 422', async () => {
    const repository = { enqueueCommand: vi.fn() };
    const service = createIfoodCommandService({
      repository,
      accessResolver: async () => baseAccessContext(),
    });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: { ...commandBody('cancel'), idempotencyKey: 'attacker-chosen-key' },
    });

    expect(result).toEqual({ status: 422, body: { error: 'invalid_payload' } });
    expect(repository.enqueueCommand).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when the repository fails without exposing its error', async () => {
    const secret = 'db-detail-fixture-not-forwarded';
    const repository = { enqueueCommand: vi.fn(async () => { throw new Error(secret); }) };
    const service = createIfoodCommandService({
      repository,
      accessResolver: async () => baseAccessContext(),
    });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderId: ORDER_ID,
      body: commandBody(),
    });

    expect(result.status).toBe(500);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('POST /api/integrations/ifood/orders/:orderId/commands', () => {
  it('returns 401 for a missing or invalid bearer token', async () => {
    const supabase = makeSupabase({ authError: { code: 'AUTH_FAILED' } });
    const route = await loadCommandsRoute({ supabase });

    const missing = await route.POST({ request: makeRequest({ token: null, body: commandBody() }), params: { orderId: ORDER_ID } });
    const invalid = await route.POST({ request: makeRequest({ body: commandBody() }), params: { orderId: ORDER_ID } });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('queues an owner command with the server-resolved empresa and never calls iFood', async () => {
    const adapter = { confirm: vi.fn(), requestCancellation: vi.fn() };
    const supabase = makeSupabase({ rpcResults: {
      enqueue_ifood_order_command_v1: { outcome: 'queued', command_id: 'command-1', status: 'queued' },
    } });
    const route = await loadCommandsRoute({ supabase, adapter });

    const response = await route.POST({
      request: makeRequest({ body: commandBody('confirm', { empresaId: 'forged-company' }) }),
      params: { orderId: ORDER_ID },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ commandId: 'command-1', status: 'queued' });
    expect(supabase.rpc).toHaveBeenCalledWith('enqueue_ifood_order_command_v1', expect.objectContaining({
      p_empresa_id: EMPRESA_ID,
      p_zelo_order_id: ORDER_ID,
      p_intent: 'confirm',
      p_expected_revision: 1,
    }));
    expect(adapter.confirm).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(INTENTS)('allows an owner or correctly-permissioned sub-user command for %s', async (intent, permission) => {
    const supabase = makeSupabase({ rpcResults: {
      enqueue_ifood_order_command_v1: { outcome: 'queued', command_id: `command-${intent}`, status: 'queued' },
    } });
    const route = await loadCommandsRoute({
      supabase,
      accessContext: baseAccessContext({
        isSubUser: true,
        ownerUserId: 'owner-1',
        permissions: { [permission]: true },
      }),
    });

    const response = await route.POST({
      request: makeRequest({ body: commandBody(intent, extrasForIntent(intent)) }),
      params: { orderId: ORDER_ID },
    });

    expect(response.status).toBe(202);
  });

  it.each(INTENTS)('returns 403 for a sub-user without the permission for %s', async (intent) => {
    const supabase = makeSupabase();
    const route = await loadCommandsRoute({
      supabase,
      accessContext: baseAccessContext({ isSubUser: true, permissions: {} }),
    });

    const response = await route.POST({
      request: makeRequest({ body: commandBody(intent, extrasForIntent(intent)) }),
      params: { orderId: ORDER_ID },
    });

    expect(response.status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('maps cross-company, degraded connection, invalid transition, and invalid cancellation payload safely', async () => {
    const cases = [
      ['not_found', 404, commandBody('confirm')],
      ['connection_unavailable', 409, commandBody('confirm')],
      ['invalid_transition', 422, commandBody('confirm')],
      ['invalid_payload', 422, commandBody('cancel')],
    ];

    for (const [outcome, status, body] of cases) {
      const supabase = makeSupabase({ rpcResults: {
        enqueue_ifood_order_command_v1: { outcome, command_id: null, status: null },
      } });
      const route = await loadCommandsRoute({ supabase });
      const response = await route.POST({ request: makeRequest({ body }), params: { orderId: ORDER_ID } });

      expect(response.status).toBe(status);
      expect((await response.text())).not.toContain('raw');
    }
  });

  it('returns 400 for a non-UUID orderId and never reaches authentication or persistence', async () => {
    const supabase = makeSupabase();
    const route = await loadCommandsRoute({ supabase });

    const response = await route.POST({
      request: makeRequest({ body: commandBody() }),
      params: { orderId: 'not-an-order-id' },
    });

    expect(response.status).toBe(400);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns a generic response when the database contains provider or PII text', async () => {
    const supabase = makeSupabase({
      rpcError: { message: 'database-detail-fixture-not-forwarded' },
    });
    const route = await loadCommandsRoute({ supabase });
    const response = await route.POST({ request: makeRequest({ body: commandBody() }), params: { orderId: ORDER_ID } });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toBe('{"error":"unavailable"}');
    expect(text).not.toContain('database-detail-fixture-not-forwarded');
  });

  it('returns duplicate on a repeated revision and does not expose a second command row', async () => {
    const enqueue = vi.fn()
      .mockResolvedValueOnce({ data: { outcome: 'queued', command_id: 'command-1', status: 'queued' }, error: null })
      .mockResolvedValueOnce({ data: { outcome: 'duplicate', command_id: 'command-1', status: 'queued' }, error: null });
    const supabase = makeSupabase();
    supabase.rpc = vi.fn(() => ({
      single: enqueue,
    }));
    const route = await loadCommandsRoute({ supabase });

    const first = await route.POST({ request: makeRequest({ body: commandBody('confirm') }), params: { orderId: ORDER_ID } });
    const second = await route.POST({ request: makeRequest({ body: commandBody('confirm') }), params: { orderId: ORDER_ID } });

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ commandId: 'command-1', status: 'queued' });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/integrations/ifood/orders/:orderId/cancellation-reasons', () => {
  function refResult(overrides = {}) {
    return {
      merchant_id: 'merchant-1',
      external_order_id: 'external-order-1',
      connection_status: 'active',
      ...overrides,
    };
  }

  it('returns 401 without a valid bearer token', async () => {
    const supabase = makeSupabase({ authError: { code: 'AUTH_FAILED' } });
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({ supabase, adapter, env: { IFOOD_CLIENT_SECRET: SECRET } });

    const response = await route.GET({ request: makeRequest({ token: null }), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(401);
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });

  it('returns 403 before resolving the order ref when the actor lacks pedidos.cancelar', async () => {
    const supabase = makeSupabase();
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({
      supabase,
      adapter,
      env: { IFOOD_CLIENT_SECRET: SECRET },
      accessContext: baseAccessContext({ isSubUser: true, permissions: {} }),
    });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });

  it('returns 404 for a cross-company/unresolved order ref', async () => {
    const supabase = makeSupabase({ rpcResults: { get_ifood_order_ref_v1: null } });
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({ supabase, adapter, env: { IFOOD_CLIENT_SECRET: SECRET } });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(404);
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the provider secret is missing', async () => {
    const supabase = makeSupabase({ rpcResults: { get_ifood_order_ref_v1: refResult() } });
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({ supabase, adapter, env: {} });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(503);
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });

  it('maps provider cancellation reasons to only code and description', async () => {
    const supabase = makeSupabase({ rpcResults: { get_ifood_order_ref_v1: refResult() } });
    const adapter = {
      getCancellationReasons: vi.fn(async () => [
        { cancelCodeId: '501', description: 'Motivo de fixture' },
        { cancelCodeId: '502', description: 'Outro motivo', extra: 'drop-me' },
      ]),
    };
    const route = await loadCancellationRoute({ supabase, adapter, env: {
      IFOOD_CLIENT_ID: 'provider-client-fixture',
      IFOOD_CLIENT_SECRET: SECRET,
    } });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { code: '501', description: 'Motivo de fixture' },
      { code: '502', description: 'Outro motivo' },
    ]);
    expect(adapter.getCancellationReasons).toHaveBeenCalledWith('external-order-1', expect.objectContaining({ signal: undefined }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sanitizes provider failures and does not return raw provider text', async () => {
    const secretMessage = 'provider-detail-fixture-not-forwarded';
    const supabase = makeSupabase({ rpcResults: { get_ifood_order_ref_v1: refResult() } });
    const adapter = {
      getCancellationReasons: vi.fn(async () => { throw new Error(secretMessage); }),
    };
    const route = await loadCancellationRoute({ supabase, adapter, env: {
      IFOOD_CLIENT_ID: 'provider-client-fixture',
      IFOOD_CLIENT_SECRET: SECRET,
    } });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });
    const text = await response.text();

    expect([502, 503]).toContain(response.status);
    expect(text).toBe('{"error":"provider_unavailable"}');
    expect(text).not.toContain(secretMessage);
  });

  it('returns connection_unavailable for a non-active connection', async () => {
    const supabase = makeSupabase({ rpcResults: {
      get_ifood_order_ref_v1: refResult({ connection_status: 'degraded' }),
    } });
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({ supabase, adapter, env: { IFOOD_CLIENT_SECRET: SECRET } });

    const response = await route.GET({ request: makeRequest(), params: { orderId: ORDER_ID } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'connection_unavailable' });
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid order UUID before external work', async () => {
    const supabase = makeSupabase();
    const adapter = { getCancellationReasons: vi.fn() };
    const route = await loadCancellationRoute({ supabase, adapter, env: { IFOOD_CLIENT_SECRET: SECRET } });

    const response = await route.GET({ request: makeRequest(), params: { orderId: 'bad-id' } });

    expect(response.status).toBe(400);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(adapter.getCancellationReasons).not.toHaveBeenCalled();
  });
});

describe('command service input boundaries', () => {
  it('rejects a reason longer than 250 characters without repository work', async () => {
    const repository = { enqueueCommand: vi.fn() };
    const service = createIfoodCommandService({
      repository,
      accessResolver: async () => baseAccessContext(),
    });

    const result = await service.enqueueCommand({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      orderId: OTHER_ORDER_ID,
      body: commandBody('cancel', { cancellationCode: '501', reason: 'x'.repeat(251) }),
    });

    expect(result).toEqual({ status: 422, body: { error: 'invalid_payload' } });
    expect(repository.enqueueCommand).not.toHaveBeenCalled();
  });
});
