import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { clearSignalContext, openAssistantWithSignal, signalContext } from '../src/lib/stores/assistant.js';
import { hasUnreadCritical, markRead, unreadCount } from '../src/lib/stores/gerente.js';

function clientWithUpdate({ error = null, remainingCritical = 0 } = {}) {
  const updateQuery = {
    in: vi.fn(() => updateQuery),
    is: vi.fn(async () => ({ error })),
  };
  const selectQuery = {
    is: vi.fn(() => selectQuery),
    eq: vi.fn(() => selectQuery),
    not: vi.fn(() => selectQuery),
    then: (resolve) => resolve({ count: remainingCritical, error: null }),
  };
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => updateQuery),
      select: vi.fn(() => selectQuery),
    })),
  };
}

beforeEach(() => {
  unreadCount.set(0);
  hasUnreadCritical.set(false);
  clearSignalContext();
});

describe('gerente stores', () => {
  it('opens the assistant with the selected signal context', () => {
    expect(openAssistantWithSignal({ id: 'signal-1', type: 'STOCK_ZERO_WITH_DEMAND' })).toBe(true);
    expect(get(signalContext)).toMatchObject({ id: 'signal-1' });

    clearSignalContext();
    expect(get(signalContext)).toBeNull();
    expect(openAssistantWithSignal({})).toBe(false);
  });

  it('decrements unread count optimistically and restores it when the update fails', async () => {
    unreadCount.set(3);
    await expect(markRead(['a', 'a', 'b'], clientWithUpdate())).resolves.toBeUndefined();
    expect(get(unreadCount)).toBe(1);

    unreadCount.set(3);
    await expect(markRead(['a'], clientWithUpdate({ error: new Error('denied') }))).rejects.toThrow('denied');
    expect(get(unreadCount)).toBe(3);
  });

  it('turns off hasUnreadCritical once no other unread critical signal remains', async () => {
    unreadCount.set(2);
    hasUnreadCritical.set(true);

    await markRead(['crit-1'], clientWithUpdate({ remainingCritical: 0 }), { signalType: 'CASH_DIFFERENCE_RECURRING', severity: 'critical', mutedTypes: [] });

    expect(get(unreadCount)).toBe(1);
    expect(get(hasUnreadCritical)).toBe(false);
  });

  it('keeps hasUnreadCritical on while another unread critical signal remains', async () => {
    unreadCount.set(2);
    hasUnreadCritical.set(true);

    await markRead(['crit-1'], clientWithUpdate({ remainingCritical: 1 }), { signalType: 'CASH_DIFFERENCE_RECURRING', severity: 'critical', mutedTypes: [] });

    expect(get(hasUnreadCritical)).toBe(true);
  });

  it('does not decrement unreadCount for a signal whose type is muted (never counted in the badge)', async () => {
    unreadCount.set(5);

    await markRead(['muted-1'], clientWithUpdate(), { signalType: 'REVENUE_ABOVE_WEEKDAY_AVG', severity: 'info', mutedTypes: ['REVENUE_ABOVE_WEEKDAY_AVG'] });

    expect(get(unreadCount)).toBe(5);
  });
});
