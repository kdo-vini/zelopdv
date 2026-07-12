import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { clearSignalContext, openAssistantWithSignal, signalContext } from '../src/lib/stores/assistant.js';
import { markRead, unreadCount } from '../src/lib/stores/gerente.js';

function clientWithUpdate({ error = null } = {}) {
  const query = {
    in: vi.fn(() => query),
    is: vi.fn(async () => ({ error })),
  };
  return { from: vi.fn(() => ({ update: vi.fn(() => query) })) };
}

beforeEach(() => {
  unreadCount.set(0);
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
});
