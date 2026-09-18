/**
 * Pure decision logic for silently applying a waiting service-worker update
 * at boot, without asking the person first (see UpdateAvailable.svelte).
 *
 * Every signal here — the offline queue, the active comanda, a pending PDV
 * draft, DOM focus, timers — is I/O collected by the caller. This module
 * only combines already-known booleans, so it has no I/O of its own and is
 * fully unit-testable.
 *
 * Convention: whenever a caller cannot determine a signal for certain (an
 * IndexedDB query failed, or the context needed to check a draft/queue is
 * unavailable), it must pass the "blocks the update" value (true) for that
 * signal. This module never treats "unknown" as "safe".
 */

const DEFAULT_BOOT_WINDOW_MS = 8000;

/**
 * Whether the app is still inside the short, pre-interaction boot grace
 * period during which a silent update may be applied. Closes the instant the
 * person interacts (pointerdown/keydown, whichever comes first) or after
 * `windowMs` elapses, whichever comes first.
 *
 * @param {number} bootStartedAt - Date.now() captured when the app booted.
 * @param {number} now - Date.now() at decision time.
 * @param {boolean} interacted - true once the person has touched/typed on
 *   the page since boot.
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function isWithinBootWindow(bootStartedAt, now, interacted, windowMs = DEFAULT_BOOT_WINDOW_MS) {
  if (interacted) return false;
  return Number.isFinite(bootStartedAt) && Number.isFinite(now) && now - bootStartedAt < windowMs;
}

/**
 * A stored PDV draft (`{ items, intent, submission }` — see
 * readDraft/saveDraft in $lib/offline/operations.js) represents unsaved work
 * whenever it has any item on the comanda, or a payment/submission in
 * flight. Anything else (empty items, no submission) is not pending work.
 *
 * @param {{ items?: unknown[], submission?: unknown }|null|undefined} draft
 * @returns {boolean}
 */
export function draftHasPendingWork(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const items = Array.isArray(draft.items) ? draft.items : [];
  return items.length > 0 || Boolean(draft.submission);
}

/**
 * Combines every boot-update signal into a single safe/unsafe verdict.
 *
 * @param {object} signals
 * @param {boolean} signals.online - navigator.onLine.
 * @param {boolean} signals.hasPendingQueue - an unsynced offline operation
 *   exists (or the queue could not be checked).
 * @param {boolean} signals.hasActiveComanda - sessionStorage 'zelo_comanda'
 *   has entries.
 * @param {boolean} signals.hasPendingDraft - a PDV draft has items or a
 *   pending submission (or the draft could not be checked).
 * @param {boolean} signals.inputFocused - an input/textarea/select/
 *   contenteditable currently has focus.
 * @param {boolean} signals.withinBootWindow - still inside the
 *   pre-interaction boot grace period (see isWithinBootWindow).
 * @param {boolean} signals.alreadyApplied - this version was already
 *   silently applied this session (loop guard).
 * @returns {{ safe: boolean, blockers: string[] }}
 */
export function evaluateBootUpdateSafety(signals) {
  const s = signals || {};
  const blockers = [];
  if (!s.online) blockers.push('offline');
  if (s.hasPendingQueue) blockers.push('pending-queue');
  if (s.hasActiveComanda) blockers.push('active-comanda');
  if (s.hasPendingDraft) blockers.push('pending-draft');
  if (s.inputFocused) blockers.push('input-focused');
  if (!s.withinBootWindow) blockers.push('boot-window-closed');
  if (s.alreadyApplied) blockers.push('already-applied');
  return { safe: blockers.length === 0, blockers };
}
