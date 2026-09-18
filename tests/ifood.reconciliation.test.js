import { describe, expect, it, vi } from 'vitest';
import {
  createIfoodReconciler,
  MIN_IFOOD_POLL_INTERVAL_MS,
  normalizePollingIntervalMs
} from '../src/lib/server/ifood/reconciliation.js';
import {
  createIfoodHealthCoordinator,
  evaluateConnectionHealth,
  resolveConnectionHealthPolicy
} from '../src/lib/server/ifood/connectionHealth.js';
import { runIfoodWorker } from '../workers/ifood/runtime.js';

function makeClock(start = 1_000_000) {
  let current = start;
  const clock = () => current;
  clock.set = (value) => { current = value; };
  clock.advance = (value) => { current += value; };
  return clock;
}

function makeConnection(merchantId, overrides = {}) {
  return {
    connectionId: `connection-${merchantId}`,
    merchantId,
    status: 'active',
    configurationValid: true,
    ...overrides
  };
}

function makeEnvelope({ eventId = 'event-1', merchantId = 'merchant-a', orderId = 'order-1', fullCode = 'PLACED', code = 'PLC', createdAt = '1970-01-01T00:16:39.000Z' } = {}) {
  return { id: eventId, merchantId, orderId, fullCode, code, createdAt };
}

function makeRepository(connections, persist = vi.fn(async () => ({ outcome: 'inserted' }))) {
  return {
    listConnectionsForPolling: vi.fn(async () => connections),
    enqueuePolledEvent: persist,
    recordPollSuccess: vi.fn(async () => {})
  };
}

describe('iFood polling reconciliation', () => {
  it('persists a webhook duplicate and acknowledges the provider event once', async () => {
    const connection = makeConnection('merchant-a');
    const persist = vi.fn(async () => ({ outcome: 'duplicate' }));
    const repository = makeRepository([connection], persist);
    const adapter = {
      pollEvents: vi.fn(async () => [makeEnvelope()]),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    const summary = await reconciler.runReconciliationCycle();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0]).toMatchObject({
      eventId: 'event-1',
      merchantId: 'merchant-a',
      externalOrderId: 'order-1',
      eventType: 'PLACED',
      occurredAt: '1970-01-01T00:16:39.000Z',
      payload: expect.objectContaining({ id: 'event-1' })
    });
    expect(adapter.ackEvents).toHaveBeenCalledOnce();
    expect(adapter.ackEvents.mock.calls[0][0]).toEqual(['event-1']);
    expect(summary).toMatchObject({ events: 1, duplicates: 1, persisted: 1, acked: 1 });
  });

  it('does not acknowledge an event when persistence fails and keeps the cycle alive', async () => {
    const repository = makeRepository([makeConnection('merchant-a')], vi.fn(async () => {
      throw new Error('database unavailable');
    }));
    const adapter = {
      pollEvents: vi.fn(async () => [makeEnvelope()]),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    await expect(reconciler.runReconciliationCycle()).resolves.toMatchObject({
      events: 1,
      persisted: 0,
      persistFailures: 1,
      acked: 0
    });
    expect(adapter.ackEvents).not.toHaveBeenCalled();
  });

  it('survives a partial ACK failure and retries the persisted event on the next cycle', async () => {
    const persist = vi.fn(async () => ({
      outcome: persist.mock.calls.length === 0 ? 'inserted' : 'duplicate'
    }));
    const repository = makeRepository([makeConnection('merchant-a')], persist);
    let ackCalls = 0;
    const adapter = {
      pollEvents: vi.fn(async () => [makeEnvelope()]),
      ackEvents: vi.fn(async () => {
        ackCalls += 1;
        if (ackCalls === 1) throw new Error('ack unavailable');
        return { accepted: true };
      })
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    const first = await reconciler.runReconciliationCycle();
    const second = await reconciler.runReconciliationCycle();

    expect(first).toMatchObject({ persisted: 1, acked: 0, ackFailures: 1 });
    expect(second).toMatchObject({ duplicates: 1, persisted: 1, acked: 1, ackFailures: 0 });
    expect(adapter.ackEvents).toHaveBeenCalledTimes(2);
  });

  it('keeps paused and degraded merchants in ingestion while leaving their status for policy', async () => {
    const connections = [
      makeConnection('merchant-paused', { status: 'paused' }),
      makeConnection('merchant-degraded', { status: 'degraded' })
    ];
    const repository = makeRepository(connections);
    const adapter = {
      pollEvents: vi.fn(async () => []),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    const summary = await reconciler.runReconciliationCycle();

    expect(adapter.pollEvents).toHaveBeenCalledWith({
      merchantIds: ['merchant-paused', 'merchant-degraded'],
      signal: undefined
    });
    expect(repository.recordPollSuccess).toHaveBeenCalledTimes(2);
    // A successful authenticated poll is the token-validity evidence the
    // health policy needs; without it no merchant could ever recover.
    for (const [input] of repository.recordPollSuccess.mock.calls) {
      expect(input.polledAt).toBe(new Date(1_000_000).toISOString());
      expect(input.tokenConfirmedAt).toBe(input.polledAt);
    }
    expect(summary).toMatchObject({ merchants: 2, merchantsPolled: 2, polls: 1 });
  });

  it('batches 2,500 merchants into provider calls of at most 1,000', async () => {
    const connections = Array.from({ length: 2_500 }, (_, index) => makeConnection(`merchant-${index}`));
    const repository = makeRepository(connections);
    const adapter = {
      pollEvents: vi.fn(async () => []),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, batchSize: 5_000 });

    const summary = await reconciler.runReconciliationCycle();

    expect(adapter.pollEvents).toHaveBeenCalledTimes(3);
    expect(adapter.pollEvents.mock.calls.map(([input]) => input.merchantIds.length)).toEqual([1_000, 1_000, 500]);
    expect(summary).toMatchObject({ merchants: 2_500, merchantsPolled: 2_500, batches: 3 });
  });

  it('never acknowledges unknown merchants', async () => {
    const repository = makeRepository([makeConnection('merchant-a')], vi.fn(async () => ({ outcome: 'unknown_merchant' })));
    const adapter = {
      pollEvents: vi.fn(async () => [makeEnvelope()]),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository });

    const summary = await reconciler.runReconciliationCycle();

    expect(adapter.ackEvents).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ unknownMerchants: 1, persisted: 0, acked: 0 });
  });

  it('updates last_poll_at only after a successful provider poll', async () => {
    const repository = makeRepository([makeConnection('merchant-a'), makeConnection('merchant-b')]);
    const adapter = {
      pollEvents: vi.fn(async ({ merchantIds }) => {
        if (merchantIds.includes('merchant-a')) throw new Error('provider unavailable');
        return [];
      }),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    const summary = await reconciler.runReconciliationCycle();

    // Batch fails (a unauthorized/unavailable), then per-merchant retry:
    // merchant-a still fails, merchant-b succeeds and gets stamped.
    expect(repository.recordPollSuccess).toHaveBeenCalledTimes(1);
    expect(repository.recordPollSuccess.mock.calls[0][0]).toMatchObject({
      merchantId: 'merchant-b'
    });
    expect(summary).toMatchObject({ pollFailures: 1, pollMarks: 1, merchantsPolled: 1 });
  });

  it('retries per merchant when a mixed batch is rejected by the provider', async () => {
    const repository = makeRepository([
      makeConnection('merchant-ok'),
      makeConnection('merchant-foreign')
    ]);
    const adapter = {
      pollEvents: vi.fn(async ({ merchantIds }) => {
        if (merchantIds.length > 1) throw new Error('Some polling merchants are not authorized');
        if (merchantIds[0] === 'merchant-foreign') throw new Error('forbidden');
        return [makeEnvelope({ merchantId: 'merchant-ok' })];
      }),
      ackEvents: vi.fn(async () => ({ accepted: true }))
    };
    const reconciler = createIfoodReconciler({ adapter, repository, clock: () => 1_000_000 });

    const summary = await reconciler.runReconciliationCycle();

    expect(adapter.pollEvents).toHaveBeenCalledTimes(3); // 1 batch + 2 solo
    expect(repository.recordPollSuccess).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      pollFailures: 1,
      pollMarks: 1,
      inserted: 1,
      acked: 1
    });
  });

  it('clamps a configured polling interval to the 30-second provider minimum', async () => {
    const repository = makeRepository([]);
    const adapter = { pollEvents: vi.fn(), ackEvents: vi.fn() };
    const reconciler = createIfoodReconciler({
      adapter,
      repository,
      pollingIntervalMs: 1_000
    });

    await reconciler.runReconciliationCycle();

    expect(normalizePollingIntervalMs(1_000)).toBe(MIN_IFOOD_POLL_INTERVAL_MS);
    expect(repository.listConnectionsForPolling).toHaveBeenCalledWith(expect.objectContaining({
      pollingIntervalMs: MIN_IFOOD_POLL_INTERVAL_MS
    }));
  });

  it('returns only numeric counts and never exposes event data in summaries or logs', async () => {
    const logger = { error: vi.fn() };
    const repository = makeRepository([makeConnection('merchant-a')], vi.fn(async () => {
      throw new Error('persistence failed');
    }));
    const adapter = {
      pollEvents: vi.fn(async () => [makeEnvelope()]),
      ackEvents: vi.fn()
    };
    const reconciler = createIfoodReconciler({ adapter, repository, logger });

    const summary = await reconciler.runReconciliationCycle();

    expect(Object.values(summary).every((value) => typeof value === 'number')).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('event-1');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('event-1');
  });
});

describe('iFood connection health and fail-closed policy', () => {
  it('marks a merchant unhealthy without a worker heartbeat', () => {
    const result = evaluateConnectionHealth({
      connection: makeConnection('merchant-a'),
      workerHeartbeatAt: null,
      lastTokenAt: 1_000_000,
      now: 1_000_000
    });

    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain('worker_heartbeat_missing');
  });

  it('requests presence OFF only for the stale merchant and blocks commands while keeping orders visible', async () => {
    const now = 1_000_000;
    const presence = { setMerchantPresence: vi.fn(async () => {}) };
    const coordinator = createIfoodHealthCoordinator({ presence, maxAgeMs: 90_000 });

    const stale = await coordinator.applyMerchantHealth({
      connection: makeConnection('merchant-stale'),
      workerHeartbeatAt: null,
      lastTokenAt: now,
      now
    });
    const healthy = await coordinator.applyMerchantHealth({
      connection: makeConnection('merchant-healthy'),
      workerHeartbeatAt: now,
      lastTokenAt: now,
      now
    });

    expect(stale).toMatchObject({ healthy: false, commandsAllowed: false, presenceOnline: false, ordersVisible: true });
    expect(healthy).toMatchObject({ healthy: true, commandsAllowed: true, presenceOnline: true, ordersVisible: true });
    expect(presence.setMerchantPresence).toHaveBeenCalledOnce();
    expect(presence.setMerchantPresence).toHaveBeenCalledWith({ merchantId: 'merchant-stale', online: false });
  });

  it('recovers presence and commands only after token, worker and configuration are green', async () => {
    const now = 1_000_000;
    const presence = { setMerchantPresence: vi.fn(async () => {}) };
    const coordinator = createIfoodHealthCoordinator({ presence, maxAgeMs: 90_000 });
    const connection = makeConnection('merchant-a');

    await coordinator.applyMerchantHealth({ connection, workerHeartbeatAt: null, lastTokenAt: now, now });
    const notReady = await coordinator.applyMerchantHealth({
      connection: { ...connection, configurationValid: false },
      workerHeartbeatAt: now,
      lastTokenAt: now,
      now
    });
    const recovered = await coordinator.applyMerchantHealth({
      connection,
      workerHeartbeatAt: now,
      lastTokenAt: now,
      now
    });

    expect(notReady).toMatchObject({ healthy: false, commandsAllowed: false, presenceOnline: false });
    expect(recovered).toMatchObject({ healthy: true, commandsAllowed: true, presenceOnline: true });
    expect(presence.setMerchantPresence.mock.calls).toEqual([
      [{ merchantId: 'merchant-a', online: false }],
      [{ merchantId: 'merchant-a', online: true }]
    ]);
  });

  it('keeps paused merchants fail-closed even when their timestamps are fresh', () => {
    const result = resolveConnectionHealthPolicy({
      connection: makeConnection('merchant-paused', { status: 'paused' }),
      workerHeartbeatAt: 1_000_000,
      lastTokenAt: 1_000_000,
      now: 1_000_000
    });

    expect(result).toMatchObject({ healthy: false, commandsAllowed: false, presenceOnline: false, ordersVisible: true });
    expect(result.reasons).toContain('connection_paused');
  });

  it('uses a configurable max age when deciding whether a heartbeat is stale', () => {
    const result = evaluateConnectionHealth({
      connection: makeConnection('merchant-a'),
      workerHeartbeatAt: 1_000,
      lastTokenAt: 10_001,
      now: 10_001,
      maxAgeMs: 9_000
    });

    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain('worker_heartbeat_stale');
  });
});

describe('iFood worker optional Task 9 hooks', () => {
  it('runs reconcile and evaluateHealth per cycle with signal and sanitizes hook failures', async () => {
    const controller = new AbortController();
    const reconcile = vi.fn(async ({ signal }) => {
      expect(signal).toBe(controller.signal);
    });
    const evaluateHealth = vi.fn(async () => {
      throw new Error('provider event body unavailable');
    });
    const onError = vi.fn();
    const logger = { error: vi.fn() };
    const run = runIfoodWorker({
      repository: {
        probeDependencies: vi.fn(async () => ({ databaseReachable: true, leaseCapable: true }))
      },
      signal: controller.signal,
      intervalMs: 60_000,
      reconcile,
      evaluateHealth,
      onError,
      logger
    });

    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(evaluateHealth).toHaveBeenCalledOnce());
    controller.abort();
    await run;

    expect(JSON.stringify(onError.mock.calls)).not.toContain('provider event body unavailable');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('provider event body unavailable');
  });
});
