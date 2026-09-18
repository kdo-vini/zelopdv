import { describe, expect, it, vi } from 'vitest';
import {
  computeNextAttemptAt,
  computeNextAttemptDelayMs
} from '../src/lib/server/ifood/retryPolicy.js';
import { createIfoodInboxProcessor } from '../src/lib/server/ifood/inboxProcessor.js';

function makeRow(overrides = {}) {
  return {
    inboxId: 'inbox-1',
    eventId: 'event-1',
    connectionId: 'connection-1',
    empresaId: 'empresa-1',
    merchantId: 'merchant-1',
    externalOrderId: 'order-1',
    eventType: 'PLACED',
    externalRevision: 1,
    occurredAt: '2026-09-16T00:00:00.000Z',
    payload: { secret: 'never-log-this' },
    attempts: 1,
    leaseId: 'lease-1',
    leaseUntil: '2026-09-16T00:02:00.000Z',
    status: 'processing',
    ...overrides
  };
}

/**
 * Minimal fake repository matching the two-method seam:
 * `claimEvents({ workerId, limit, leaseSeconds, signal })` and
 * `finishEvent({ inboxId, leaseId, outcome, errorCode, errorMessage, nextAttemptAt, signal })`.
 */
function createFakeRepository(rows) {
  const finishCalls = [];
  return {
    rows,
    finishCalls,
    claimEvents: vi.fn(async () => rows),
    finishEvent: vi.fn(async (args) => {
      finishCalls.push(args);
    })
  };
}

describe('retryPolicy', () => {
  it('is bounded, deterministic given injected random, and non-decreasing with attempts', () => {
    const random = () => 0.5;
    const capMs = 600_000;
    const delays = [0, 1, 2, 5, 10, 20].map((attempts) =>
      computeNextAttemptDelayMs({ attempts, random, capMs })
    );

    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(capMs);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces the same delay for the same inputs (deterministic)', () => {
    const random = () => 0.37;
    const a = computeNextAttemptDelayMs({ attempts: 3, random });
    const b = computeNextAttemptDelayMs({ attempts: 3, random });
    expect(a).toBe(b);
  });

  it('computes an absolute next_attempt_at from a clock and a delay', () => {
    const clock = () => new Date('2026-09-16T00:00:00.000Z').getTime();
    const random = () => 0;
    const iso = computeNextAttemptAt({ attempts: 0, clock, random });
    expect(iso).toBe('2026-09-16T00:00:00.000Z');

    const randomHalf = () => 0.5;
    const isoLater = computeNextAttemptAt({ attempts: 4, clock, random: randomHalf });
    expect(new Date(isoLater).getTime()).toBeGreaterThan(clock());
  });
});

describe('createIfoodInboxProcessor', () => {
  it('happy path: claims N rows, handler returns processed for all, finishEvent called once per row', async () => {
    const rows = [makeRow({ inboxId: 'a' }), makeRow({ inboxId: 'b' }), makeRow({ inboxId: 'c' })];
    const repository = createFakeRepository(rows);
    const handler = vi.fn(async () => ({ outcome: 'processed' }));

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    const summary = await processor.runInboxCycle();

    expect(repository.finishCalls).toHaveLength(3);
    expect(summary).toMatchObject({ claimed: 3, processed: 3, retried: 0, deadLettered: 0, finishFailed: 0 });
    for (let i = 0; i < rows.length; i += 1) {
      expect(repository.finishCalls[i]).toMatchObject({
        inboxId: rows[i].inboxId,
        leaseId: rows[i].leaseId,
        outcome: 'processed'
      });
    }
  });

  it('handler returns retryable without nextAttemptAt: finishEvent gets a computed future nextAttemptAt, monotonic across attempts', async () => {
    const rowLowAttempts = makeRow({ inboxId: 'low', attempts: 1 });
    const rowHighAttempts = makeRow({ inboxId: 'high', attempts: 8 });
    const repository = createFakeRepository([rowLowAttempts, rowHighAttempts]);
    const handler = vi.fn(async () => ({ outcome: 'retryable' }));
    const fixedNow = new Date('2026-09-16T00:00:00.000Z').getTime();

    const processor = createIfoodInboxProcessor({
      repository,
      handler,
      workerId: 'worker-1',
      clock: () => fixedNow,
      random: () => 0.5
    });
    await processor.runInboxCycle();

    expect(repository.finishCalls).toHaveLength(2);
    const [lowCall, highCall] = repository.finishCalls;
    expect(lowCall.outcome).toBe('retryable');
    expect(highCall.outcome).toBe('retryable');
    expect(new Date(lowCall.nextAttemptAt).getTime()).toBeGreaterThan(fixedNow);
    expect(new Date(highCall.nextAttemptAt).getTime()).toBeGreaterThan(fixedNow);
    expect(new Date(highCall.nextAttemptAt).getTime()).toBeGreaterThanOrEqual(
      new Date(lowCall.nextAttemptAt).getTime()
    );
  });

  it('handler returns terminal and quarantine: both call finishEvent with their outcome string (both land on DB dead_letter, distinguished only by errorCode)', async () => {
    const rowTerminal = makeRow({ inboxId: 'terminal-row' });
    const rowQuarantine = makeRow({ inboxId: 'quarantine-row' });
    const repository = createFakeRepository([rowTerminal, rowQuarantine]);
    const handler = vi.fn(async (row) => {
      if (row.inboxId === 'terminal-row') {
        return { outcome: 'terminal', errorCode: 'terminal_error', errorMessage: 'unrecoverable' };
      }
      return { outcome: 'quarantine', errorCode: 'quarantine_unknown_event', errorMessage: 'unknown event type' };
    });

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    const summary = await processor.runInboxCycle();

    // finish_ifood_event_v1's `case` collapses both 'terminal' and 'quarantine'
    // to the DB status `dead_letter` — the migration is applied in production
    // and was NOT modified. The processor still passes the distinct outcome
    // string through so `errorCode` is what tells them apart afterward.
    expect(repository.finishCalls[0]).toMatchObject({ outcome: 'terminal', errorCode: 'terminal_error' });
    expect(repository.finishCalls[1]).toMatchObject({ outcome: 'quarantine', errorCode: 'quarantine_unknown_event' });
    expect(summary.deadLettered).toBe(2);
  });

  it('handler throws: finishEvent called with retryable and a generic errorCode; thrown message never appears anywhere', async () => {
    const secretMessage = 'DB password is hunter2 and payload had CPF 123.456.789-00';
    const row = makeRow();
    const repository = createFakeRepository([row]);
    const logger = { error: vi.fn() };
    const handler = vi.fn(async () => {
      throw new Error(secretMessage);
    });

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1', logger });
    const summary = await processor.runInboxCycle();

    expect(repository.finishCalls).toHaveLength(1);
    const call = repository.finishCalls[0];
    expect(call.outcome).toBe('retryable');
    expect(call.errorCode).toBeTruthy();
    expect(call.errorCode).not.toMatch(/hunter2|CPF|123\.456\.789-00/);
    expect(JSON.stringify(call)).not.toContain(secretMessage);
    expect(summary.retried).toBe(1);

    for (const call2 of logger.error.mock.calls) {
      expect(JSON.stringify(call2)).not.toContain(secretMessage);
    }
  });

  it('finishEvent throws for one row (simulating LEASE_LOST): cycle does not throw, continues to finish remaining rows', async () => {
    const rowA = makeRow({ inboxId: 'a', leaseId: 'lease-a' });
    const rowB = makeRow({ inboxId: 'b', leaseId: 'lease-b' });
    const repository = createFakeRepository([rowA, rowB]);
    repository.finishEvent = vi.fn(async (args) => {
      if (args.inboxId === 'a') {
        throw new Error('LEASE_LOST: real db internals, never log verbatim');
      }
      repository.finishCalls.push(args);
    });
    const logger = { error: vi.fn() };
    const handler = vi.fn(async () => ({ outcome: 'processed' }));

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1', logger });
    let thrown = null;
    let summary;
    try {
      summary = await processor.runInboxCycle();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeNull();
    expect(repository.finishEvent).toHaveBeenCalledTimes(2);
    expect(repository.finishCalls).toHaveLength(1);
    expect(repository.finishCalls[0].inboxId).toBe('b');
    expect(summary.finishFailed).toBe(1);
    expect(summary.processed).toBe(1);
    for (const call of logger.error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('real db internals');
    }
  });

  it('unknown/malformed handler outcome is treated as retryable and never passed through to finishEvent verbatim', async () => {
    const row = makeRow();
    const repository = createFakeRepository([row]);
    const handler = vi.fn(async () => ({ outcome: 'sucess_typo' }));

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    await processor.runInboxCycle();

    expect(repository.finishCalls).toHaveLength(1);
    expect(repository.finishCalls[0].outcome).toBe('retryable');
    expect(repository.finishCalls[0].outcome).not.toBe('sucess_typo');
  });

  it('missing outcome field is treated as retryable', async () => {
    const row = makeRow();
    const repository = createFakeRepository([row]);
    const handler = vi.fn(async () => ({}));

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    await processor.runInboxCycle();

    expect(repository.finishCalls[0].outcome).toBe('retryable');
  });

  it('two processors sharing one fake repository claim and finish every row exactly once between them', async () => {
    const allRows = [makeRow({ inboxId: '1' }), makeRow({ inboxId: '2' }), makeRow({ inboxId: '3' }), makeRow({ inboxId: '4' })];
    const claimed = new Set();
    const finished = [];

    // Fake enforces: a row already claimed can't be claimed again until its
    // lease naturally expires (simulated here as "never" within this test).
    const sharedRepository = {
      claimEvents: async () => {
        const available = allRows.filter((r) => !claimed.has(r.inboxId));
        for (const row of available) claimed.add(row.inboxId);
        return available;
      },
      finishEvent: async (args) => {
        finished.push(args);
      }
    };

    const handler = vi.fn(async () => ({ outcome: 'processed' }));
    const processorA = createIfoodInboxProcessor({ repository: sharedRepository, handler, workerId: 'worker-a' });
    const processorB = createIfoodInboxProcessor({ repository: sharedRepository, handler, workerId: 'worker-b' });

    const [summaryA, summaryB] = await Promise.all([
      processorA.runInboxCycle(),
      processorB.runInboxCycle()
    ]);

    expect(finished).toHaveLength(4);
    const finishedIds = finished.map((f) => f.inboxId).sort();
    expect(finishedIds).toEqual(['1', '2', '3', '4']);
    expect(summaryA.claimed + summaryB.claimed).toBe(4);
    expect(summaryA.processed + summaryB.processed).toBe(4);
  });

  it('returns trivially without calling claimEvents when signal is already aborted', async () => {
    const repository = createFakeRepository([makeRow()]);
    const handler = vi.fn(async () => ({ outcome: 'processed' }));
    const controller = new AbortController();
    controller.abort();

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    const summary = await processor.runInboxCycle({ signal: controller.signal });

    expect(repository.claimEvents).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ claimed: 0, processed: 0, retried: 0, deadLettered: 0, finishFailed: 0 });
  });

  it('processes claimed rows sequentially, in the order returned by claimEvents', async () => {
    const order = [];
    const rows = [makeRow({ inboxId: 'first' }), makeRow({ inboxId: 'second' }), makeRow({ inboxId: 'third' })];
    const repository = createFakeRepository(rows);
    const handler = vi.fn(async (row) => {
      order.push(`start:${row.inboxId}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${row.inboxId}`);
      return { outcome: 'processed' };
    });

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    await processor.runInboxCycle();

    expect(order).toEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second',
      'start:third',
      'end:third'
    ]);
  });

  it('never logs or surfaces payload contents in the summary object', async () => {
    const row = makeRow({ payload: { customer: { phone: '11999998888' } } });
    const repository = createFakeRepository([row]);
    const handler = vi.fn(async () => ({ outcome: 'processed' }));

    const processor = createIfoodInboxProcessor({ repository, handler, workerId: 'worker-1' });
    const summary = await processor.runInboxCycle();

    expect(JSON.stringify(summary)).not.toContain('11999998888');
  });
});
