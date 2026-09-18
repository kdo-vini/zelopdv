import {
  isIfoodInformationalEventCode,
  isKnownIfoodStatus,
  normalizeIfoodExternalStatus,
  readIfoodEventStatus
} from './contracts.js';
import { IfoodOrderContractError, normalizeIfoodOrder } from './orderNormalizer.js';
import { computeNextAttemptAt } from './retryPolicy.js';

// A `404` from `getOrder` shortly after `PLACED` is expected to be
// transient (CONTRACT_SNAPSHOT.md #6): the order has not yet propagated to
// the detail endpoint. This handler keeps retrying within a bounded window
// anchored on the *event's own* `occurredAt` (not on worker attempt count,
// which would drift with backoff jitter and processor restarts) so an
// order detail that never appears cannot retry forever — it becomes an
// administrative pending item instead.
const ORDER_DETAIL_RETRY_WINDOW_MS = 10 * 60 * 1000;

// When `occurredAt` is missing or unparsable (should not happen once Task 1
// through 7's envelope contract is respected, but the handler must fail
// closed rather than loop forever), fall back to a conservative attempt
// ceiling instead of a time window. Three attempts already gives the order
// detail endpoint multiple retry cycles' worth of time under the inbox's own
// bounded backoff (see `retryPolicy.js`) before this handler gives up.
const ORDER_DETAIL_RETRY_ATTEMPT_CEILING_WITHOUT_TIMESTAMP = 3;

function processed(extra = {}) {
  return { outcome: 'processed', ...extra };
}

function retryable(errorCode, nextAttemptAt = null) {
  return {
    outcome: 'retryable',
    errorCode,
    errorMessage: 'iFood order event could not be processed yet',
    nextAttemptAt
  };
}

function terminal(errorCode) {
  return {
    outcome: 'terminal',
    errorCode,
    errorMessage: 'iFood order event could not be processed'
  };
}

function quarantine(errorCode) {
  return {
    outcome: 'quarantine',
    errorCode,
    errorMessage: 'iFood order event was quarantined'
  };
}

/** Merge the row's own `eventType` with its raw payload so every contract
 * candidate field (`fullCode`, `externalStatus`, `status`, `code`,
 * `metadata.status`) is available to `contracts.js`'s helpers, regardless
 * of which one the real envelope happened to populate. */
function eventCandidateSource(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return { fullCode: row?.eventType ?? null, ...payload };
}

function operationError(name) {
  return new TypeError(`iFood event handler dependency missing: ${name}`);
}

function safeLog(logger, message) {
  const target = logger ?? globalThis.console;
  if (!target || typeof target.error !== 'function') return;
  try {
    target.error(message);
  } catch {
    // Correlation is best effort after the projection is committed.
  }
}

/**
 * Creates the Task 8 canonical-order projection handler consumed by
 * `inboxProcessor.js`'s `handler(row, context)` seam (Task 7). It never
 * calls `zelo_orders` directly: all mutation goes through the single
 * `repository.projectOrderEvent(...)` RPC-shaped seam, matching the same
 * deferred-real-implementation pattern used by `repository` in
 * `inboxProcessor.js` itself (a real Supabase-backed implementation is out
 * of scope for this task).
 *
 * Design decision (documented per the plan): the compare-and-set logic that
 * decides whether an event is a duplicate, stale, a terminal conflict, or a
 * genuine advance is **SQL-authoritative only** — it lives entirely inside
 * `project_ifood_order_event_v1`, which locks `ifood_internal.order_refs`
 * and recomputes the same monotonic rank table this module's sibling
 * `eventPolicy.js` uses. This handler does not call `decideEventTransition`
 * against a speculative "current state" read, because there is no cheap,
 * race-free way to read `order_refs` from here without either adding a new
 * repository round trip (another seam that could itself drift from the RPC)
 * or reimplementing the RPC's own locking in JS. Duplicating the same
 * 7-entry rank table in two languages was considered and rejected: the two
 * copies could silently diverge if a future status is ever added to one but
 * not the other, and the *only* correctness-critical use of the rank table
 * is inside the transaction that also writes the row — so it belongs there
 * alone. `eventPolicy.decideEventTransition` remains the source of truth
 * for the *domain module*'s own `receiveEvent` path (Task 2, untouched by
 * this task); this handler only reuses `contracts.js`'s status
 * normalization helpers (`isKnownIfoodStatus`, `normalizeIfoodExternalStatus`),
 * never the rank/transition function itself.
 *
 * @param {{
 *   integration: { getOrderDetail: (orderId: string, opts: { signal?: AbortSignal }) => Promise<object> },
 *   repository: IfoodProjectionRepository,
 *   retryPolicy?: { computeNextAttemptAt: (args: { attempts: number }) => string },
 *   clock?: () => number,
 *   logger?: { error: (message: string) => void } | null
 * }} deps
 *
 * @typedef {object} IfoodProjectionRepository
 * @property {(args: {
 *   merchantId: string,
 *   externalOrderId: string,
 *   eventId: string,
 *   externalStatus: string,
 *   occurredAt: string|null,
 *   order: object,
 *   signal?: AbortSignal
 * }) => Promise<{ outcome: 'applied'|'ignored_duplicate'|'ignored_stale'|'quarantined_terminal_conflict'|'unknown_merchant', zelo_order_id?: string, revision?: number }>} projectOrderEvent
 * @property {(args: { merchantId: string, externalOrderId: string, externalStatus: string, signal?: AbortSignal }) => Promise<unknown>} [confirmCommandsForEvent]
 * @property {(args: { merchantId: string, externalOrderId: string, eventId: string, items: object[], signal?: AbortSignal }) => Promise<unknown>} [commitStockForEvent]
 * @property {(args: { merchantId: string, externalOrderId: string, eventId: string, signal?: AbortSignal }) => Promise<unknown>} [releaseStockForEvent]
 * @property {(args: { merchantId: string, externalOrderId: string, signal?: AbortSignal }) => Promise<unknown>} [materializeSaleForEvent]
 * @property {(args: { merchantId: string, externalOrderId: string, eventId: string, signal?: AbortSignal }) => Promise<unknown>} [reverseSaleForEvent]
 */
export function createIfoodEventHandler({
  integration,
  repository,
  retryPolicy,
  clock = () => Date.now(),
  logger = null
} = {}) {
  if (!integration || typeof integration.getOrderDetail !== 'function') {
    throw operationError('integration.getOrderDetail');
  }
  if (!repository || typeof repository.projectOrderEvent !== 'function') {
    throw operationError('repository.projectOrderEvent');
  }

  const effectiveRetryPolicy = retryPolicy ?? {
    computeNextAttemptAt: ({ attempts }) => computeNextAttemptAt({ attempts, clock })
  };

  function detailRetryDecision(row) {
    const occurredAtMs = typeof row?.occurredAt === 'string' ? Date.parse(row.occurredAt) : NaN;
    if (Number.isFinite(occurredAtMs)) {
      const elapsedMs = clock() - occurredAtMs;
      return elapsedMs < ORDER_DETAIL_RETRY_WINDOW_MS;
    }
    // No usable timestamp: fail closed on a conservative attempt ceiling
    // instead of retrying forever.
    return (row?.attempts ?? 0) < ORDER_DETAIL_RETRY_ATTEMPT_CEILING_WITHOUT_TIMESTAMP;
  }

  async function handler(row, context = {}) {
    const candidate = eventCandidateSource(row);

    if (isIfoodInformationalEventCode(candidate)) {
      return processed();
    }

    const rawStatus = readIfoodEventStatus(candidate);
    if (!isKnownIfoodStatus(rawStatus)) {
      return quarantine('quarantine_unknown_event');
    }
    const externalStatus = normalizeIfoodExternalStatus(rawStatus);

    const externalOrderId = row?.externalOrderId ?? null;
    if (!externalOrderId) {
      return terminal('MISSING_EXTERNAL_ORDER_ID');
    }

    let detail;
    try {
      detail = await integration.getOrderDetail(externalOrderId, { signal: context.signal });
    } catch (error) {
      if (error?.code === 'IFOOD_HTTP_NOT_FOUND') {
        if (detailRetryDecision(row)) {
          const nextAttemptAt = effectiveRetryPolicy.computeNextAttemptAt({ attempts: row?.attempts ?? 0 });
          return retryable('ORDER_DETAIL_NOT_FOUND', nextAttemptAt);
        }
        return terminal('ORDER_DETAIL_NOT_FOUND_TIMEOUT');
      }
      if (error?.retryable) {
        return retryable('ORDER_DETAIL_FETCH_FAILED');
      }
      return terminal('ORDER_DETAIL_FETCH_ERROR');
    }

    let normalizedOrder;
    try {
      normalizedOrder = normalizeIfoodOrder(detail);
    } catch (error) {
      if (error instanceof IfoodOrderContractError) {
        return terminal('ORDER_CONTRACT_INVALID');
      }
      throw error;
    }

    // Defensive integrity check: the detail just fetched must describe the
    // exact order/merchant this inbox row is about. A mismatch here would
    // mean writing one order's data under another order's identity in
    // zelo_orders -- never trust the fetch result's own identity fields
    // without confirming they match what was asked for.
    if (normalizedOrder.externalOrderId !== externalOrderId
      || (row?.merchantId && normalizedOrder.merchantId !== row.merchantId)) {
      return terminal('ORDER_DETAIL_IDENTITY_MISMATCH');
    }

    let projection;
    try {
      projection = await repository.projectOrderEvent({
        merchantId: row.merchantId,
        externalOrderId,
        eventId: row.eventId,
        externalStatus,
        occurredAt: row.occurredAt ?? null,
        order: normalizedOrder,
        signal: context.signal
      });
    } catch {
      // Never forward the raw DB error text: it may carry payload/customer
      // data via a constraint message. Only a stable, generic code.
      return retryable('PROJECTION_RPC_ERROR');
    }

    switch (projection?.outcome) {
      case 'applied':
      case 'ignored_duplicate':
        if (typeof repository.confirmCommandsForEvent === 'function') {
          try {
            await repository.confirmCommandsForEvent({
              merchantId: row.merchantId,
              externalOrderId,
              externalStatus,
              signal: context.signal
            });
          } catch {
            // The projection already committed. Keep the event processed;
            // another matching event or reconciliation can retry correlation.
            safeLog(logger, 'iFood command correlation failed after projection');
          }
        }
        // Stock is event-driven (CONFIRMED/CANCELLED), never command-driven.
        // Failures after projection must not reopen the inbox — same rule as
        // command correlation. The ledger RPCs are idempotent.
        if (externalStatus === 'CONFIRMED'
          && typeof repository.commitStockForEvent === 'function') {
          try {
            await repository.commitStockForEvent({
              merchantId: row.merchantId,
              externalOrderId,
              eventId: row.eventId,
              items: Array.isArray(normalizedOrder.items) ? normalizedOrder.items : [],
              signal: context.signal
            });
          } catch {
            safeLog(logger, 'iFood stock commit failed after projection');
          }
        } else if (externalStatus === 'CANCELLED'
          && typeof repository.releaseStockForEvent === 'function') {
          try {
            await repository.releaseStockForEvent({
              merchantId: row.merchantId,
              externalOrderId,
              eventId: row.eventId,
              signal: context.signal
            });
          } catch {
            safeLog(logger, 'iFood stock release failed after projection');
          }
        }
        // Sale materialization/reversal follows the exact same best-effort
        // rule as stock above: a failure here must not reopen the inbox.
        // materialize is idempotent via vendas.client_sale_id; reverse is
        // idempotent via vendas_estornos.event_id and the one-applied-per-
        // sale unique index (see 20260917020813_ifood_sales_and_reversals.sql).
        if (externalStatus === 'CONCLUDED'
          && typeof repository.materializeSaleForEvent === 'function') {
          try {
            await repository.materializeSaleForEvent({
              merchantId: row.merchantId,
              externalOrderId,
              signal: context.signal
            });
          } catch {
            safeLog(logger, 'iFood sale materialization failed after projection');
          }
        } else if (externalStatus === 'CANCELLED'
          && typeof repository.reverseSaleForEvent === 'function') {
          try {
            await repository.reverseSaleForEvent({
              merchantId: row.merchantId,
              externalOrderId,
              eventId: row.eventId,
              signal: context.signal
            });
          } catch {
            safeLog(logger, 'iFood sale reversal failed after projection');
          }
        }
        return processed();
      case 'ignored_stale':
        return processed();
      case 'quarantined_terminal_conflict':
        return quarantine('quarantine_terminal_conflict');
      case 'unknown_merchant':
        return terminal('UNKNOWN_MERCHANT');
      default:
        return retryable('PROJECTION_INVALID_OUTCOME');
    }
  }

  return handler;
}

export default createIfoodEventHandler;
