import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadIfoodWorkerConfig } from './config.js';
import { createHealthServer, createHealthState, listenHealthServer } from './healthServer.js';
import { runIfoodWorker, sanitizeWorkerError } from './runtime.js';

function noop() {}

/**
 * Task 4 deliberately ships no production repository adapter yet. Returning
 * an explicit false/false probe keeps the real bootstrap fail-closed until
 * Tasks 5 and 7 provide truthful HTTP and inbox/lease implementations.
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
  const dependencies = options.dependencies ?? createUnreadyWorkerDependencies();
  const repository = options.repository ?? dependencies.repository;
  const integration = options.integration ?? dependencies.integration;
  const clock = options.clock ?? (() => Date.now());
  const suppliedServer = options.server;
  const healthState = options.healthState ?? suppliedServer?.healthState ?? createHealthState({
    readyMaxAgeMs: config.readyMaxAgeMs ?? 90_000,
    clock
  });
  const healthServerFactory = options.createHealthServer ?? options.serverFactory;
  const server = suppliedServer ?? (healthServerFactory
    ? healthServerFactory({ state: healthState })
    : createHealthServer({ state: healthState }));
  const workerRunner = options.runWorker ?? options.workerRunner ?? runIfoodWorker;
  const userHealthChange = options.onHealthChange ?? noop;
  const logger = options.logger ?? console;
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
      logger
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
