import { computeNextAttemptAt } from './retryPolicy.js';

// The vocabulary a `handler` may return. These are deliberately the exact
// same four strings `finish_ifood_event_v1` (applied migration
// `supabase/migrations/20260916160223_ifood_mvp_foundation.sql`) accepts
// among its seven valid `p_outcome` values (`processed`, `retryable`,
// `failed_retryable`, `terminal`, `failed_terminal`, `quarantine`,
// `dead_letter`) — so a valid handler outcome is passed through to
// `finishEvent` unchanged, never remapped to a different literal. The RPC's
// own `case` statement collapses `terminal`, `failed_terminal`,
// `quarantine`, and `dead_letter` down to the same inbox `status =
// 'dead_letter'` row; that collapse happens inside the unmodifiable
// migration, not here. This processor's only job is to let a handler
// explain *why* an event was dead-lettered via `errorCode`/`errorMessage`
// (e.g. `'quarantine_unknown_event'` vs `'terminal_error'`), even though the
// stored `status` column ends up identical either way. Do not "fix" this by
// touching the migration — it is applied in production.
const VALID_HANDLER_OUTCOMES = new Set(['processed', 'retryable', 'terminal', 'quarantine']);

function emptySummary() {
  return { claimed: 0, processed: 0, retried: 0, deadLettered: 0, finishFailed: 0 };
}

function safeLog(logger, message) {
  if (!logger || typeof logger.error !== 'function') return;
  try {
    logger.error(message);
  } catch {
    // Logging is best effort; it must never break the cycle.
  }
}

/**
 * Runs the iFood event inbox: claim a batch, hand each row to `handler` one
 * at a time (never concurrently), and always finish the row with whatever
 * outcome resulted — even when the handler throws or returns nonsense.
 *
 * `repository` is a two-method seam matching `claim_ifood_events_v1` /
 * `finish_ifood_event_v1`'s shapes exactly (a real Supabase-backed
 * implementation is out of scope for this task):
 *
 * @typedef {object} IfoodInboxRow
 * @property {string} inboxId
 * @property {string} eventId
 * @property {string} connectionId
 * @property {string} empresaId
 * @property {string} merchantId
 * @property {string|null} externalOrderId
 * @property {string} eventType
 * @property {number} externalRevision
 * @property {string|null} occurredAt
 * @property {object} payload
 * @property {number} attempts
 * @property {string} leaseId
 * @property {string} leaseUntil
 * @property {string} status
 *
 * @typedef {object} IfoodInboxRepository
 * @property {(args: { workerId: string, limit: number, leaseSeconds: number, signal?: AbortSignal }) => Promise<IfoodInboxRow[]>} claimEvents
 * @property {(args: { inboxId: string, leaseId: string, outcome: string, errorCode?: string|null, errorMessage?: string|null, nextAttemptAt?: string|null, signal?: AbortSignal }) => Promise<void>} finishEvent
 *
 * `handler(row, context)` is an injected async function (the eventual
 * Task 8 canonical-order projector). It must resolve to
 * `{ outcome: 'processed' | 'retryable' | 'terminal' | 'quarantine', errorCode?, errorMessage?, nextAttemptAt? }`.
 * A thrown error, or a resolved value with an outcome outside that set, is
 * treated as `retryable` with a generic, stable `errorCode` — the raw
 * thrown message is never forwarded to `finishEvent` or to `logger`, since
 * it could carry payload/PII.
 *
 * @param {{
 *   repository: IfoodInboxRepository,
 *   handler: (row: IfoodInboxRow, context: { attempt: number }) => Promise<{ outcome: string, errorCode?: string, errorMessage?: string, nextAttemptAt?: string }>,
 *   workerId: string,
 *   limit?: number,
 *   leaseSeconds?: number,
 *   retryPolicy?: { computeNextAttemptAt: (args: { attempts: number }) => string },
 *   clock?: () => number,
 *   random?: () => number,
 *   logger?: { error: (message: string) => void } | null
 * }} options
 */
export function createIfoodInboxProcessor({
  repository,
  handler,
  workerId,
  limit = 10,
  leaseSeconds = 120,
  retryPolicy,
  clock = () => Date.now(),
  random = Math.random,
  logger = null
} = {}) {
  if (!repository || typeof repository.claimEvents !== 'function' || typeof repository.finishEvent !== 'function') {
    throw new TypeError('createIfoodInboxProcessor requires a repository with claimEvents() and finishEvent()');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('createIfoodInboxProcessor requires a handler function');
  }

  const effectiveRetryPolicy = retryPolicy ?? {
    computeNextAttemptAt: ({ attempts }) => computeNextAttemptAt({ attempts, clock, random })
  };

  async function invokeHandler(row) {
    try {
      const result = await handler(row, { attempt: row.attempts });
      if (result && VALID_HANDLER_OUTCOMES.has(result.outcome)) {
        return {
          outcome: result.outcome,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          nextAttemptAt: result.nextAttemptAt ?? null
        };
      }
      return {
        outcome: 'retryable',
        errorCode: 'HANDLER_INVALID_OUTCOME',
        errorMessage: 'iFood inbox handler returned an unrecognized outcome',
        nextAttemptAt: null
      };
    } catch {
      // Never forward the thrown error's own message: it may contain
      // payload, merchant, or customer data. Only a stable, generic code.
      return {
        outcome: 'retryable',
        errorCode: 'HANDLER_ERROR',
        errorMessage: 'iFood inbox handler failed',
        nextAttemptAt: null
      };
    }
  }

  async function processRow(row, signal) {
    const resolved = await invokeHandler(row);
    let nextAttemptAt = resolved.nextAttemptAt;
    if (resolved.outcome === 'retryable' && !nextAttemptAt) {
      nextAttemptAt = effectiveRetryPolicy.computeNextAttemptAt({ attempts: row.attempts });
    }

    try {
      await repository.finishEvent({
        inboxId: row.inboxId,
        leaseId: row.leaseId,
        outcome: resolved.outcome,
        errorCode: resolved.errorCode,
        errorMessage: resolved.errorMessage,
        nextAttemptAt: nextAttemptAt ?? null,
        signal
      });
      return { outcome: resolved.outcome, finishFailed: false };
    } catch {
      // A lost lease (another worker reclaimed an expired lease) or any
      // other transient DB error must never abort the whole cycle. Only a
      // generic, stable log line — never the raw error text.
      safeLog(logger, 'iFood inbox finishEvent failed for a claimed row');
      return { outcome: resolved.outcome, finishFailed: true };
    }
  }

  async function runInboxCycle({ signal } = {}) {
    const summary = emptySummary();
    if (signal?.aborted) return summary;

    let rows;
    try {
      rows = await repository.claimEvents({ workerId, limit, leaseSeconds, signal });
    } catch {
      safeLog(logger, 'iFood inbox claimEvents failed');
      return summary;
    }

    const claimedRows = Array.isArray(rows) ? rows : [];
    summary.claimed = claimedRows.length;

    // Sequential, in claim order: a single claim batch is already ordered
    // by `next_attempt_at, received_at, id`, so processing one row at a
    // time here preserves relative order for events of the same external
    // order within this cycle ("preserva ordem por pedido externo").
    for (const row of claimedRows) {
      const { outcome, finishFailed } = await processRow(row, signal);
      if (finishFailed) {
        summary.finishFailed += 1;
        continue;
      }
      if (outcome === 'processed') summary.processed += 1;
      else if (outcome === 'retryable') summary.retried += 1;
      else summary.deadLettered += 1; // 'terminal' or 'quarantine' -> DB dead_letter
    }

    return summary;
  }

  return { runInboxCycle };
}

export default createIfoodInboxProcessor;
