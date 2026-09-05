import { describe, expect, it, vi } from 'vitest';
import { createCanonicalOrderAutoPrintRuntime } from '../src/lib/canonicalOrderAutoPrintRuntime.js';

const order = (id, source = 'zelomenu') => ({
  id, source, canonical: true, status: 'accepted', criado_em: new Date().toISOString(),
});

describe('canonical order automatic print runtime', () => {
  it('establishes a baseline, then prints new menu and mesa orders', async () => {
    let rows = [order('old')];
    let notify;
    const print = vi.fn().mockResolvedValue(undefined);
    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: vi.fn(async () => rows),
      subscribe: (callback) => { notify = callback; return () => {}; },
      print,
      reserve: vi.fn().mockReturnValue(true),
      release: vi.fn(),
      scheduleInterval: () => 1,
      clearScheduledInterval: vi.fn(),
    });
    await runtime.start();
    expect(print).not.toHaveBeenCalled();
    rows = [order('old'), order('menu-new'), order('mesa-new', 'mesa')];
    await notify();
    expect(print.mock.calls.map(([value]) => value.id)).toEqual(['menu-new', 'mesa-new']);
  });

  it('releases retry-safe failures but retains uncertain reservations', async () => {
    let rows = [];
    const release = vi.fn();
    const print = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { retrySafe: true }))
      .mockRejectedValueOnce(Object.assign(new Error('unknown'), { retrySafe: false, code: 'PRINT_OUTCOME_UNKNOWN' }));
    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: async () => rows,
      subscribe: () => () => {}, print,
      reserve: () => true, release,
      scheduleInterval: () => 1, clearScheduledInterval: vi.fn(),
    });
    await runtime.start();
    rows = [order('safe'), order('unknown')];
    await runtime.refresh();
    expect(release).toHaveBeenCalledWith('safe');
    expect(release).not.toHaveBeenCalledWith('unknown');
  });

  it('cleans the subscription and reconciliation timer', async () => {
    const unsubscribe = vi.fn();
    const clearScheduledInterval = vi.fn();
    const runtime = createCanonicalOrderAutoPrintRuntime({
      loadOrders: async () => [], subscribe: () => unsubscribe,
      print: vi.fn(), reserve: () => true, release: vi.fn(),
      scheduleInterval: () => 44, clearScheduledInterval,
    });
    await runtime.start();
    runtime.stop();
    expect(unsubscribe).toHaveBeenCalled();
    expect(clearScheduledInterval).toHaveBeenCalledWith(44);
  });
});
