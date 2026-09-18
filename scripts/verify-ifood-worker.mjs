#!/usr/bin/env node
/**
 * Smoke gate for the iFood worker: boots with an in-memory mock adapter /
 * repository (no real iFood, no linked Supabase), waits for readiness,
 * drains one inbox fixture through the worker cycle, asserts projection +
 * command queue state, then shuts down.
 *
 * Usage: `npm run verify:ifood`
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { main } from '../workers/ifood/index.js';
import { runIfoodWorker } from '../workers/ifood/runtime.js';
import { createMockIfoodAdapter } from '../src/lib/server/ifood/adapters/mockIfoodAdapter.js';
import { createIfoodInboxProcessor } from '../src/lib/server/ifood/inboxProcessor.js';
import { createIfoodCommandProcessor } from '../src/lib/server/ifood/commandProcessor.js';
import { createIfoodReconciler } from '../src/lib/server/ifood/reconciliation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`[verify:ifood] ${message}`);
  process.exitCode = 1;
}

function loadJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolvePort(port)));
    });
    server.on('error', reject);
  });
}

async function waitForReady(baseUrl, { timeoutMs = 8_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health/ready`);
      last = { status: res.status, body: await res.json().catch(() => ({})) };
      if (res.ok && last.body?.status === 'ready') return last;
    } catch (error) {
      last = { error: error?.message || 'fetch_failed' };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`worker never became ready: ${JSON.stringify(last)}`);
}

function createInMemoryHarness({ eventFixture, orderFixture }) {
  const projections = new Map();
  const commands = [];
  const finishedInbox = [];
  const inboxQueue = [];
  const connection = {
    connectionId: '11111111-1111-4111-8111-111111111111',
    empresaId: '22222222-2222-4222-8222-222222222222',
    merchantId: eventFixture.merchantId,
    status: 'active',
    configurationValid: true
  };

  inboxQueue.push({
    inboxId: '33333333-3333-4333-8333-333333333333',
    eventId: eventFixture.id,
    connectionId: connection.connectionId,
    empresaId: connection.empresaId,
    merchantId: eventFixture.merchantId,
    externalOrderId: eventFixture.orderId,
    eventType: eventFixture.fullCode,
    externalRevision: 1,
    occurredAt: eventFixture.createdAt,
    payload: { ...eventFixture, order: orderFixture },
    attempts: 0,
    leaseId: 'lease-smoke-1',
    leaseUntil: new Date(Date.now() + 60_000).toISOString(),
    status: 'queued'
  });

  const mockSeam = createMockIfoodAdapter({
    events: [eventFixture],
    orders: { [orderFixture.id]: orderFixture },
    merchants: [{ id: eventFixture.merchantId, name: 'Smoke Merchant' }]
  });

  // Command processor calls typed methods (confirm/dispatch/...), not the
  // generic requestOrderAction seam used by the browser orchestration layer.
  const adapter = {
    ...mockSeam,
    confirm: async (orderId, opts) => {
      mockSeam.calls.push({ method: 'confirm', input: { orderId, opts } });
      return { accepted: true, status: 'accepted_http' };
    },
    startPreparation: async (orderId, opts) => {
      mockSeam.calls.push({ method: 'startPreparation', input: { orderId, opts } });
      return { accepted: true, status: 'accepted_http' };
    },
    readyToPickup: async (orderId, opts) => {
      mockSeam.calls.push({ method: 'readyToPickup', input: { orderId, opts } });
      return { accepted: true, status: 'accepted_http' };
    },
    dispatch: async (orderId, opts) => {
      mockSeam.calls.push({ method: 'dispatch', input: { orderId, opts } });
      return { accepted: true, status: 'accepted_http' };
    },
    requestCancellation: async (orderId, opts) => {
      mockSeam.calls.push({ method: 'requestCancellation', input: { orderId, opts } });
      return { accepted: true, status: 'accepted_http' };
    },
    get calls() {
      return mockSeam.calls;
    }
  };

  const repository = {
    async probeDependencies() {
      return { databaseReachable: true, leaseCapable: true };
    },
    listConnectionsForPolling: async () => [connection],
    enqueuePolledEvent: async () => ({ outcome: 'inserted' }),
    recordPollSuccess: async () => {},
    async claimEvents({ limit = 10 } = {}) {
      const batch = inboxQueue.splice(0, limit).map((row) => ({
        ...row,
        status: 'processing',
        attempts: Number(row.attempts || 0) + 1
      }));
      return batch;
    },
    async finishEvent(args) {
      finishedInbox.push(args);
    },
    async claimCommands({ limit = 10 } = {}) {
      return commands.splice(0, limit);
    },
    async finishCommand(args) {
      return args;
    }
  };

  const inboxProcessor = createIfoodInboxProcessor({
    repository,
    workerId: 'verify-ifood-smoke',
    handler: async (row) => {
      projections.set(row.externalOrderId, {
        orderId: row.externalOrderId,
        eventId: row.eventId,
        eventType: row.eventType,
        merchantId: row.merchantId,
        status: row.eventType,
        displayId: row.payload?.order?.displayId ?? null
      });
      commands.push({
        commandId: '44444444-4444-4444-8444-444444444444',
        connectionId: row.connectionId,
        orderRefId: '55555555-5555-4555-8555-555555555555',
        empresaId: row.empresaId,
        merchantId: row.merchantId,
        externalOrderId: row.externalOrderId,
        intent: 'confirm',
        expectedExternalRevision: 1,
        idempotencyKey: `ifood:command:v1:${row.empresaId}:${row.externalOrderId}:confirm:1`,
        payload: {},
        attempts: 0,
        leaseId: 'cmd-lease-1',
        leaseUntil: new Date(Date.now() + 60_000).toISOString(),
        status: 'queued'
      });
      return { outcome: 'processed' };
    }
  });

  const commandProcessor = createIfoodCommandProcessor({
    repository,
    adapter,
    workerId: 'verify-ifood-smoke',
    isMerchantCommandAllowed: async () => true
  });

  const reconciler = createIfoodReconciler({
    adapter,
    repository,
    clock: () => Date.now()
  });

  return {
    adapter,
    repository,
    projections,
    finishedInbox,
    processInbox: ({ signal } = {}) => inboxProcessor.runInboxCycle({ signal }),
    processCommands: ({ signal } = {}) => commandProcessor.runCommandCycle({ signal }),
    reconcile: () => reconciler.runReconciliationCycle()
  };
}

async function mainVerify() {
  const eventFixture = loadJson('tests/fixtures/ifood/events/placed.json');
  const orderFixture = loadJson('tests/fixtures/ifood/orders/immediate-ifood-delivery.json');
  const harness = createInMemoryHarness({ eventFixture, orderFixture });
  const port = await freePort();
  const controller = new AbortController();
  const shutdownSignal = new AbortController();
  const logger = {
    error: () => {},
    info: () => {},
    warn: () => {},
    log: () => {}
  };

  const runPromise = main({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'verify-ifood-service-role',
      IFOOD_WORKER_HOST: '127.0.0.1',
      IFOOD_WORKER_PORT: String(port),
      IFOOD_WORKER_INTERVAL_MS: '50',
      IFOOD_WORKER_READY_MAX_AGE_MS: '5000',
      IFOOD_WORKER_SHUTDOWN_TIMEOUT_MS: '2000'
    },
    controller,
    signal: shutdownSignal.signal,
    logger,
    repository: harness.repository,
    integration: {},
    runWorker: (options) => runIfoodWorker({
      ...options,
      processInbox: harness.processInbox,
      processCommands: harness.processCommands,
      reconcile: harness.reconcile,
      intervalMs: 50
    })
  });

  let failed = false;
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForReady(baseUrl);

    const live = await fetch(`${baseUrl}/health/live`);
    if (!live.ok) throw new Error('liveness failed after readiness');

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && harness.projections.size === 0) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (harness.projections.size === 0) {
      throw new Error('fixture event never projected');
    }

    const projected = harness.projections.get(eventFixture.orderId);
    if (!projected || projected.eventId !== eventFixture.id) {
      throw new Error('projection missing or wrong event identity');
    }
    if (harness.finishedInbox.length === 0) {
      throw new Error('inbox row was never finished');
    }
    const deadlineCmd = Date.now() + 3_000;
    while (Date.now() < deadlineCmd && !harness.adapter.calls.some((c) => c.method === 'confirm')) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!harness.adapter.calls.some((c) => c.method === 'confirm')) {
      throw new Error('command processor never called mock adapter.confirm');
    }

    console.log('[verify:ifood] ok — ready, projected fixture, commanded via mock adapter');
  } catch (error) {
    failed = true;
    fail(error?.message || String(error));
  } finally {
    shutdownSignal.abort();
    try {
      await Promise.race([
        runPromise,
        new Promise((r) => {
          const t = setTimeout(r, 5_000);
          t.unref?.();
        })
      ]);
    } catch {
      // shutdown errors already sanitized by worker bootstrap
    }
  }

  process.exit(failed || process.exitCode ? 1 : 0);
}

mainVerify().catch((error) => {
  fail(error?.message || String(error));
  process.exit(1);
});
