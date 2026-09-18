import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createIfoodIntegration } from '../src/lib/server/ifood/createIfoodIntegration.js';
import { createMockIfoodAdapter } from '../src/lib/server/ifood/adapters/mockIfoodAdapter.js';
import { decideEventTransition } from '../src/lib/server/ifood/eventPolicy.js';

const loadFixture = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));

const placed = loadFixture('tests/fixtures/ifood/events/placed.json');
const concluded = loadFixture('tests/fixtures/ifood/events/concluded.json');
const cancelled = loadFixture('tests/fixtures/ifood/events/cancelled.json');

const event = (fullCode, createdAt = '2026-09-15T18:00:00.000Z') => ({
  id: `event-${fullCode.toLowerCase()}`,
  code: fullCode,
  fullCode,
  orderId: placed.orderId,
  merchantId: placed.merchantId,
  createdAt,
  metadata: { status: fullCode }
});

describe('iFood event policy', () => {
  it('accepts a new known event and maps it to the canonical status', () => {
    expect(decideEventTransition(null, placed)).toMatchObject({
      decision: 'apply',
      externalStatus: 'PLACED',
      internalStatus: 'pending_review'
    });
  });

  it('ignores a duplicate or stale event without regressing the order', () => {
    expect(decideEventTransition({ externalStatus: 'CONFIRMED' }, placed)).toMatchObject({
      decision: 'ignore',
      reason: 'stale'
    });
    expect(decideEventTransition({ externalStatus: 'PLACED' }, placed)).toMatchObject({
      decision: 'ignore',
      reason: 'duplicate'
    });
  });

  it('quarantines an unknown code instead of silently regressing state', () => {
    const result = decideEventTransition({ externalStatus: 'CONFIRMED' }, event('NEW_CODE'));

    expect(result).toMatchObject({ decision: 'quarantine', reason: 'unknown_event' });
    expect(result.externalStatus).toBe('NEW_CODE');
  });

  it('keeps normal event ranks monotonic while allowing explicit terminal exceptions', () => {
    expect(decideEventTransition({ externalStatus: 'PREPARATION_STARTED' }, event('READY_TO_PICKUP')))
      .toMatchObject({ decision: 'apply', internalStatus: 'ready' });
    expect(decideEventTransition({ externalStatus: 'CONCLUDED', occurredAt: '2026-09-15T18:00:00.000Z' }, {
      ...cancelled,
      createdAt: '2026-09-15T19:00:00.000Z'
    }))
      .toMatchObject({ decision: 'apply', reason: 'terminal_override', internalStatus: 'cancelled' });
    expect(decideEventTransition({ externalStatus: 'CANCELLED', occurredAt: '2026-09-15T18:00:00.000Z' }, {
      ...concluded,
      createdAt: '2026-09-15T19:00:00.000Z'
    }))
      .toMatchObject({ decision: 'apply', reason: 'terminal_override', internalStatus: 'delivered' });
  });

  it('quarantines an older terminal event instead of oscillating terminal state', () => {
    expect(decideEventTransition({ externalStatus: 'CANCELLED', occurredAt: '2026-09-15T20:00:00.000Z' }, {
      ...concluded,
      createdAt: '2026-09-15T19:00:00.000Z'
    })).toMatchObject({ decision: 'quarantine', reason: 'terminal_conflict' });
    expect(decideEventTransition({ externalStatus: 'CONCLUDED', occurredAt: '2026-09-15T20:00:00.000Z' }, {
      ...cancelled,
      createdAt: '2026-09-15T19:00:00.000Z'
    })).toMatchObject({ decision: 'quarantine', reason: 'terminal_conflict' });
  });

  it('quarantines an ambiguous terminal conflict without trustworthy timestamps', () => {
    expect(decideEventTransition({ externalStatus: 'CONCLUDED' }, cancelled))
      .toMatchObject({ decision: 'quarantine', reason: 'terminal_conflict_ambiguous' });
    expect(decideEventTransition({ externalStatus: 'CONCLUDED', occurredAt: 'not-a-date' }, cancelled))
      .toMatchObject({ decision: 'quarantine', reason: 'terminal_conflict_ambiguous' });
  });
});

describe('IfoodIntegration', () => {
  it('persists an event through its small interface and does not duplicate effects', async () => {
    const repository = {
      appendEvent: vi.fn()
        .mockResolvedValueOnce({ inserted: true })
        .mockResolvedValueOnce({ inserted: false, duplicate: true })
    };
    const adapter = createMockIfoodAdapter();
    const integration = createIfoodIntegration({
      adapter,
      repository,
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });

    const first = await integration.receiveEvent(placed);
    const second = await integration.receiveEvent(placed);

    expect(repository.appendEvent).toHaveBeenCalledTimes(2);
    expect(repository.appendEvent).toHaveBeenCalledWith(placed);
    expect(first).toMatchObject({ accepted: true, duplicate: false, eventId: placed.id });
    expect(second).toMatchObject({ accepted: true, duplicate: true, eventId: placed.id });
  });

  it('keeps a quarantined event durable and exposes the decision to the caller', async () => {
    const repository = {
      appendEvent: vi.fn().mockResolvedValue({ inserted: true }),
      getOrderState: vi.fn().mockResolvedValue({ externalStatus: 'CONFIRMED' }),
      quarantineEvent: vi.fn().mockResolvedValue(undefined)
    };
    const integration = createIfoodIntegration({
      adapter: createMockIfoodAdapter(),
      repository,
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });

    const result = await integration.receiveEvent(event('EVENT_NOT_YET_SUPPORTED'));

    expect(result).toMatchObject({ accepted: true, quarantined: true, decision: 'quarantine' });
    expect(repository.appendEvent).toHaveBeenCalledOnce();
    expect(repository.quarantineEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'event-event_not_yet_supported'
    }));
  });

  it('requires durable quarantine and retries it after a failed quarantine attempt', async () => {
    const repository = {
      appendEvent: vi.fn().mockResolvedValue({ inserted: true }),
      quarantineEvent: vi.fn()
        .mockRejectedValueOnce(new Error('temporary quarantine failure'))
        .mockResolvedValueOnce(undefined)
    };
    const integration = createIfoodIntegration({
      adapter: createMockIfoodAdapter(),
      repository,
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });
    const unknown = event('EVENT_NOT_YET_SUPPORTED');

    await expect(integration.receiveEvent(unknown)).rejects.toThrow('temporary quarantine failure');
    await expect(integration.receiveEvent(unknown)).resolves.toMatchObject({ quarantined: true });
    expect(repository.appendEvent).toHaveBeenCalledTimes(2);
    expect(repository.quarantineEvent).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a quarantinable event has no durable quarantine operation', async () => {
    const repository = { appendEvent: vi.fn().mockResolvedValue({ inserted: true }) };
    const integration = createIfoodIntegration({
      adapter: createMockIfoodAdapter(),
      repository,
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });

    await expect(integration.receiveEvent(event('EVENT_NOT_YET_SUPPORTED')))
      .rejects.toThrow(/quarantineEvent/);
  });

  it('delegates external actions and connection operations to the injected adapter', async () => {
    const adapter = createMockIfoodAdapter({
      merchants: [{ id: 'merchant-fixture' }],
      actionResult: { accepted: true, status: 'accepted_http' }
    });
    const integration = createIfoodIntegration({
      adapter,
      repository: {},
      clock: () => new Date('2026-09-15T18:00:00.000Z')
    });

    await expect(integration.connectMerchant({ merchantId: 'merchant-fixture' }))
      .resolves.toEqual({ merchantId: 'merchant-fixture', connected: true });
    await expect(integration.requestOrderAction({ orderId: placed.orderId, action: 'confirm' }))
      .resolves.toMatchObject({ accepted: true, status: 'accepted_http' });
  });
});
