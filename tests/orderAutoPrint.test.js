import { describe, expect, it } from 'vitest';
import {
  AUTO_PRINT_DEDUPE_WINDOW_MS,
  createPrintedOrderStore,
  selectOrdersToAutoPrint,
} from '../src/lib/orderAutoPrint.js';

function order(id, overrides = {}) {
  return {
    id,
    canonical: true,
    status: 'pending_review',
    criado_em: '2026-07-27T12:00:00.000Z',
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

describe('order auto-print', () => {
  it('selects only new, recent canonical orders that still belong to the queue', () => {
    const now = Date.parse('2026-07-27T12:05:00.000Z');
    const fresh = [
      order('new'),
      order('already-known'),
      order('old', { criado_em: '2026-07-27T11:00:00.000Z' }),
      order('closed', { status: 'closed' }),
      order('legacy', { canonical: false }),
    ];

    expect(selectOrdersToAutoPrint(
      [order('already-known')],
      fresh,
      { now, maxAgeMs: 15 * 60 * 1000 },
    ).map((item) => item.id)).toEqual(['new']);
  });

  it('persists the dedupe reservation across page/controller reloads', () => {
    const storage = memoryStorage();
    const first = createPrintedOrderStore({ storage, now: () => 1_000 });

    expect(first.reserve('order-1')).toBe(true);
    const afterReload = createPrintedOrderStore({ storage, now: () => 2_000 });
    expect(afterReload.reserve('order-1')).toBe(false);
  });

  it('allows a failed print to release the reservation and retry', () => {
    const storage = memoryStorage();
    const store = createPrintedOrderStore({ storage, now: () => 1_000 });

    expect(store.reserve('order-1')).toBe(true);
    store.release('order-1');
    expect(store.reserve('order-1')).toBe(true);
    expect(AUTO_PRINT_DEDUPE_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
  });
});
