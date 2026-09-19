import { describe, expect, it, vi } from 'vitest';
import {
  findNewArrivalOrders,
  playOrderArrivalChime,
  unlockOrderArrivalSound
} from '../src/lib/orders/ifoodArrivalSound.js';

const now = Date.parse('2026-09-19T12:00:00.000Z');

describe('findNewArrivalOrders', () => {
  it('flags any new non-terminal order from any channel', () => {
    const previous = [{ id: 'a', source: 'ifood', status: 'pending_review', criado_em: '2026-09-19T11:55:00.000Z' }];
    const next = [
      { id: 'a', source: 'ifood', status: 'pending_review', criado_em: '2026-09-19T11:55:00.000Z' },
      { id: 'b', source: 'ifood', status: 'pending_review', criado_em: '2026-09-19T11:58:00.000Z' },
      { id: 'c', source: 'zelomenu', status: 'pending_review', criado_em: '2026-09-19T11:59:00.000Z' },
      { id: 'd', source: 'manual', status: 'accepted', criado_em: '2026-09-19T11:59:30.000Z' },
      { id: 'e', source: 'ifood', status: 'delivered', criado_em: '2026-09-19T11:59:00.000Z' },
    ];
    expect(findNewArrivalOrders(previous, next, { now }).map((order) => order.id)).toEqual(['b', 'c', 'd']);
  });

  it('ignores old rows that resurface on lookback refresh', () => {
    const next = [{ id: 'old', source: 'zelomenu', status: 'accepted', criado_em: '2026-09-18T12:00:00.000Z' }];
    expect(findNewArrivalOrders([], next, { now })).toHaveLength(0);
  });

  it('treats an empty previous list as all-new so the caller can skip first paint', () => {
    const next = [{ id: 'b', source: 'ifood', status: 'pending_review', criado_em: '2026-09-19T11:59:00.000Z' }];
    expect(findNewArrivalOrders([], next, { now })).toHaveLength(1);
  });
});

describe('playOrderArrivalChime', () => {
  it('plays the doorbell asset via HTMLAudioElement', () => {
    const play = vi.fn(() => Promise.resolve());
    const audio = { play, pause: vi.fn(), currentTime: 0, muted: false, preload: '', volume: 1 };
    vi.stubGlobal('Audio', vi.fn(() => audio));
    vi.stubGlobal('window', globalThis);

    playOrderArrivalChime();

    expect(Audio).toHaveBeenCalledWith('/sounds/ifood-arrival.mp3');
    expect(play).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('unlocks autoplay with a muted probe', async () => {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    const audio = { play, pause, currentTime: 1, muted: false, preload: '', volume: 1 };
    vi.stubGlobal('Audio', vi.fn(() => audio));
    vi.stubGlobal('window', globalThis);

    await unlockOrderArrivalSound();

    expect(play).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
    expect(audio.muted).toBe(false);
    vi.unstubAllGlobals();
  });
});
