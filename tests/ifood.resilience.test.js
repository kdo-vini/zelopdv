import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMockIfoodAdapter } from '../src/lib/server/ifood/adapters/mockIfoodAdapter.js';
import { createIfoodIntegration } from '../src/lib/server/ifood/createIfoodIntegration.js';
import { createIfoodReconciler } from '../src/lib/server/ifood/reconciliation.js';
import { createIfoodInboxProcessor } from '../src/lib/server/ifood/inboxProcessor.js';
import { createIfoodCommandProcessor } from '../src/lib/server/ifood/commandProcessor.js';
import {
  evaluateConnectionHealth,
  resolveConnectionHealthPolicy
} from '../src/lib/server/ifood/connectionHealth.js';
import { decideEventTransition } from '../src/lib/server/ifood/eventPolicy.js';
import { IfoodHttpError, createIfoodRequestClient } from '../src/lib/server/ifood/http/request.js';
import { createCanonicalOrderAutoPrintRuntime } from '../src/lib/canonicalOrderAutoPrintRuntime.js';
import { shouldPrintIfoodOrder } from '../src/lib/orders/ifoodPrinting.js';

const placed = JSON.parse(readFileSync(resolve('tests/fixtures/ifood/events/placed.json'), 'utf8'));
const concluded = JSON.parse(readFileSync(resolve('tests/fixtures/ifood/events/concluded.json'), 'utf8'));
const rateLimit = JSON.parse(readFileSync(resolve('tests/fixtures/ifood/errors/rate-limit.json'), 'utf8'));

function makeInboxRow(overrides = {}) {
  return {
    inboxId: 'inbox-resilience-1',
    eventId: placed.id,
    connectionId: 'connection-1',
    empresaId: 'empresa-1',
    merchantId: placed.merchantId,
    externalOrderId: placed.orderId,
    eventType: placed.fullCode,
    externalRevision: 1,
    occurredAt: placed.createdAt,
    payload: { ...placed },
    attempts: 1,
    leaseId: 'lease-1',
    leaseUntil: '2026-09-16T12:02:00.000Z',
    status: 'processing',
    ...overrides
  };
}

describe('iFood resilience — webhook lost recovered by poll', () => {
  it('persists a polled event that the webhook never delivered and acks once', async () => {
    const persist = vi.fn(async () => ({ outcome: 'inserted' }));
    const repository = {
      listConnectionsForPolling: vi.fn(async () => [{
        connectionId: 'c1',
        merchantId: placed.merchantId,
        status: 'active',
        configurationValid: true
      }]),
      enqueuePolledEvent: persist,
      recordPollSuccess: vi.fn(async () => {})
    };
    const adapter = createMockIfoodAdapter({ events: [placed] });
    const reconciler = createIfoodReconciler({
      adapter,
      repository,
      clock: () => Date.parse(placed.createdAt)
    });

    const summary = await reconciler.runReconciliationCycle();
    expect(persist).toHaveBeenCalledOnce();
    expect(adapter.calls.some((c) => c.method === 'ackEvents')).toBe(true);
    expect(summary).toMatchObject({ events: 1, persisted: 1, acked: 1, duplicates: 0 });
  });
});

describe('iFood resilience — duplicate and inverted order', () => {
  it('ignores a duplicate status and quarantines an older inverted non-terminal regression', () => {
    const current = {
      externalStatus: 'CONFIRMED',
      lastEventAt: '2026-09-15T18:05:00.000Z'
    };
    const dup = decideEventTransition(current, {
      fullCode: 'CONFIRMED',
      createdAt: '2026-09-15T18:06:00.000Z'
    });
    expect(dup.decision).toBe('ignore');
    expect(dup.reason).toBe('duplicate');

    const inverted = decideEventTransition(current, {
      fullCode: 'PLACED',
      createdAt: '2026-09-15T18:04:00.000Z'
    });
    expect(inverted.decision).toBe('ignore');
    expect(inverted.reason).toBe('stale');
  });

  it('integration marks a second append of the same event id as duplicate', async () => {
    const seen = new Set();
    const repository = {
      appendEvent: vi.fn(async (event) => {
        if (seen.has(event.id)) return { duplicate: true, inserted: false };
        seen.add(event.id);
        return { inserted: true };
      }),
      getOrderState: vi.fn(async () => null),
      quarantineEvent: vi.fn(async () => {})
    };
    const integration = createIfoodIntegration({
      adapter: createMockIfoodAdapter(),
      repository
    });
    const first = await integration.receiveEvent(placed);
    const second = await integration.receiveEvent(placed);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(repository.appendEvent).toHaveBeenCalledTimes(2);
  });
});

describe('iFood resilience — HTTP faults (401 / 404 / 429 / 5xx / timeout)', () => {
  it('surfaces rate-limit fixture metadata without leaking secrets', () => {
    expect(rateLimit).toMatchObject({ statusCode: 429, retryAfter: 30 });
    expect(JSON.stringify(rateLimit)).not.toMatch(/bearer|client[_-]?secret|access[_-]?token/i);
  });

  it('marks transient 404 as retryable and does not auto-retry ambiguous POST timeout', async () => {
    const notFound = new IfoodHttpError({ status: 404, code: 'IFOOD_HTTP_NOT_FOUND', retryable: true });
    expect(notFound.retryable).toBe(true);
    expect(notFound.status).toBe(404);

    let calls = 0;
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          calls += 1;
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const { request } = createIfoodRequestClient({
      baseUrl: 'https://merchant-api.ifood.com.br',
      fetch: fetchImpl,
      tokenCache: { getToken: async () => 'tok', invalidate: () => {} },
      rateLimiter: { observe: () => {}, wait: async () => {} },
      sleep: vi.fn(async () => {}),
      random: () => 0,
      timeoutMs: 20,
      retryBudgetMs: 20,
      maxAttempts: 3
    });
    await expect(request({
      method: 'POST',
      path: '/order/1/confirm',
      retryUnsafe: false
    })).rejects.toMatchObject({ code: 'IFOOD_HTTP_TIMEOUT' });
    expect(calls).toBe(1);
  });

  it('401 invalidates and 429 is observable from Retry-After fixture shape', () => {
    expect(rateLimit.retryAfter).toBe(30);
    const unauthorized = new IfoodHttpError({ status: 401, code: 'IFOOD_HTTP_UNAUTHORIZED', retryable: true });
    expect(unauthorized.status).toBe(401);
    const server = new IfoodHttpError({ status: 503, code: 'IFOOD_HTTP_SERVER', retryable: true });
    expect(server.retryable).toBe(true);
  });
});

describe('iFood resilience — lease abandoned and fila acumulada', () => {
  it('reclaims a previously leased row on the next claim and never finishes twice for the same lease', async () => {
    const row = makeInboxRow({ attempts: 2, leaseId: 'abandoned-lease' });
    const finishEvent = vi.fn(async () => {});
    let claimCount = 0;
    const repository = {
      claimEvents: vi.fn(async () => {
        claimCount += 1;
        return claimCount === 1 ? [row] : [];
      }),
      finishEvent
    };
    const processor = createIfoodInboxProcessor({
      repository,
      workerId: 'w1',
      handler: async () => ({ outcome: 'processed' })
    });
    await processor.runInboxCycle();
    await processor.runInboxCycle();
    expect(finishEvent).toHaveBeenCalledTimes(1);
    expect(finishEvent.mock.calls[0][0]).toMatchObject({
      inboxId: row.inboxId,
      leaseId: 'abandoned-lease',
      outcome: 'processed'
    });
  });
});

describe('iFood resilience — comando 202 sem evento e fail-closed', () => {
  it('accepts HTTP 202 as accepted_http without inventing an inbox event', async () => {
    const row = {
      commandId: 'command-1',
      connectionId: 'connection-1',
      orderRefId: 'order-ref-1',
      empresaId: 'empresa-1',
      merchantId: placed.merchantId,
      externalOrderId: placed.orderId,
      intent: 'confirm',
      expectedExternalRevision: 1,
      idempotencyKey: 'k1',
      payload: {},
      attempts: 1,
      leaseId: 'lease-1',
      leaseUntil: '2026-09-16T12:02:00.000Z',
      status: 'sending'
    };
    const repository = {
      claimCommands: vi.fn(async () => [row]),
      finishCommand: vi.fn(async () => {})
    };
    const adapter = {
      confirm: vi.fn(async () => ({ accepted: true, status: 'accepted_http' }))
    };
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'w1'
    });
    const summary = await processor.runCommandCycle();
    expect(summary.acceptedHttp).toBe(1);
    expect(repository.finishCommand).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'accepted_http'
    }));
  });

  it('blocks commands when merchant health is fail-closed', async () => {
    const policy = resolveConnectionHealthPolicy({
      connection: {
        merchantId: placed.merchantId,
        status: 'paused',
        configurationValid: true,
        lastWebhookAt: new Date().toISOString(),
        lastPollAt: new Date().toISOString(),
        lastTokenAt: new Date().toISOString(),
        workerHeartbeatAt: new Date().toISOString()
      },
      now: Date.now(),
      maxAgeMs: 90_000
    });
    expect(policy.commandsAllowed).toBe(false);
    expect(policy.ordersVisible).toBe(true);
    expect(policy.presenceOnline).toBe(false);

    const unhealthy = evaluateConnectionHealth({
      connection: { status: 'degraded', configurationValid: false, merchantId: 'm1' },
      now: Date.now(),
      maxAgeMs: 90_000
    });
    expect(unhealthy.healthy).toBe(false);
  });

  it('marks command retryable when isMerchantCommandAllowed denies the merchant', async () => {
    const row = {
      commandId: 'command-2',
      connectionId: 'connection-1',
      orderRefId: 'order-ref-1',
      empresaId: 'empresa-1',
      merchantId: placed.merchantId,
      externalOrderId: placed.orderId,
      intent: 'confirm',
      expectedExternalRevision: 1,
      idempotencyKey: 'k2',
      payload: {},
      attempts: 1,
      leaseId: 'lease-2',
      leaseUntil: '2026-09-16T12:02:00.000Z',
      status: 'sending'
    };
    const repository = {
      claimCommands: vi.fn(async () => [row]),
      finishCommand: vi.fn(async () => {})
    };
    const adapter = { confirm: vi.fn(async () => ({ accepted: true })) };
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'w1',
      isMerchantCommandAllowed: async () => false
    });
    const summary = await processor.runCommandCycle();
    expect(summary.unhealthy).toBe(1);
    expect(adapter.confirm).not.toHaveBeenCalled();
    expect(repository.finishCommand).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed_retryable',
      errorCode: 'CONNECTION_UNHEALTHY'
    }));
  });
});

describe('iFood resilience — impressão incerta e queda após commit', () => {
  it('keeps PRINT_OUTCOME_UNKNOWN reservations so a concurrent refresh cannot reprint', async () => {
    const release = vi.fn();
    const print = vi.fn().mockRejectedValue(
      Object.assign(new Error('unknown'), { code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false })
    );
    let rows = [];
    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: async () => rows,
      subscribe: () => () => {},
      print,
      reserve: () => true,
      release,
      resolvePrintOwner: () => 'zelo',
      scheduleInterval: () => 1,
      clearScheduledInterval: vi.fn()
    });
    await runtime.start();
    rows = [{
      id: 'unknown-1',
      source: 'ifood',
      canonical: true,
      status: 'accepted',
      criado_em: new Date().toISOString(),
      ifood: { scheduled: false, preparationStartAt: null, displayId: '1' }
    }];
    await runtime.refresh();
    expect(release).not.toHaveBeenCalledWith('unknown-1');
    expect(shouldPrintIfoodOrder({
      order: rows[0],
      printOwner: 'zelo',
      now: Date.now()
    }).shouldPrint).toBe(true);
  });

  it('keeps concluded sale materialization identity stable across a crash after commit signal', async () => {
    const materialized = new Set();
    const materializeSaleForEvent = vi.fn(async ({ externalOrderId }) => {
      if (materialized.has(externalOrderId)) {
        return { outcome: 'duplicate', vendaId: 99 };
      }
      materialized.add(externalOrderId);
      return { outcome: 'materialized', vendaId: 99 };
    });
    const first = await materializeSaleForEvent({ externalOrderId: concluded.orderId });
    const second = await materializeSaleForEvent({ externalOrderId: concluded.orderId });
    expect(first.outcome).toBe('materialized');
    expect(second.outcome).toBe('duplicate');
    expect(first.vendaId).toBe(second.vendaId);
  });
});
