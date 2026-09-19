const SOUND_PATH = '/sounds/ifood-arrival.mp3';
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

function createdAtMs(order) {
  const raw = order?.criado_em || order?.created_at || order?.createdAt;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Orders that just appeared since the last queue snapshot (any channel).
 * First paint must pass an empty `previous` and ignore the result — the
 * baseline is "already on the board", not a new arrival.
 *
 * Skips terminal statuses and rows older than `maxAgeMs` so a lookback
 * refresh does not ding for yesterday's orders.
 */
export function findNewArrivalOrders(previous, next, { now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const previousIds = new Set((Array.isArray(previous) ? previous : []).map((order) => order?.id).filter(Boolean));
  const terminal = new Set(['delivered', 'cancelled', 'rejected', 'closed']);
  return (Array.isArray(next) ? next : []).filter((order) => {
    if (!order?.id || previousIds.has(order.id)) return false;
    if (terminal.has(order.status)) return false;
    const created = createdAtMs(order);
    if (created != null && now - created > maxAgeMs) return false;
    return true;
  });
}

/** @deprecated Use findNewArrivalOrders — kept for older imports/tests. */
export function findNewIfoodReviewOrders(previous, next, options) {
  return findNewArrivalOrders(previous, next, options);
}

function createArrivalAudio() {
  if (typeof window === 'undefined' || typeof Audio !== 'function') return null;
  const el = new Audio(SOUND_PATH);
  el.preload = 'auto';
  el.volume = 0.85;
  return el;
}

/**
 * Satisfies autoplay policy after a user gesture (pointerdown). Safe to call
 * more than once; failures are ignored.
 */
export async function unlockOrderArrivalSound() {
  const el = createArrivalAudio();
  if (!el) return;
  try {
    el.muted = true;
    await el.play();
    el.pause();
    el.currentTime = 0;
  } catch {
    // Still blocked — next arrival will try again after another gesture.
  } finally {
    el.muted = false;
  }
}

/** @deprecated Use unlockOrderArrivalSound. */
export const unlockIfoodArrivalSound = unlockOrderArrivalSound;

/** Doorbell MP3 for any new queue order. Never throws — autoplay block is a no-op. */
export function playOrderArrivalChime() {
  const el = createArrivalAudio();
  if (!el) return;
  try {
    el.currentTime = 0;
    void el.play().catch(() => {
      // Autoplay or missing asset — the visual queue still works.
    });
  } catch {
    // ignore
  }
}

/** @deprecated Use playOrderArrivalChime. */
export const playIfoodArrivalChime = playOrderArrivalChime;

export default {
  findNewArrivalOrders,
  findNewIfoodReviewOrders,
  playOrderArrivalChime,
  playIfoodArrivalChime,
  unlockOrderArrivalSound,
  unlockIfoodArrivalSound
};
