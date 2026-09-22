import { describe, expect, it, vi } from 'vitest';
import { createIfoodEventHandler } from '../src/lib/server/ifood/eventHandler.js';

function makeRow(overrides = {}) {
  return {
    inboxId: 'inbox-1',
    eventId: 'event-1',
    connectionId: 'connection-1',
    empresaId: 'empresa-1',
    merchantId: 'merchant-1',
    externalOrderId: 'order-1',
    eventType: 'PLACED',
    externalRevision: 0,
    occurredAt: '2026-09-16T12:00:00.000Z',
    payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'PLACED' },
    attempts: 1,
    leaseId: 'lease-1',
    leaseUntil: '2026-09-16T12:02:00.000Z',
    status: 'processing',
    ...overrides
  };
}

const baseOrderDetail = () => ({
  id: 'order-1',
  merchant: { id: 'merchant-1' },
  createdAt: '2026-09-16T12:00:00.000Z',
  preparationStartDateTime: '2026-09-16T12:01:00.000Z',
  orderType: 'DELIVERY',
  orderTiming: 'IMMEDIATE',
  delivery: { deliveredBy: 'IFOOD', deliveryDateTime: '2026-09-16T12:40:00.000Z' },
  customer: { name: 'Cliente Teste' },
  items: [
    { id: 'item-1', name: 'X-Burger', quantity: 1, unitPrice: 20, price: 20, totalPrice: 20, options: [] }
  ],
  payments: {
    prepaid: 20,
    pending: 0,
    methods: [{ method: 'CREDIT', currency: 'BRL', type: 'ONLINE', value: 20, prepaid: true }]
  },
  total: { subTotal: 20, deliveryFee: 0, orderAmount: 20 }
});

function createFakeIntegration({ getOrderDetail } = {}) {
  return {
    getOrderDetail: getOrderDetail ?? vi.fn(async () => baseOrderDetail())
  };
}

function createFakeRepository({ projectOrderEvent } = {}) {
  return {
    projectOrderEvent: projectOrderEvent ?? vi.fn(async () => ({ outcome: 'applied', zelo_order_id: 'zelo-1', revision: 1 }))
  };
}

function httpNotFoundError() {
  const error = new Error('iFood HTTP request failed');
  error.name = 'IfoodHttpError';
  error.status = 404;
  error.code = 'IFOOD_HTTP_NOT_FOUND';
  error.retryable = true;
  return error;
}

function retryableHttpError() {
  const error = new Error('iFood HTTP request failed');
  error.name = 'IfoodHttpError';
  error.status = 500;
  error.code = 'IFOOD_HTTP_SERVER';
  error.retryable = true;
  return error;
}

function nonRetryableHttpError() {
  const error = new Error('iFood HTTP request failed');
  error.name = 'IfoodHttpError';
  error.status = 400;
  error.code = 'IFOOD_HTTP_CLIENT';
  error.retryable = false;
  return error;
}

describe('createIfoodEventHandler', () => {
  it('short-circuits informational codes to processed without any RPC or detail fetch', async () => {
    const getOrderDetail = vi.fn();
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const row = makeRow({
      eventType: 'DELIVERY_DROP_CODE_REQUESTED',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'DELIVERY_DROP_CODE_REQUESTED' }
    });
    const result = await handler(row, {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(getOrderDetail).not.toHaveBeenCalled();
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('short-circuits DELIVERY_DROP_CODE_VALIDATION_SUCCESS without quarantining it', async () => {
    const getOrderDetail = vi.fn();
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const row = makeRow({
      eventType: 'DELIVERY_DROP_CODE_VALIDATION_SUCCESS',
      payload: {
        id: 'event-1',
        merchantId: 'merchant-1',
        orderId: 'order-1',
        code: 'DDCS',
        fullCode: 'DELIVERY_DROP_CODE_VALIDATION_SUCCESS'
      }
    });
    const result = await handler(row, {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(getOrderDetail).not.toHaveBeenCalled();
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('short-circuits the other informational code (CANCELLATION_REQUESTED) the same way', async () => {
    const getOrderDetail = vi.fn();
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const row = makeRow({
      eventType: 'CANCELLATION_REQUESTED',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLATION_REQUESTED' }
    });
    const result = await handler(row, {});

    expect(result.outcome).toBe('processed');
    expect(getOrderDetail).not.toHaveBeenCalled();
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('quarantines an unknown event code without any RPC or detail fetch', async () => {
    const getOrderDetail = vi.fn();
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const row = makeRow({
      eventType: 'SOME_FUTURE_CODE_NOBODY_KNOWS',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'SOME_FUTURE_CODE_NOBODY_KNOWS' }
    });
    const result = await handler(row, {});

    expect(result.outcome).toBe('quarantine');
    expect(result.errorCode).toBe('quarantine_unknown_event');
    expect(getOrderDetail).not.toHaveBeenCalled();
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('applies a normal PLACED-equivalent event: fetches detail, normalizes, calls the repository, returns processed', async () => {
    const getOrderDetail = vi.fn(async () => baseOrderDetail());
    const projectOrderEvent = vi.fn(async () => ({ outcome: 'applied', zelo_order_id: 'zelo-1', revision: 1 }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const row = makeRow();
    const result = await handler(row, {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(getOrderDetail).toHaveBeenCalledOnce();
    expect(getOrderDetail).toHaveBeenCalledWith('order-1', expect.objectContaining({ signal: undefined }));
    expect(projectOrderEvent).toHaveBeenCalledOnce();
    const call = projectOrderEvent.mock.calls[0][0];
    expect(call.merchantId).toBe('merchant-1');
    expect(call.externalOrderId).toBe('order-1');
    expect(call.externalStatus).toBe('PLACED');
    expect(call.order.items).toHaveLength(1);
  });

  it('a duplicate/stale event reported by the repository is still processed (not a failure)', async () => {
    const projectOrderEvent = vi.fn(async () => ({ outcome: 'ignored_duplicate' }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('processed');
  });

  it.each(['applied', 'ignored_duplicate'])('confirms a command after a %s projection outcome', async (outcome) => {
    const projectOrderEvent = vi.fn(async () => ({ outcome }));
    const confirmCommandsForEvent = vi.fn(async () => 1);
    const repository = createFakeRepository({ projectOrderEvent });
    repository.confirmCommandsForEvent = confirmCommandsForEvent;
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository
    });
    const signal = new AbortController().signal;

    await expect(handler(makeRow(), { signal })).resolves.toEqual({ outcome: 'processed' });
    expect(confirmCommandsForEvent).toHaveBeenCalledWith({
      merchantId: 'merchant-1',
      externalOrderId: 'order-1',
      externalStatus: 'PLACED',
      signal
    });
  });

  it('keeps the event processed when command correlation fails after projection', async () => {
    const secretMessage = 'event-correlation-detail-fixture-not-forwarded';
    const confirmCommandsForEvent = vi.fn(async () => { throw new Error(secretMessage); });
    const logger = { error: vi.fn() };
    const repository = createFakeRepository();
    repository.confirmCommandsForEvent = confirmCommandsForEvent;
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository,
      logger
    });

    await expect(handler(makeRow(), {})).resolves.toEqual({ outcome: 'processed' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secretMessage);
    expect(logger.error).toHaveBeenCalledWith('iFood command correlation failed after projection');
  });

  it('a stale event reported by the repository is processed', async () => {
    const projectOrderEvent = vi.fn(async () => ({ outcome: 'ignored_stale' }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('processed');
  });

  it('a terminal conflict reported by the repository is quarantined', async () => {
    const projectOrderEvent = vi.fn(async () => ({ outcome: 'quarantined_terminal_conflict' }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow({ eventType: 'CANCELLED', payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLED' } }), {});

    expect(result.outcome).toBe('quarantine');
    expect(result.errorCode).toBe('quarantine_terminal_conflict');
  });

  it('an unknown merchant reported by the repository is terminal', async () => {
    const projectOrderEvent = vi.fn(async () => ({ outcome: 'unknown_merchant' }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('UNKNOWN_MERCHANT');
  });

  it('getOrder 404 within the 10-minute window is retryable with a computed nextAttemptAt', async () => {
    const getOrderDetail = vi.fn(async () => { throw httpNotFoundError(); });
    const clock = () => Date.parse('2026-09-16T12:05:00.000Z'); // 5 minutes after occurredAt
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository(),
      clock,
      retryPolicy: { computeNextAttemptAt: () => '2026-09-16T12:06:00.000Z' }
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('retryable');
    expect(result.errorCode).toBe('ORDER_DETAIL_NOT_FOUND');
    expect(result.nextAttemptAt).toBe('2026-09-16T12:06:00.000Z');
  });

  it('getOrder 404 past the 10-minute window is terminal with ORDER_DETAIL_NOT_FOUND_TIMEOUT', async () => {
    const getOrderDetail = vi.fn(async () => { throw httpNotFoundError(); });
    const clock = () => Date.parse('2026-09-16T12:11:00.000Z'); // 11 minutes after occurredAt
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository(),
      clock
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('ORDER_DETAIL_NOT_FOUND_TIMEOUT');
  });

  it('falls back to an attempt ceiling when occurredAt is missing, instead of retrying forever', async () => {
    const getOrderDetail = vi.fn(async () => { throw httpNotFoundError(); });
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository()
    });

    const withinCeiling = await handler(makeRow({ occurredAt: null, attempts: 1 }), {});
    expect(withinCeiling.outcome).toBe('retryable');

    const pastCeiling = await handler(makeRow({ occurredAt: null, attempts: 5 }), {});
    expect(pastCeiling.outcome).toBe('terminal');
    expect(pastCeiling.errorCode).toBe('ORDER_DETAIL_NOT_FOUND_TIMEOUT');
  });

  it('getOrder other retryable error becomes retryable', async () => {
    const getOrderDetail = vi.fn(async () => { throw retryableHttpError(); });
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository()
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('retryable');
    expect(result.errorCode).toBe('ORDER_DETAIL_FETCH_FAILED');
  });

  it('getOrder non-retryable error becomes terminal', async () => {
    const getOrderDetail = vi.fn(async () => { throw nonRetryableHttpError(); });
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository()
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('ORDER_DETAIL_FETCH_ERROR');
  });

  it('the projection RPC call failing is retryable with a generic sanitized errorCode, never the raw error text', async () => {
    const secretMessage = 'database-detail-fixture-not-forwarded';
    const projectOrderEvent = vi.fn(async () => { throw new Error(secretMessage); });
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('retryable');
    expect(result.errorCode).toBe('PROJECTION_RPC_ERROR');
    expect(result.errorMessage).not.toContain(secretMessage);
    expect(JSON.stringify(result)).not.toContain(secretMessage);
  });

  it('an invalid order detail (contract violation) is terminal, not retried forever', async () => {
    const getOrderDetail = vi.fn(async () => ({ ...baseOrderDetail(), items: [] }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository()
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('ORDER_CONTRACT_INVALID');
  });

  it('a fetched order detail whose id does not match the requested externalOrderId is rejected, never projected', async () => {
    const getOrderDetail = vi.fn(async () => ({ ...baseOrderDetail(), id: 'a-completely-different-order' }));
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('ORDER_DETAIL_IDENTITY_MISMATCH');
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('a fetched order detail whose merchant does not match the row is rejected, never projected', async () => {
    const getOrderDetail = vi.fn(async () => ({ ...baseOrderDetail(), merchant: { id: 'a-different-merchant' } }));
    const projectOrderEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration({ getOrderDetail }),
      repository: createFakeRepository({ projectOrderEvent })
    });

    const result = await handler(makeRow(), {});

    expect(result.outcome).toBe('terminal');
    expect(result.errorCode).toBe('ORDER_DETAIL_IDENTITY_MISMATCH');
    expect(projectOrderEvent).not.toHaveBeenCalled();
  });

  it('throws when constructed without an integration exposing getOrderDetail', () => {
    expect(() => createIfoodEventHandler({ integration: {}, repository: createFakeRepository() })).toThrow();
  });

  it('throws when constructed without a repository exposing projectOrderEvent', () => {
    expect(() => createIfoodEventHandler({ integration: createFakeIntegration(), repository: {} })).toThrow();
  });

  it('commits stock after a CONFIRMED projection and keeps the event processed when stock fails', async () => {
    const commitStockForEvent = vi.fn(async () => ({ outcome: 'ok', committedCount: 1 }));
    const releaseStockForEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        commitStockForEvent,
        releaseStockForEvent
      }
    });

    const result = await handler(makeRow({
      eventType: 'CONFIRMED',
      eventId: 'event-confirmed-1',
      payload: { id: 'event-confirmed-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CONFIRMED' }
    }), {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(commitStockForEvent).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merchant-1',
      externalOrderId: 'order-1',
      eventId: 'event-confirmed-1',
      items: expect.any(Array)
    }));
    expect(releaseStockForEvent).not.toHaveBeenCalled();

    const failingCommit = vi.fn(async () => {
      throw new Error('stock-rpc-fixture-not-forwarded');
    });
    const logger = { error: vi.fn() };
    const resilient = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        commitStockForEvent: failingCommit
      },
      logger
    });
    const resilientResult = await resilient(makeRow({
      eventType: 'CONFIRMED',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CONFIRMED' }
    }), {});
    expect(resilientResult).toEqual({ outcome: 'processed' });
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(resilientResult)).not.toContain('stock-rpc-fixture-not-forwarded');
  });

  it('releases stock after a CANCELLED projection without reopening the inbox on failure', async () => {
    const releaseStockForEvent = vi.fn(async () => ({ outcome: 'ok', releasedCount: 1 }));
    const commitStockForEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        commitStockForEvent,
        releaseStockForEvent
      }
    });

    const result = await handler(makeRow({
      eventType: 'CANCELLED',
      eventId: 'event-cancelled-1',
      payload: { id: 'event:cancelled-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLED' }
    }), {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(releaseStockForEvent).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merchant-1',
      externalOrderId: 'order-1',
      eventId: 'event-cancelled-1'
    }));
    expect(commitStockForEvent).not.toHaveBeenCalled();
  });

  it('materializes the sale after a CONCLUDED projection and keeps the event processed when materialization fails', async () => {
    const materializeSaleForEvent = vi.fn(async () => ({ outcome: 'materialized', vendaId: 1 }));
    const reverseSaleForEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        materializeSaleForEvent,
        reverseSaleForEvent
      }
    });

    const result = await handler(makeRow({
      eventType: 'CONCLUDED',
      eventId: 'event-concluded-1',
      payload: { id: 'event-concluded-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CONCLUDED' }
    }), {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(materializeSaleForEvent).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merchant-1',
      externalOrderId: 'order-1'
    }));
    expect(reverseSaleForEvent).not.toHaveBeenCalled();

    const failingMaterialize = vi.fn(async () => {
      throw new Error('sale-rpc-fixture-not-forwarded');
    });
    const logger = { error: vi.fn() };
    const resilient = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        materializeSaleForEvent: failingMaterialize
      },
      logger
    });
    const resilientResult = await resilient(makeRow({
      eventType: 'CONCLUDED',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CONCLUDED' }
    }), {});
    expect(resilientResult).toEqual({ outcome: 'processed' });
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(resilientResult)).not.toContain('sale-rpc-fixture-not-forwarded');
  });

  it('reverses the sale after a CANCELLED projection without reopening the inbox on failure', async () => {
    const reverseSaleForEvent = vi.fn(async () => ({ outcome: 'applied', status: 'applied' }));
    const materializeSaleForEvent = vi.fn();
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        materializeSaleForEvent,
        reverseSaleForEvent
      }
    });

    const result = await handler(makeRow({
      eventType: 'CANCELLED',
      eventId: 'event-cancelled-sale-1',
      payload: { id: 'event-cancelled-sale-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLED' }
    }), {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(reverseSaleForEvent).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merchant-1',
      externalOrderId: 'order-1',
      eventId: 'event-cancelled-sale-1'
    }));
    expect(materializeSaleForEvent).not.toHaveBeenCalled();

    const failingReverse = vi.fn(async () => {
      throw new Error('reverse-rpc-fixture-not-forwarded');
    });
    const logger = { error: vi.fn() };
    const resilient = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        reverseSaleForEvent: failingReverse
      },
      logger
    });
    const resilientResult = await resilient(makeRow({
      eventType: 'CANCELLED',
      payload: { id: 'event-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLED' }
    }), {});
    expect(resilientResult).toEqual({ outcome: 'processed' });
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(resilientResult)).not.toContain('reverse-rpc-fixture-not-forwarded');
  });

  it('calls both stock release and sale reversal hooks on the same CANCELLED projection', async () => {
    const releaseStockForEvent = vi.fn(async () => ({ outcome: 'ok', releasedCount: 1 }));
    const reverseSaleForEvent = vi.fn(async () => ({ outcome: 'applied', status: 'applied' }));
    const handler = createIfoodEventHandler({
      integration: createFakeIntegration(),
      repository: {
        ...createFakeRepository(),
        releaseStockForEvent,
        reverseSaleForEvent
      }
    });

    const result = await handler(makeRow({
      eventType: 'CANCELLED',
      eventId: 'event-cancelled-both-1',
      payload: { id: 'event-cancelled-both-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'CANCELLED' }
    }), {});

    expect(result).toEqual({ outcome: 'processed' });
    expect(releaseStockForEvent).toHaveBeenCalledOnce();
    expect(reverseSaleForEvent).toHaveBeenCalledOnce();
  });
});
