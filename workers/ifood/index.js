import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IFOOD_WORKER_DEFAULTS, loadIfoodWorkerConfig } from './config.js';
import { createHealthServer, createHealthState, listenHealthServer } from './healthServer.js';
import { runIfoodWorker, sanitizeWorkerError } from './runtime.js';
import { createHttpIfoodAdapter } from '../../src/lib/server/ifood/adapters/httpIfoodAdapter.js';
import { createIfoodInboxProcessor } from '../../src/lib/server/ifood/inboxProcessor.js';
import { createIfoodCommandProcessor } from '../../src/lib/server/ifood/commandProcessor.js';
import { createIfoodEventHandler } from '../../src/lib/server/ifood/eventHandler.js';
import { createIfoodIntegration } from '../../src/lib/server/ifood/createIfoodIntegration.js';
import { createIfoodSupabaseRepository } from './supabaseRepository.js';

function noop() {}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Build the production iFood HTTP adapter from worker config, when
 * `IFOOD_CLIENT_ID`/`IFOOD_CLIENT_SECRET` are both configured. Returns
 * `null` otherwise so a worker without credentials still boots fail-closed.
 *
 * The default loop only uses this adapter when `enableHttpAdapter` is on.
 */
export function createIfoodHttpAdapterFromConfig(config, overrides = {}) {
  if (!config?.credentials) return null;
  const { clientId, clientSecret } = config.credentials;
  return createHttpIfoodAdapter({
    clientId,
    clientSecret,
    fetch: overrides.fetch ?? globalThis.fetch,
    clock: overrides.clock ?? (() => Date.now()),
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
    ...(overrides.random ? { random: overrides.random } : {}),
    ...(overrides.baseUrl ? { baseUrl: overrides.baseUrl } : {}),
    ...(overrides.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
    ...(overrides.retryBudgetMs !== undefined ? { retryBudgetMs: overrides.retryBudgetMs } : {})
  });
}

/**
 * Fail-closed dependency set used when Supabase credentials are missing or
 * the production repository cannot be constructed. `/health/ready` stays
 * `dependencies_unavailable` until a truthful probe exists.
 */
export function createUnreadyWorkerDependencies() {
  return {
    integration: Object.freeze({}),
    repository: Object.freeze({
      async probeDependencies() {
        return { databaseReachable: false, leaseCapable: false };
      }
    })
  };
}

export const createTask4WorkerDependencies = createUnreadyWorkerDependencies;

function canRunInbox(repository) {
  return typeof repository?.claimEvents === 'function'
    && typeof repository?.finishEvent === 'function'
    && typeof repository?.projectOrderEvent === 'function';
}

function canRunCommands(repository) {
  return typeof repository?.claimCommands === 'function'
    && typeof repository?.finishCommand === 'function';
}

function createDefaultProcessInbox({ repository, adapter, config, logger, clock }) {
  if (!adapter || !canRunInbox(repository)) return undefined;
  try {
    const integration = createIfoodIntegration({
      adapter,
      repository,
      clock: clock ?? (() => Date.now())
    });
    const handler = createIfoodEventHandler({ integration, repository, logger });
    const processor = createIfoodInboxProcessor({
      repository,
      handler,
      workerId: config?.workerId ?? IFOOD_WORKER_DEFAULTS.workerId,
      logger
    });
    return ({ signal } = {}) => processor.runInboxCycle({ signal });
  } catch {
    return undefined;
  }
}

function createDefaultProcessCommands({ repository, adapter, config, logger }) {
  if (!adapter || !canRunCommands(repository)) return undefined;
  try {
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: config?.workerId ?? IFOOD_WORKER_DEFAULTS.workerId,
      logger
    });
    return ({ signal } = {}) => processor.runCommandCycle({ signal });
  } catch {
    return undefined;
  }
}

/**
 * Decide which cycle hooks the bootstrap may pass to `runIfoodWorker`.
 * Flags default off. Missing HTTP credentials with the adapter flag on
 * stays fail-closed (no adapter, no default inbox/commands).
 */
export function resolveWorkerCycleHooks(options = {}) {
  const config = options.config ?? {};
  const repository = options.repository;
  const logger = options.logger ?? null;
  const clock = options.clock;
  const createAdapter = options.createAdapter ?? createIfoodHttpAdapterFromConfig;

  const adapterEnabled = config.enableHttpAdapter === true;
  const inboxEnabled = config.processInbox === true;
  const commandsEnabled = config.processCommands === true;

  let adapter = null;
  if (adapterEnabled) {
    try {
      adapter = options.adapter ?? createAdapter(config, options) ?? null;
    } catch {
      adapter = null;
    }
  }

  let processInbox;
  if (inboxEnabled) {
    processInbox = typeof options.processInbox === 'function'
      ? options.processInbox
      : createDefaultProcessInbox({ repository, adapter, config, logger, clock });
  }

  let processCommands;
  if (commandsEnabled) {
    processCommands = typeof options.processCommands === 'function'
      ? options.processCommands
      : createDefaultProcessCommands({ repository, adapter, config, logger });
  }

  return Object.freeze({ adapter, processInbox, processCommands });
}

function resolveSupabaseCredentials(options = {}) {
  const config = options.config;
  const env = options.env;
  const supabaseUrl = options.supabaseUrl
    ?? config?.supabaseUrl
    ?? env?.SUPABASE_URL;
  const serviceRoleKey = options.serviceRoleKey
    ?? config?.serviceRoleKey
    ?? config?.supabaseServiceRoleKey
    ?? env?.SUPABASE_SERVICE_ROLE_KEY;
  return {
    supabaseUrl: hasText(supabaseUrl) ? supabaseUrl.trim() : '',
    serviceRoleKey: hasText(serviceRoleKey) ? serviceRoleKey.trim() : ''
  };
}

/**
 * Prefer a production repository when `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY` are present (via config or env). Construction
 * errors stay fail-closed: never throw secrets, never claim inbox work.
 */
export function createWorkerDependencies(options = {}) {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseCredentials(options);
  if (!supabaseUrl || !serviceRoleKey) {
    return createUnreadyWorkerDependencies();
  }
  try {
    const repository = createIfoodSupabaseRepository({
      supabaseUrl,
      serviceRoleKey,
      supabase: options.supabase,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs
    });
    return {
      integration: Object.freeze({}),
      repository
    };
  } catch {
    return createUnreadyWorkerDependencies();
  }
}

function resolvedConfig(options) {
  return options.config ?? loadIfoodWorkerConfig(options.env ?? process.env);
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.resolve({ timedOut: true });
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([
    Promise.resolve(promise).then((value) => ({ timedOut: false, value })),
    timeout
  ]).finally(() => clearTimeout(timer));
}

function closeServer(server) {
  if (!server || typeof server.close !== 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    };
    try {
      const result = server.close(finish);
      if (result && typeof result.then === 'function') result.then(() => finish(), finish);
    } catch (error) {
      finish(error);
    }
  });
}

function addSignalListener(processLike, name, listener) {
  if (typeof processLike?.on !== 'function') return noop;
  processLike.on(name, listener);
  return () => processLike.removeListener?.(name, listener);
}

function addAbortListener(signal, listener) {
  if (!signal || typeof signal.addEventListener !== 'function') return noop;
  signal.addEventListener('abort', listener, { once: true });
  return () => signal.removeEventListener?.('abort', listener);
}

/**
 * Start the dedicated HTTP health server and worker loop. Nothing starts when
 * this module is imported; the direct-execution guard at the bottom is the
 * only production entry point.
 */
export async function main(options = {}) {
  const config = resolvedConfig(options);
  const processLike = options.processLike ?? process;
  const controller = options.controller ?? new AbortController();
  const dependencies = options.dependencies ?? createWorkerDependencies({
    config,
    env: options.env,
    supabase: options.supabase,
    fetch: options.fetch,
    timeoutMs: options.probeTimeoutMs
  });
  const repository = options.repository ?? dependencies.repository;
  const clock = options.clock ?? (() => Date.now());
  const logger = options.logger ?? console;
  const cycleHooks = options.cycleHooks ?? resolveWorkerCycleHooks({
    config,
    repository,
    adapter: options.adapter,
    processInbox: options.processInbox,
    processCommands: options.processCommands,
    createAdapter: options.createAdapter,
    fetch: options.fetch,
    clock,
    logger
  });
  let integration = options.integration ?? dependencies.integration;
  if (!options.integration && cycleHooks.adapter) {
    try {
      integration = createIfoodIntegration({
        adapter: cycleHooks.adapter,
        repository,
        clock
      });
    } catch {
      integration = dependencies.integration;
    }
  }
  const suppliedServer = options.server;
  const healthState = options.healthState ?? suppliedServer?.healthState ?? createHealthState({
    readyMaxAgeMs: config.readyMaxAgeMs ?? IFOOD_WORKER_DEFAULTS.readyMaxAgeMs,
    clock
  });
  const healthServerFactory = options.createHealthServer ?? options.serverFactory;
  const server = suppliedServer ?? (healthServerFactory
    ? healthServerFactory({ state: healthState })
    : createHealthServer({ state: healthState }));
  const workerRunner = options.runWorker ?? options.workerRunner ?? runIfoodWorker;
  const userHealthChange = options.onHealthChange ?? noop;
  const cleanup = [];
  let workerRun;
  let workerHandle;
  let shutdownPromise = null;
  let shutdownRequested = false;
  let resolveShutdownSignal;
  const shutdownSignal = new Promise((resolve) => {
    resolveShutdownSignal = resolve;
  });

  const notifyHealthChange = async (probe) => {
    healthState.recordProbe(probe);
    await userHealthChange(probe);
  };

  const requestShutdown = () => {
    if (shutdownRequested) return shutdownPromise;
    shutdownRequested = true;
    // Flip readiness synchronously before aborting work or beginning drain.
    healthState.markShuttingDown();
    controller.abort();
    resolveShutdownSignal();

    shutdownPromise = (async () => {
      const shutdownTimeoutMs = config.shutdownTimeoutMs ?? 15_000;
      const deadline = Date.now() + shutdownTimeoutMs;
      const remaining = () => Math.max(0, deadline - Date.now());
      const drainFactory = workerHandle?.drain ?? workerRun?.drain;
      const drain = typeof drainFactory === 'function'
        ? drainFactory.call(workerHandle ?? workerRun)
        : workerRun;
      const drained = await withTimeout(drain ?? Promise.resolve(), remaining());
      let timedOut = drained.timedOut;
      const closed = await withTimeout(closeServer(server), remaining());
      timedOut ||= closed.timedOut;
      healthState.stopServing();
      if (timedOut) processLike.exitCode = 1;
      return { shutdown: true, timedOut };
    })();
    return shutdownPromise;
  };

  cleanup.push(addSignalListener(processLike, 'SIGTERM', requestShutdown));
  cleanup.push(addSignalListener(processLike, 'SIGINT', requestShutdown));
  if (options.signal && options.signal !== controller.signal) {
    cleanup.push(addAbortListener(options.signal, requestShutdown));
  }

  try {
    await listenHealthServer(server, { host: config.host ?? '0.0.0.0', port: config.port ?? 3000 });
    workerHandle = workerRunner({
      integration,
      repository,
      clock,
      signal: controller.signal,
      intervalMs: config.intervalMs ?? 300_000,
      onHealthChange: notifyHealthChange,
      onError: options.onError,
      logger,
      processInbox: cycleHooks.processInbox,
      processCommands: cycleHooks.processCommands
    });
    workerRun = workerHandle?.promise ?? workerHandle;
    // Keep unexpected runtime failures on the same bounded shutdown path.
    const workerCompletion = typeof workerRun?.catch === 'function'
      ? workerRun
      : Promise.resolve(workerRun);
    workerCompletion.catch(() => {
      processLike.exitCode = 1;
      requestShutdown();
    });

    if (controller.signal.aborted || options.signal?.aborted) requestShutdown();
    await shutdownSignal;
    return await shutdownPromise;
  } catch (error) {
    processLike.exitCode = 1;
    healthState.markShuttingDown();
    controller.abort();
    try {
      await withTimeout(closeServer(server), config.shutdownTimeoutMs ?? 15_000);
    } catch {
      // Preserve the generic startup failure and the bounded shutdown policy.
    }
    throw sanitizeWorkerError(error);
  } finally {
    for (const remove of cleanup) remove();
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(resolvePath(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch(() => {
    // Never print configuration values, provider payloads, or original errors.
    process.exitCode = 1;
    console.error('iFood worker failed to start');
  });
}

export default main;
