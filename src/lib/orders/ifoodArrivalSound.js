import { isIfoodOrder } from './ifoodPresentation.js';

/**
 * iFood orders that just entered review since the last queue snapshot.
 * First paint must pass an empty `previous` and ignore the result — the
 * baseline is "already on the board", not a new arrival.
 */
export function findNewIfoodReviewOrders(previous, next) {
  const previousIds = new Set((Array.isArray(previous) ? previous : []).map((order) => order?.id).filter(Boolean));
  return (Array.isArray(next) ? next : []).filter((order) => (
    isIfoodOrder(order)
    && order?.status === 'pending_review'
    && order?.id
    && !previousIds.has(order.id)
  ));
}

function beep(context, { frequency, startAt, duration, gainValue }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

/** Two short tones. Never throws — autoplay block is a no-op. */
export function playIfoodArrivalChime() {
  if (typeof window === 'undefined') return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (typeof Ctor !== 'function') return;
  try {
    const context = new Ctor();
    const now = context.currentTime;
    beep(context, { frequency: 880, startAt: now, duration: 0.16, gainValue: 0.12 });
    beep(context, { frequency: 1174, startAt: now + 0.2, duration: 0.22, gainValue: 0.12 });
    window.setTimeout(() => {
      void context.close?.();
    }, 700);
  } catch {
    // Autoplay or missing Web Audio — the visual queue still works.
  }
}

export default { findNewIfoodReviewOrders, playIfoodArrivalChime };
