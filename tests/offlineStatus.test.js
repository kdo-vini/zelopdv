import { describe, it, expect } from 'vitest';
import { createConnectionNotice, offlineStatusLabel, blocksOfflineUpdate } from '../src/lib/stores/offlineStatus.js';
describe('offline connectivity presentation', () => {
  it('notifies once per loss episode and throttles flapping for two minutes', () => {
    const notify = createConnectionNotice();
    expect(notify('offline', 100)).toBe(true);
    expect(notify('degraded', 200)).toBe(false);
    expect(notify('online', 300)).toBe(false);
    expect(notify('offline', 400)).toBe(false);
    notify('online', 120100);
    expect(notify('offline', 120101)).toBe(true);
  });
  it('never claims a failed write was saved or an unprepared device can sell', () => {
    expect(offlineStatusLabel({ storageError: 'quota', pendingCount: 4 })).toContain('ainda não foi registrada');
    expect(offlineStatusLabel({ connection: 'offline', prepared: false })).toContain('verificando preparação');
  });
  it('blocks version activation during unresolved durable work and network loss', () => {
    const safe = { connection: 'online', pendingCount: 0, reviewCount: 0 };
    expect(blocksOfflineUpdate(safe)).toBe(false);
    for (const patch of [{ pendingCount: 1 }, { reviewCount: 1 }, { committing: true }, { syncing: true }, { storageError: 'quota' }, { connection: 'degraded' }]) {
      expect(blocksOfflineUpdate({ ...safe, ...patch })).toBe(true);
    }
  });
});
