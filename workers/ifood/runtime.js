const DEFAULT_INTERVAL_MS = 300_000;

function noop() {}

function abortError() {
  const error = new Error('worker aborted');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function isAbortError(error, signal) {
  return signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

function addAbortListener(signal, listener) {
  if (!signal || typeof signal.addEventListener !== 'function') return noop;
  signal.addEventListener('abort', listener, { once: true });
  return () => signal.removeEventListener?.('abort', listener);
}

/**
 * Resolve true after the delay, or false as soon as the signal aborts. The
 * timer is always cleared, which keeps a stopped worker from retaining the
 * Node event loop.
 */
export function abortableDelay(ms, signal, timerApi = globalThis) {
  if (signal?.aborted) return Promise.resolve(false);
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(true);

  const setTimer = timerApi?.setTimeout?.bind(timerApi) ?? setTimeout;
  const clearTimer = timerApi?.clearTimeout?.bind(timerApi) ?? clearTimeout;

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let removeAbort = noop;

    const finish = (completed) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimer(timer);
      removeAbort();
      resolve(completed);
    };

    timer = setTimer(() => finish(true), ms);
    removeAbort = addAbortListener(signal, () => finish(false));
    if (signal?.aborted) finish(false);
  });
}

/**
 * Never expose provider/network/database error text. The worker's logs and
 * health callbacks get this stable generic envelope only.
 */
export function sanitizeWorkerError(_error) {
  return Object.freeze({
    code: 'WORKER_CYCLE_FAILED',
    message: 'iFood worker cycle failed'
  });
}

function normalizeProbe(result) {
  return {
    databaseReachable: result?.databaseReachable === true,
    leaseCapable: result?.leaseCapable === true
  };
}

function reportError(error, { onError, logger }) {
  const safeError = sanitizeWorkerError(error);
  try {
    onError(safeError);
  } catch {
    // An observer must never stop the worker loop.
  }
  if (logger && typeof logger.error === 'function') {
    try {
      logger.error(safeError.message);
    } catch {
      // Logging is best effort during shutdown.
    }
  }
  return safeError;
}

function awaitWithAbort(promise, signal) {
  if (!signal || typeof signal.addEventListener !== 'function') return promise;
  if (signal.aborted) {
    // Keep observing the operation so a late rejection is never unhandled.
    promise.catch(noop);
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let removeAbort = noop;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      removeAbort();
      callback(value);
    };

    removeAbort = addAbortListener(signal, () => finish(reject, abortError()));
    promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}

function trackOperation(operation, activeOperations) {
  activeOperations.add(operation);
  // Both branches remove the operation; the returned promise is deliberately
  // handled so an operation that rejects after abort cannot become unhandled.
  operation.then(
    () => activeOperations.delete(operation),
    () => activeOperations.delete(operation)
  );
  operation.catch(noop);
  return operation;
}

function waitForDrain(activeOperations) {
  return (async () => {
    while (activeOperations.size > 0) {
      await Promise.all([...activeOperations].map((operation) => operation.catch(noop)));
    }
  })();
}

function invokeObserver(observer, value) {
  try {
    return Promise.resolve(observer(value));
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Run the Task 4 worker skeleton. The only operation guaranteed in this
 * task is the explicitly safe, non-mutating `probeDependencies` call.
 *
 * Task 7 adds one optional, purely additive hook: `options.processInbox`,
 * a `runInboxCycle`-shaped async callback (see
 * `src/lib/server/ifood/inboxProcessor.js`). When provided, it is invoked
 * once per cycle right after the health probe/notification and after
 * `reconcile` has polled new events into the inbox, wired the same
 * defensive way `probeOwner` already is: it only runs when supplied (the
 * default bootstrap in `workers/ifood/index.js` never supplies it, so the
 * production probe / fail-closed unready path is unchanged), it
 * respects `signal` (skipped/aborted the same way any other tracked
 * operation is), and any error it throws goes through the same
 * `reportError`/`sanitizeWorkerError` path as every other error here — it
 * never crashes the loop or leaks raw error text. Task 9 adds the same
 * optional pattern for `options.reconcile` and `options.evaluateHealth`,
 * and Task 10 adds `options.processCommands`. The default bootstrap only
 * supplies those hooks when explicit env flags are on
 * (`IFOOD_WORKER_PROCESS_INBOX`, `IFOOD_WORKER_PROCESS_COMMANDS`,
 * `IFOOD_WORKER_ENABLE_HTTP_ADAPTER`); otherwise the loop stays probe-only.
 *
 * The returned promise resolves when the loop observes abort. It also carries
 * `drain()` so the bootstrap can wait for an in-flight probe/inbox cycle
 * before closing its HTTP server, while still bounding shutdown at the
 * process boundary.
 */
export function runIfoodWorker(options = {}) {
  const {
    integration,
    repository = {},
    clock: _clock,
    signal: providedSignal,
    intervalMs: configuredIntervalMs,
    interval: configuredInterval,
    pollIntervalMs: configuredPollIntervalMs,
    onHealthChange = noop,
    onError = noop,
    logger = null,
    processInbox,
    processCommands,
    reconcile,
    evaluateHealth
  } = options;

  const internalController = providedSignal ? null : new AbortController();
  const signal = providedSignal ?? internalController.signal;
  const intervalMs = configuredIntervalMs
    ?? configuredInterval
    ?? configuredPollIntervalMs
    ?? DEFAULT_INTERVAL_MS;
  const probeOwner = typeof repository.probeDependencies === 'function'
    ? repository
    : (typeof integration?.probeDependencies === 'function' ? integration : null);
  const activeOperations = new Set();
  const errors = [];
  let cycles = 0;
  let lastProbe = null;

  const invokeTracked = (factory) => {
    const operation = trackOperation(
      Promise.resolve().then(factory),
      activeOperations
    );
    return awaitWithAbort(operation, signal);
  };

  const notifyHealth = async (probe) => {
    if (signal.aborted) throw abortError();
    try {
      await invokeTracked(() => invokeObserver(onHealthChange, probe));
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      reportError(error, { onError, logger });
    }
  };

  const runOptionalHook = async (hook, input) => {
    if (typeof hook !== 'function') return;
    if (signal.aborted) throw abortError();
    try {
      await invokeTracked(() => invokeObserver(hook, input));
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      const safeError = reportError(error, { onError, logger });
      errors.push(safeError);
    }
  };

  const runCycle = async () => {
    if (signal.aborted) throw abortError();
    let probe;
    try {
      if (!probeOwner) {
        probe = normalizeProbe(null);
      } else {
        probe = normalizeProbe(await invokeTracked(() => probeOwner.probeDependencies({ signal })));
      }
      if (signal.aborted) throw abortError();
      lastProbe = probe;
      cycles += 1;
      await notifyHealth(probe);
      // `reconcile` polls iFood into `event_inbox`, so it must run BEFORE
      // `processInbox` consumes that table. With the reverse order an event
      // polled in cycle N was only projected in cycle N+1, costing a full
      // `intervalMs` of dead time per event: production showed 5m01s between
      // `received_at` and `processed_at` on every event at the 300s default,
      // which ate almost the whole iFood accept window before the order was
      // even visible in the PDV. Polling first makes it one cycle, not two.
      await runOptionalHook(reconcile, { signal });
      if (typeof processInbox === 'function') {
        if (signal.aborted) throw abortError();
        try {
          await invokeTracked(() => invokeObserver(processInbox, { signal }));
        } catch (inboxError) {
          if (isAbortError(inboxError, signal)) throw inboxError;
          const safeError = reportError(inboxError, { onError, logger });
          errors.push(safeError);
        }
      }
      await runOptionalHook(processCommands, { signal });
      await runOptionalHook(evaluateHealth, { signal, probe });
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      const safeError = reportError(error, { onError, logger });
      errors.push(safeError);
      probe = normalizeProbe(null);
      lastProbe = probe;
      cycles += 1;
      await notifyHealth(probe);
    }
  };

  const loop = async () => {
    while (!signal.aborted) {
      try {
        await runCycle();
      } catch (error) {
        if (!isAbortError(error, signal)) {
          const safeError = reportError(error, { onError, logger });
          errors.push(safeError);
        }
        break;
      }
      if (signal.aborted) break;
      const completed = await abortableDelay(intervalMs, signal);
      if (!completed) break;
    }

    return {
      stopped: signal.aborted,
      cycles,
      lastProbe: lastProbe ? { ...lastProbe } : null,
      errorCount: errors.length
    };
  };

  const task = loop();
  task.drain = () => waitForDrain(activeOperations);
  task.stop = () => internalController?.abort();
  task.signal = signal;
  return task;
}

export default runIfoodWorker;
