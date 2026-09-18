// Bounded exponential backoff with jitter for a `failed_retryable` iFood
// inbox event, mirroring the idiom already used by
// `src/lib/server/ifood/http/request.js`'s `backoffDelayMs`: a doubling cap
// per attempt, capped at an overall ceiling, then a uniform random jitter
// inside `[0, cap]` via an injectable `random` so tests stay deterministic.
//
// Nothing here is contractually fixed by the iFood contract snapshot or by
// `finish_ifood_event_v1` (the applied migration only stores whatever
// `next_attempt_at` timestamp it is given). The defaults below are this
// module's own conservative choice for the inbox, not a value mirrored from
// elsewhere, and every default is overridable via options:
//   - base: 1 second (first retry after a `failed_retryable` outcome should
//     not hammer the DB/handler immediately, but should not make an operator
//     wait long either);
//   - cap: 10 minutes (an event stuck retrying for longer than that should
//     be visible to an operator well before then via `attempts`/`max_attempts`
//     eviction in `claim_ifood_events_v1`, which already dead-letters rows
//     whose `attempts >= max_attempts` before this policy is ever consulted
//     again for that row).
const DEFAULT_BASE_MS = 1_000;
const DEFAULT_CAP_MS = 10 * 60 * 1000;
// Stop doubling the exponent past this many attempts so `baseMs * 2 ** exponent`
// never overflows or produces a nonsensical magnitude before `Math.min` clamps
// it against `capMs` anyway; 20 attempts already dwarfs any realistic cap.
const MAX_BACKOFF_EXPONENT = 20;

function safeAttempts(attempts) {
  if (!Number.isFinite(attempts) || attempts <= 0) return 0;
  return Math.floor(attempts);
}

/**
 * Pure: returns a millisecond delay for the *next* attempt given how many
 * attempts have already happened. Deterministic for a fixed `random`
 * function (e.g. `() => 0.5` in tests), and bounded by `capMs` regardless of
 * how large `attempts` gets.
 *
 * @param {{ attempts?: number, random?: () => number, baseMs?: number, capMs?: number }} [options]
 * @returns {number} delay in milliseconds, `0 <= delay <= capMs`
 */
export function computeNextAttemptDelayMs({
  attempts = 0,
  random = Math.random,
  baseMs = DEFAULT_BASE_MS,
  capMs = DEFAULT_CAP_MS
} = {}) {
  const exponent = Math.min(safeAttempts(attempts), MAX_BACKOFF_EXPONENT);
  const cap = Math.min(capMs, baseMs * 2 ** exponent);
  const r = typeof random === 'function' ? random() : Math.random();
  const jitter = Number.isFinite(r) ? Math.min(Math.max(r, 0), 1) : 0;
  return Math.floor(jitter * cap);
}

/**
 * Pure: turns a computed delay into an absolute ISO-8601 timestamp using an
 * injected `clock`, the same idiom used across the iFood worker modules
 * (`workers/ifood/runtime.js`, `src/lib/server/ifood/http/request.js`) to
 * keep time deterministic in tests.
 *
 * @param {{ attempts?: number, clock?: () => number, random?: () => number, baseMs?: number, capMs?: number }} [options]
 * @returns {string} ISO-8601 timestamp
 */
export function computeNextAttemptAt({
  attempts = 0,
  clock = () => Date.now(),
  random = Math.random,
  baseMs,
  capMs
} = {}) {
  const delayMs = computeNextAttemptDelayMs({ attempts, random, baseMs, capMs });
  return new Date(clock() + delayMs).toISOString();
}

export default { computeNextAttemptDelayMs, computeNextAttemptAt };
