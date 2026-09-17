import { describe, expect, it, vi } from 'vitest';
import {
  isIfoodAutoPrintEligible,
  normalizePrintOwner,
  shouldPrintIfoodOrder
} from '../src/lib/orders/ifoodPrinting.js';
import { createCanonicalOrderAutoPrintRuntime } from '../src/lib/canonicalOrderAutoPrintRuntime.js';
import { selectOrdersToAutoPrint } from '../src/lib/orderAutoPrint.js';

function ifoodOrder(overrides = {}) {
  return {
    id: 'order-ifood-1',
    source: 'ifood',
    canonical: true,
    status: 'accepted',
    criado_em: '2026-09-17T12:00:00.000Z',
    ifood: {
      scheduled: false,
      preparationStartAt: null,
      displayId: '1234',
      ...overrides.ifood
    },
    ...overrides
  };
}

describe('normalizePrintOwner', () => {
  it('accepts zelo/external and rejects everything else', () => {
    expect(normalizePrintOwner('zelo')).toBe('zelo');
    expect(normalizePrintOwner('EXTERNAL')).toBe('external');
    expect(normalizePrintOwner('both')).toBe(null);
    expect(normalizePrintOwner(null)).toBe(null);
    expect(normalizePrintOwner(undefined)).toBe(null);
  });
});

describe('shouldPrintIfoodOrder', () => {
  const now = Date.parse('2026-09-17T12:30:00.000Z');

  it('lets non-iFood orders through the legacy path', () => {
    expect(shouldPrintIfoodOrder({
      order: { id: 'm1', source: 'zelomenu' },
      printOwner: 'external',
      now
    })).toEqual({ action: 'print', shouldPrint: true, reason: 'not_ifood' });
  });

  it('prints immediate iFood orders when print_owner is zelo', () => {
    expect(shouldPrintIfoodOrder({
      order: ifoodOrder(),
      printOwner: 'zelo',
      now
    })).toEqual({ action: 'print', shouldPrint: true, reason: 'ready' });
  });

  it('skips when the connection chose an external printer', () => {
    expect(shouldPrintIfoodOrder({
      order: ifoodOrder(),
      printOwner: 'external',
      now
    })).toEqual({ action: 'skip', shouldPrint: false, reason: 'print_owner_external' });
  });

  it('skips when the connection has no print configuration', () => {
    expect(shouldPrintIfoodOrder({
      order: ifoodOrder(),
      printOwner: null,
      now
    })).toEqual({ action: 'skip', shouldPrint: false, reason: 'print_owner_missing' });

    expect(shouldPrintIfoodOrder({
      order: ifoodOrder(),
      printOwner: 'weird',
      now
    })).toEqual({ action: 'skip', shouldPrint: false, reason: 'print_owner_invalid' });
  });

  it('defers scheduled orders before preparationStartAt and prints after', () => {
    const scheduled = ifoodOrder({
      ifood: {
        scheduled: true,
        preparationStartAt: '2026-09-17T13:00:00.000Z'
      }
    });

    expect(shouldPrintIfoodOrder({
      order: scheduled,
      printOwner: 'zelo',
      now: Date.parse('2026-09-17T12:30:00.000Z')
    })).toEqual({ action: 'defer', shouldPrint: false, reason: 'scheduled_before_prep' });

    expect(shouldPrintIfoodOrder({
      order: scheduled,
      printOwner: 'zelo',
      now: Date.parse('2026-09-17T13:00:00.000Z')
    })).toEqual({ action: 'print', shouldPrint: true, reason: 'ready' });
  });

  it('treats scheduled orders without preparationStartAt as ready (same as kitchen)', () => {
    expect(isIfoodAutoPrintEligible(
      ifoodOrder({ ifood: { scheduled: true, preparationStartAt: null } }),
      { printOwner: 'zelo' }
    )).toBe(true);
  });
});

describe('auto-print selection with iFood policy', () => {
  it('filters external iFood orders out of the enqueue set', () => {
    const now = Date.parse('2026-09-17T12:05:00.000Z');
    const fresh = [
      ifoodOrder({ id: 'zelo-owned', criado_em: '2026-09-17T12:00:00.000Z' }),
      ifoodOrder({ id: 'external-owned', criado_em: '2026-09-17T12:01:00.000Z' }),
      {
        id: 'menu',
        source: 'zelomenu',
        canonical: true,
        status: 'accepted',
        criado_em: '2026-09-17T12:02:00.000Z'
      }
    ];

    const selected = selectOrdersToAutoPrint([], fresh, {
      now,
      maxAgeMs: 15 * 60 * 1000,
      shouldEnqueue: (order) => shouldPrintIfoodOrder({
        order,
        printOwner: order.id === 'external-owned' ? 'external' : 'zelo',
        now
      }).action !== 'skip'
    });

    expect(selected.map((order) => order.id)).toEqual(['zelo-owned', 'menu']);
  });
});

describe('canonical runtime iFood print coordination', () => {
  it('defers scheduled iFood prints until preparationStartAt, then prints once', async () => {
    const print = vi.fn().mockResolvedValue(undefined);
    const reserve = vi.fn().mockReturnValue(true);
    const release = vi.fn();
    let now = Date.parse('2026-09-17T12:00:00.000Z');
    const scheduled = ifoodOrder({
      id: 'scheduled-1',
      criado_em: '2026-09-17T11:55:00.000Z',
      ifood: {
        scheduled: true,
        preparationStartAt: '2026-09-17T12:10:00.000Z'
      }
    });
    let rows = [];

    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: async () => rows,
      subscribe: () => () => {},
      print,
      reserve,
      release,
      now: () => now,
      resolvePrintOwner: () => 'zelo',
      scheduleInterval: () => 1,
      clearScheduledInterval: vi.fn()
    });

    await runtime.start();
    rows = [scheduled];
    await runtime.refresh();
    expect(print).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();

    now = Date.parse('2026-09-17T12:10:00.000Z');
    await runtime.refresh();
    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0][0].id).toBe('scheduled-1');
    expect(reserve).toHaveBeenCalledWith('scheduled-1');

    await runtime.refresh();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('does not print or reserve when print_owner is external', async () => {
    const print = vi.fn();
    const reserve = vi.fn().mockReturnValue(true);
    let rows = [];
    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: async () => rows,
      subscribe: () => () => {},
      print,
      reserve,
      release: vi.fn(),
      resolvePrintOwner: () => 'external',
      scheduleInterval: () => 1,
      clearScheduledInterval: vi.fn()
    });

    await runtime.start();
    rows = [ifoodOrder({ id: 'ext-1', criado_em: new Date().toISOString() })];
    await runtime.refresh();
    expect(print).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it('keeps PRINT_OUTCOME_UNKNOWN reservations so concurrent poll/realtime cannot reprint', async () => {
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
    rows = [ifoodOrder({ id: 'unknown-1', criado_em: new Date().toISOString() })];
    await runtime.refresh();
    expect(release).not.toHaveBeenCalledWith('unknown-1');
  });
});
