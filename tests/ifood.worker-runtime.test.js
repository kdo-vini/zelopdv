import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  IfoodWorkerConfigError,
  loadIfoodWorkerConfig
} from '../workers/ifood/config.js';
import {
  abortableDelay,
  runIfoodWorker,
  sanitizeWorkerError
} from '../workers/ifood/runtime.js';
import {
  createHealthServer,
  createHealthState
} from '../workers/ifood/healthServer.js';
import {
  createUnreadyWorkerDependencies,
  createWorkerDependencies,
  main
} from '../workers/ifood/index.js';
import {
  createIfoodSupabaseRepository,
  IFOOD_LEASE_PROBE
} from '../workers/ifood/supabaseRepository.js';

function validEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-canary',
    ...overrides
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('condition did not become true'));
        return;
      }
      setTimeout(check, 1);
    };
    check();
  });
}

describe('iFood worker configuration', () => {
  it('requires Supabase URL and service-role key without echoing secrets', () => {
    expect(() => loadIfoodWorkerConfig({})).toThrow(IfoodWorkerConfigError);

    try {
      loadIfoodWorkerConfig({
        SUPABASE_URL: 'https://project.example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'canary-secret-value'
      });
    } catch (error) {
      throw error;
    }

    for (const env of [
      { SUPABASE_SERVICE_ROLE_KEY: 'canary-secret-value' },
      { SUPABASE_URL: 'ftp://project.example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'canary-secret-value' },
      { SUPABASE_URL: 'https://project.example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '   ' }
    ]) {
      let error;
      try {
        loadIfoodWorkerConfig(env);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(IfoodWorkerConfigError);
      expect(error.message).not.toContain('canary-secret-value');
      expect(error.message).not.toContain('service-role-secret-canary');
    }
  });

  it('applies safe defaults and port precedence', () => {
    expect(loadIfoodWorkerConfig(validEnv())).toMatchObject({
      workerId: 'ifood-worker',
      host: '0.0.0.0',
      port: 3000,
      intervalMs: 300000,
      readyMaxAgeMs: 90000,
      shutdownTimeoutMs: 15000
    });

    expect(loadIfoodWorkerConfig(validEnv({
      IFOOD_WORKER_ID: 'worker-a',
      IFOOD_WORKER_HOST: '127.0.0.1',
      IFOOD_WORKER_PORT: '43123',
      PORT: '43124',
      IFOOD_WORKER_INTERVAL_MS: '2500',
      IFOOD_WORKER_READY_MAX_AGE_MS: '2000',
      IFOOD_WORKER_SHUTDOWN_TIMEOUT_MS: '5000'
    }))).toMatchObject({
      workerId: 'worker-a',
      host: '127.0.0.1',
      port: 43123,
      intervalMs: 2500,
      readyMaxAgeMs: 2000,
      shutdownTimeoutMs: 5000
    });

    expect(loadIfoodWorkerConfig(validEnv({ PORT: '43124' })).port).toBe(43124);
  });

  it('rejects malformed URLs and unbounded/non-integer numeric values', () => {
    for (const env of [
      validEnv({ SUPABASE_URL: 'not-a-url' }),
      validEnv({ SUPABASE_URL: 'file:///tmp/supabase' }),
      validEnv({ IFOOD_WORKER_PORT: '0' }),
      validEnv({ IFOOD_WORKER_PORT: '65536' }),
      validEnv({ IFOOD_WORKER_PORT: '12.5' }),
      validEnv({ IFOOD_WORKER_INTERVAL_MS: '-1' }),
      validEnv({ IFOOD_WORKER_READY_MAX_AGE_MS: 'Infinity' }),
      validEnv({ IFOOD_WORKER_SHUTDOWN_TIMEOUT_MS: '1e3' })
    ]) {
      expect(() => loadIfoodWorkerConfig(env)).toThrow(IfoodWorkerConfigError);
    }
  });
});

describe('iFood worker runtime', () => {
  it('runs one awaited probe loop with no overlapping cycles', async () => {
    const controller = new AbortController();
    const first = deferred();
    const second = deferred();
    const probes = [first, second];
    let active = 0;
    let maximumActive = 0;
    let calls = 0;
    const repository = {
      probeDependencies: vi.fn(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const result = await probes[calls++].promise;
        active -= 1;
        return result;
      })
    };
    const integration = {
      reconcileEvents: vi.fn(),
      receiveEvent: vi.fn(),
      requestOrderAction: vi.fn()
    };

    const run = runIfoodWorker({
      integration,
      repository,
      intervalMs: 1,
      signal: controller.signal,
      onHealthChange: vi.fn()
    });

    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    first.resolve({ databaseReachable: true, leaseCapable: true });
    await waitFor(() => repository.probeDependencies.mock.calls.length === 2);
    expect(maximumActive).toBe(1);
    controller.abort();
    second.resolve({ databaseReachable: true, leaseCapable: true });
    await run;
    expect(maximumActive).toBe(1);
    expect(integration.reconcileEvents).not.toHaveBeenCalled();
    expect(integration.receiveEvent).not.toHaveBeenCalled();
  });

  it('stops promptly when aborted during work and exposes a drain for that work', async () => {
    const controller = new AbortController();
    const work = deferred();
    const repository = {
      probeDependencies: vi.fn(() => work.promise)
    };
    const run = runIfoodWorker({ repository, signal: controller.signal, intervalMs: 10 });
    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    controller.abort();
    await expect(run).resolves.toMatchObject({ stopped: true });

    let drained = false;
    const drainPromise = run.drain().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    work.resolve({ databaseReachable: false, leaseCapable: false });
    await drainPromise;
    expect(drained).toBe(true);
  });

  it('stops promptly while sleeping and does not schedule another cycle', async () => {
    const controller = new AbortController();
    const repository = {
      probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true }))
    };
    const run = runIfoodWorker({ repository, signal: controller.signal, intervalMs: 60_000 });
    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    controller.abort();
    await expect(run).resolves.toMatchObject({ stopped: true, cycles: 1 });
    expect(repository.probeDependencies).toHaveBeenCalledOnce();
  });

  it('reports generic sanitized errors and fail-closed health', async () => {
    const controller = new AbortController();
    const errors = [];
    const health = [];
    const repository = {
      probeDependencies: vi.fn(async () => {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY=secret-canary Authorization: Bearer token');
      })
    };
    const run = runIfoodWorker({
      repository,
      signal: controller.signal,
      intervalMs: 60_000,
      onError: (error) => errors.push(error),
      onHealthChange: (value) => health.push(value)
    });
    await waitFor(() => errors.length === 1);
    controller.abort();
    await run;
    expect(errors[0]).toMatchObject({ code: 'WORKER_CYCLE_FAILED', message: 'iFood worker cycle failed' });
    expect(JSON.stringify(errors[0])).not.toContain('secret-canary');
    expect(health.at(-1)).toMatchObject({ databaseReachable: false, leaseCapable: false });
    expect(sanitizeWorkerError(new Error('password=super-secret'))).toMatchObject({
      code: 'WORKER_CYCLE_FAILED',
      message: 'iFood worker cycle failed'
    });
  });

  it('uses only the non-mutating dependency probe in Task 4', async () => {
    const controller = new AbortController();
    const repository = {
      probeDependencies: vi.fn(async () => ({ databaseReachable: false, leaseCapable: false })),
      claimEvents: vi.fn(),
      processInbox: vi.fn(),
      claimCommands: vi.fn()
    };
    const integration = {
      reconcileEvents: vi.fn(),
      receiveEvent: vi.fn()
    };
    const run = runIfoodWorker({ repository, integration, signal: controller.signal, intervalMs: 60_000 });
    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    controller.abort();
    await run;
    expect(repository.claimEvents).not.toHaveBeenCalled();
    expect(repository.processInbox).not.toHaveBeenCalled();
    expect(repository.claimCommands).not.toHaveBeenCalled();
    expect(integration.reconcileEvents).not.toHaveBeenCalled();
  });

  it('abortableDelay resolves promptly on abort', async () => {
    const controller = new AbortController();
    const delay = abortableDelay(60_000, controller.signal);
    controller.abort();
    await expect(delay).resolves.toBe(false);
  });

  it('invokes an injected processInbox once per cycle, but only when supplied (Task 7 additive hook)', async () => {
    const controller = new AbortController();
    const repository = { probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true })) };
    const processInbox = vi.fn(async () => ({ claimed: 0, processed: 0, retried: 0, deadLettered: 0, finishFailed: 0 }));

    const run = runIfoodWorker({ repository, signal: controller.signal, intervalMs: 60_000, processInbox });
    await waitFor(() => processInbox.mock.calls.length === 1);
    controller.abort();
    await run;

    expect(processInbox).toHaveBeenCalledTimes(1);
    expect(processInbox.mock.calls[0][0]).toMatchObject({ signal: controller.signal });
  });

  it('invokes the optional processCommands hook once per cycle with the abort signal', async () => {
    const controller = new AbortController();
    const repository = { probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true })) };
    const processCommands = vi.fn(async () => ({ claimed: 0 }));

    const run = runIfoodWorker({
      repository,
      signal: controller.signal,
      intervalMs: 60_000,
      processCommands
    });
    await waitFor(() => processCommands.mock.calls.length === 1);
    controller.abort();
    await run;

    expect(processCommands).toHaveBeenCalledOnce();
    expect(processCommands.mock.calls[0][0]).toEqual({ signal: controller.signal });
  });

  it('does not invoke processInbox at all when it is not supplied (default bootstrap stays unchanged)', async () => {
    const controller = new AbortController();
    const repository = { probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true })) };

    const run = runIfoodWorker({ repository, signal: controller.signal, intervalMs: 60_000 });
    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    controller.abort();
    const result = await run;

    expect(result.cycles).toBeGreaterThanOrEqual(1);
  });

  it('sanitizes a processInbox failure through the same reportError path instead of crashing the loop', async () => {
    const controller = new AbortController();
    const repository = { probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true })) };
    const secretMessage = 'raw db error with client secret abc123';
    const processInbox = vi.fn(async () => {
      throw new Error(secretMessage);
    });
    const onError = vi.fn();
    const logger = { error: vi.fn(), info: vi.fn() };

    const run = runIfoodWorker({
      repository,
      signal: controller.signal,
      intervalMs: 60_000,
      processInbox,
      onError,
      logger
    });
    await waitFor(() => onError.mock.calls.length >= 1);
    controller.abort();
    await run;

    expect(processInbox).toHaveBeenCalledTimes(1);
    for (const call of [...onError.mock.calls, ...logger.error.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(secretMessage);
    }
  });
});

describe('iFood health server', () => {
  it('keeps liveness independent and transitions readiness by fresh probe state', async () => {
    let now = 0;
    const state = createHealthState({ readyMaxAgeMs: 100, clock: () => now });
    expect(state.readyStatus()).toEqual({ status: 'not_ready', reason: 'startup' });
    expect(state.liveStatus()).toEqual({ status: 'ok', reason: 'serving' });

    state.recordProbe({ databaseReachable: true, leaseCapable: true });
    expect(state.readyStatus()).toEqual({ status: 'ready', reason: 'fresh_probe' });
    now = 101;
    expect(state.readyStatus()).toEqual({ status: 'not_ready', reason: 'stale_probe' });
    expect(state.liveStatus()).toEqual({ status: 'ok', reason: 'serving' });

    state.recordProbe({ databaseReachable: false, leaseCapable: true });
    expect(state.readyStatus()).toEqual({ status: 'not_ready', reason: 'dependencies_unavailable' });
    state.markShuttingDown();
    expect(state.readyStatus()).toEqual({ status: 'not_ready', reason: 'shutting_down' });
    expect(state.liveStatus()).toEqual({ status: 'ok', reason: 'serving' });
  });

  it('serves exact GET/HEAD routes, generic no-cache JSON, and 404/405', async () => {
    const state = createHealthState();
    const server = createHealthServer({ state });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const live = await fetch(`${base}/health/live`);
      expect(live.status).toBe(200);
      expect(live.headers.get('cache-control')).toContain('no-store');
      expect(await live.json()).toEqual({ status: 'ok', reason: 'serving' });

      const head = await fetch(`${base}/health/ready`, { method: 'HEAD' });
      expect(head.status).toBe(503);
      expect(await head.text()).toBe('');

      const missing = await fetch(`${base}/health/live/`);
      expect(missing.status).toBe(404);
      expect(Object.keys(await missing.json()).sort()).toEqual(['reason', 'status']);

      const method = await fetch(`${base}/health/live`, { method: 'POST' });
      expect(method.status).toBe(405);
      expect(method.headers.get('allow')).toBe('GET, HEAD');
      expect(Object.keys(await method.json()).sort()).toEqual(['reason', 'status']);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => JSON.stringify(body)
  };
}

describe('iFood worker bootstrap', () => {
  it('has a fail-closed Task 4 dependency bootstrap', async () => {
    const dependencies = createUnreadyWorkerDependencies();
    await expect(dependencies.repository.probeDependencies()).resolves.toEqual({
      databaseReachable: false,
      leaseCapable: false
    });
  });

  it('keeps fail-closed unready deps when Supabase credentials are absent', async () => {
    const dependencies = createWorkerDependencies({
      env: { IFOOD_WORKER_PORT: '3000' },
      fetch: vi.fn()
    });
    await expect(dependencies.repository.probeDependencies()).resolves.toEqual({
      databaseReachable: false,
      leaseCapable: false
    });
  });

  it('uses a production repository when Supabase credentials are present', async () => {
    const rpc = vi.fn(async (_name, params) => {
      expect(params).toMatchObject({ p_limit: 0, p_lease_seconds: 0 });
      expect(params.p_limit).toBe(0);
      return { data: null, error: { message: 'INVALID_CLAIM_ARGUMENTS', code: 'P0001' } };
    });
    const dependencies = createWorkerDependencies({
      env: validEnv(),
      supabase: { rpc }
    });
    await expect(dependencies.repository.probeDependencies()).resolves.toEqual({
      databaseReachable: true,
      leaseCapable: true
    });
    expect(rpc).toHaveBeenCalledWith(
      IFOOD_LEASE_PROBE.rpc,
      expect.objectContaining({ p_worker_id: IFOOD_LEASE_PROBE.workerId, p_limit: 0, p_lease_seconds: 0 }),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
    );
  });

  it('main() probes production deps from config credentials without stealing inbox work', async () => {
    const processLike = new EventEmitter();
    processLike.exitCode = undefined;
    const controller = new AbortController();
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'INVALID_CLAIM_ARGUMENTS', code: 'P0001' }
    }));
    const server = new EventEmitter();
    server.listen = vi.fn((_port, _host, callback) => callback());
    server.close = vi.fn((callback) => callback());
    const onHealthChange = vi.fn();
    const mainPromise = main({
      processLike,
      controller,
      config: {
        host: '127.0.0.1',
        port: 0,
        intervalMs: 60_000,
        readyMaxAgeMs: 90_000,
        shutdownTimeoutMs: 1000,
        supabaseUrl: 'https://project.example.supabase.co',
        serviceRoleKey: 'service-role-secret-canary'
      },
      supabase: { rpc },
      server,
      onHealthChange
    });

    await waitFor(() => onHealthChange.mock.calls.length === 1);
    expect(rpc.mock.calls[0][0]).toBe('claim_ifood_events_v1');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 0, p_lease_seconds: 0 });
    processLike.emit('SIGTERM');
    await expect(mainPromise).resolves.toMatchObject({ shutdown: true });
    expect(onHealthChange).toHaveBeenCalledWith({ databaseReachable: true, leaseCapable: true });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('service-role-secret-canary');
  });

  it('bridges repeated SIGTERM/SIGINT through one controller, drains, and closes boundedly', async () => {
    const processLike = new EventEmitter();
    processLike.exitCode = undefined;
    const controller = new AbortController();
    const work = deferred();
    const repository = {
      probeDependencies: vi.fn(() => work.promise)
    };
    const server = new EventEmitter();
    server.listen = vi.fn((_port, _host, callback) => callback());
    server.close = vi.fn((callback) => callback());
    const onHealthChange = vi.fn();
    const mainPromise = main({
      processLike,
      controller,
      config: {
        host: '127.0.0.1',
        port: 0,
        intervalMs: 60_000,
        readyMaxAgeMs: 90_000,
        shutdownTimeoutMs: 1000
      },
      repository,
      integration: {},
      server,
      onHealthChange
    });

    await waitFor(() => repository.probeDependencies.mock.calls.length === 1);
    processLike.emit('SIGTERM');
    processLike.emit('SIGTERM');
    processLike.emit('SIGINT');
    await Promise.resolve();
    expect(controller.signal.aborted).toBe(true);
    expect(server.close).not.toHaveBeenCalled();

    work.resolve({ databaseReachable: true, leaseCapable: true });
    await expect(mainPromise).resolves.toMatchObject({ shutdown: true });
    expect(server.close).toHaveBeenCalledOnce();
    expect(processLike.exitCode).toBeUndefined();
    expect(onHealthChange).not.toHaveBeenCalled();
    expect(processLike.listenerCount('SIGTERM')).toBe(0);
    expect(processLike.listenerCount('SIGINT')).toBe(0);
  });
});

describe('iFood production repository probe', () => {
  it('treats INVALID_CLAIM_ARGUMENTS as a non-mutating lease-capable probe', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toContain(`/rest/v1/rpc/${IFOOD_LEASE_PROBE.rpc}`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        p_worker_id: IFOOD_LEASE_PROBE.workerId,
        p_limit: 0,
        p_lease_seconds: 0
      });
      expect(init.body).not.toContain('service-role-secret-canary');
      return jsonResponse(400, { code: 'P0001', message: 'INVALID_CLAIM_ARGUMENTS' });
    });
    const repository = createIfoodSupabaseRepository({
      supabaseUrl: 'https://project.example.supabase.co',
      serviceRoleKey: 'service-role-secret-canary',
      fetch: fetchImpl
    });
    await expect(repository.probeDependencies()).resolves.toEqual({
      databaseReachable: true,
      leaseCapable: true
    });
  });

  it('keeps fail-closed false/false on transport errors without leaking secrets', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed for service-role-secret-canary');
    });
    const repository = createIfoodSupabaseRepository({
      supabaseUrl: 'https://project.example.supabase.co',
      serviceRoleKey: 'service-role-secret-canary',
      fetch: fetchImpl
    });
    await expect(repository.probeDependencies()).resolves.toEqual({
      databaseReachable: false,
      leaseCapable: false
    });
  });

  it('reports database reachable but not lease-capable when the claim RPC is missing', async () => {
    const repository = createIfoodSupabaseRepository({
      supabase: {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: 'Could not find the function public.claim_ifood_events_v1', code: 'PGRST202' }
        }))
      }
    });
    await expect(repository.probeDependencies()).resolves.toEqual({
      databaseReachable: true,
      leaseCapable: false
    });
  });

  it('does not treat a successful claim payload as a healthy probe', async () => {
    const repository = createIfoodSupabaseRepository({
      supabase: {
        rpc: vi.fn(async () => ({
          data: [{ inbox_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', payload: { customer: 'secret-pii' } }],
          error: null
        }))
      }
    });
    await expect(repository.probeDependencies()).resolves.toEqual({
      databaseReachable: true,
      leaseCapable: false
    });
  });
});
