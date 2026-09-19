import { describe, expect, it, vi } from 'vitest';
import { createIfoodCommandProcessor } from '../src/lib/server/ifood/commandProcessor.js';

const SIGNAL = new AbortController().signal;

function makeRow(overrides = {}) {
  return {
    commandId: 'command-1',
    connectionId: 'connection-1',
    orderRefId: 'order-ref-1',
    empresaId: 'empresa-1',
    merchantId: 'merchant-1',
    externalOrderId: 'external-order-1',
    intent: 'confirm',
    expectedExternalRevision: 1,
    idempotencyKey: 'ifood:command:v1:empresa-1:order-1:confirm:1',
    payload: {},
    attempts: 1,
    leaseId: 'lease-1',
    leaseUntil: '2026-09-16T12:02:00.000Z',
    status: 'sending',
    ...overrides,
  };
}

function makeRepository(rows = []) {
  return {
    claimCommands: vi.fn(async () => rows),
    finishCommand: vi.fn(async () => {}),
    expireAcceptedCommands: vi.fn(async () => 0),
  };
}

function makeAdapter() {
  return {
    confirm: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
    startPreparation: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
    readyToPickup: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
    dispatch: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
    verifyDeliveryCode: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
    requestCancellation: vi.fn(async () => ({ accepted: true, status: 'accepted_http' })),
  };
}

describe('createIfoodCommandProcessor', () => {
  it.each([
    ['confirm', 'confirm'],
    ['start_preparation', 'startPreparation'],
    ['ready_to_pickup', 'readyToPickup'],
    ['dispatch', 'dispatch'],
  ])('maps %s to adapter.%s and finishes only as accepted_http for 202', async (intent, method) => {
    const row = makeRow({ intent });
    const repository = makeRepository([row]);
    const adapter = makeAdapter();
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'worker-1',
    });

    const summary = await processor.runCommandCycle({ signal: SIGNAL });

    expect(adapter[method]).toHaveBeenCalledWith('external-order-1', { signal: SIGNAL });
    expect(repository.finishCommand).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'command-1',
      leaseId: 'lease-1',
      outcome: 'accepted_http',
      response: { status: 'accepted_http' },
      signal: SIGNAL,
    }));
    expect(JSON.stringify(repository.finishCommand.mock.calls[0][0])).not.toContain('accepted: true');
    expect(summary).toMatchObject({ claimed: 1, acceptedHttp: 1, retried: 0, terminal: 0, finishFailed: 0 });
  });

  it('maps cancel to requestCancellation with only command payload fields', async () => {
    const row = makeRow({
      intent: 'cancel',
      payload: { reason: 'Cliente desistiu', cancellationCode: '501', ignored: 'do-not-forward' },
    });
    const repository = makeRepository([row]);
    const adapter = makeAdapter();
    const processor = createIfoodCommandProcessor({ repository, adapter, workerId: 'worker-1' });

    await processor.runCommandCycle({ signal: SIGNAL });

    expect(adapter.requestCancellation).toHaveBeenCalledWith({
      orderId: 'external-order-1',
      reason: 'Cliente desistiu',
      cancellationCode: '501',
      signal: SIGNAL,
    });
  });

  it('maps verify_delivery_code to adapter.verifyDeliveryCode with payload.code', async () => {
    const row = makeRow({
      intent: 'verify_delivery_code',
      payload: { code: '654321', ignored: 'nope' },
    });
    const repository = makeRepository([row]);
    const adapter = makeAdapter();
    const processor = createIfoodCommandProcessor({ repository, adapter, workerId: 'worker-1' });

    await processor.runCommandCycle({ signal: SIGNAL });

    expect(adapter.verifyDeliveryCode).toHaveBeenCalledWith('external-order-1', '654321', { signal: SIGNAL });
  });

  it('marks a retryable HTTP error failed_retryable with the retry-policy timestamp and no raw error text', async () => {
    const secret = 'provider-detail-fixture-not-forwarded';
    const repository = makeRepository([makeRow()]);
    const adapter = makeAdapter();
    adapter.confirm.mockRejectedValueOnce(Object.assign(new Error(secret), {
      code: 'IFOOD_HTTP_TIMEOUT',
      retryable: true,
      status: 504,
    }));
    const retryPolicy = { computeNextAttemptAt: vi.fn(() => '2026-09-16T12:05:00.000Z') };
    const logger = { error: vi.fn() };
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'worker-1',
      retryPolicy,
      logger,
    });

    const summary = await processor.runCommandCycle({ signal: SIGNAL });
    const finish = repository.finishCommand.mock.calls[0][0];

    expect(finish).toMatchObject({
      outcome: 'failed_retryable',
      errorCode: 'IFOOD_HTTP_TIMEOUT',
      nextAttemptAt: '2026-09-16T12:05:00.000Z',
    });
    expect(finish.errorMessage).not.toContain(secret);
    expect(JSON.stringify(finish)).not.toContain(secret);
    expect(retryPolicy.computeNextAttemptAt).toHaveBeenCalledWith({ attempts: 1 });
    expect(summary.retried).toBe(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret);
  });

  it('marks a non-retryable client error failed_terminal with a stable code', async () => {
    const repository = makeRepository([makeRow()]);
    const adapter = makeAdapter();
    adapter.confirm.mockRejectedValueOnce(Object.assign(new Error('provider-detail-fixture'), {
      code: 'IFOOD_HTTP_CLIENT',
      retryable: false,
      status: 400,
    }));
    const processor = createIfoodCommandProcessor({ repository, adapter, workerId: 'worker-1' });

    const summary = await processor.runCommandCycle({ signal: SIGNAL });

    expect(repository.finishCommand).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed_terminal',
      errorCode: 'IFOOD_HTTP_CLIENT',
    }));
    expect(summary.terminal).toBe(1);
  });

  it('does not abort the cycle when finishing one command loses its lease', async () => {
    const rows = [makeRow({ commandId: 'command-a' }), makeRow({ commandId: 'command-b' })];
    const repository = makeRepository(rows);
    repository.finishCommand
      .mockRejectedValueOnce(new Error('LEASE_LOST raw database text'))
      .mockResolvedValueOnce(undefined);
    const adapter = makeAdapter();
    const logger = { error: vi.fn() };
    const processor = createIfoodCommandProcessor({ repository, adapter, workerId: 'worker-1', logger });

    const result = await processor.runCommandCycle({ signal: SIGNAL });

    expect(result).toMatchObject({ claimed: 2, acceptedHttp: 1, finishFailed: 1 });
    expect(adapter.confirm).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('LEASE_LOST');
  });

  it('finishes an unhealthy merchant as retryable without calling the adapter', async () => {
    const row = makeRow();
    const repository = makeRepository([row]);
    const adapter = makeAdapter();
    const retryPolicy = { computeNextAttemptAt: vi.fn(() => '2026-09-16T12:06:00.000Z') };
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'worker-1',
      retryPolicy,
      isMerchantCommandAllowed: vi.fn(async () => false),
    });

    const summary = await processor.runCommandCycle({ signal: SIGNAL });

    expect(adapter.confirm).not.toHaveBeenCalled();
    expect(repository.finishCommand).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failed_retryable',
      errorCode: 'CONNECTION_UNHEALTHY',
      nextAttemptAt: '2026-09-16T12:06:00.000Z',
    }));
    expect(summary.unhealthy).toBe(1);
  });

  it('runs the expiry sweep through the repository seam with the ten-minute default', async () => {
    const repository = makeRepository();
    repository.expireAcceptedCommands.mockResolvedValueOnce(7);
    const processor = createIfoodCommandProcessor({
      repository,
      adapter: makeAdapter(),
      workerId: 'worker-1',
    });

    await expect(processor.runExpirySweep({ signal: SIGNAL })).resolves.toBe(7);
    expect(repository.expireAcceptedCommands).toHaveBeenCalledWith({
      olderThanSeconds: 600,
      signal: SIGNAL,
    });
  });

  it('accepts a configured expiry threshold and rejects unsafe ranges', () => {
    expect(() => createIfoodCommandProcessor({
      repository: makeRepository(), adapter: makeAdapter(), workerId: 'worker-1', expiryOlderThanSeconds: 59,
    })).toThrow();
    expect(() => createIfoodCommandProcessor({
      repository: makeRepository(), adapter: makeAdapter(), workerId: 'worker-1', expiryOlderThanSeconds: 86401,
    })).toThrow();
  });

  it('passes claim arguments and processes rows sequentially', async () => {
    const events = [];
    const rows = [makeRow({ commandId: 'a' }), makeRow({ commandId: 'b' })];
    const repository = makeRepository(rows);
    const adapter = makeAdapter();
    adapter.confirm.mockImplementation(async (orderId) => {
      events.push(`start:${orderId}`);
      await Promise.resolve();
      events.push(`end:${orderId}`);
      return { accepted: true };
    });
    const processor = createIfoodCommandProcessor({
      repository,
      adapter,
      workerId: 'worker-commands',
      limit: 4,
      leaseSeconds: 90,
    });

    await processor.runCommandCycle({ signal: SIGNAL });

    expect(repository.claimCommands).toHaveBeenCalledWith({
      workerId: 'worker-commands',
      limit: 4,
      leaseSeconds: 90,
      signal: SIGNAL,
    });
    expect(events).toEqual([
      'start:external-order-1', 'end:external-order-1',
      'start:external-order-1', 'end:external-order-1',
    ]);
  });
});
