/**
 * The iFood protocol is kept at this seam. Consumers of the domain module use
 * the internal status names and never need to know the provider's short codes.
 */
export const IFOOD_EXTERNAL_STATUSES = Object.freeze([
  'PLACED',
  'CONFIRMED',
  'PREPARATION_STARTED',
  'READY_TO_PICKUP',
  'DISPATCHED',
  'CONCLUDED',
  'CANCELLED'
]);

export const IFOOD_INTERNAL_STATUSES = Object.freeze([
  'pending_review',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled'
]);

export const IFOOD_STATUS_TO_INTERNAL = Object.freeze({
  PLACED: 'pending_review',
  CONFIRMED: 'accepted',
  PREPARATION_STARTED: 'preparing',
  READY_TO_PICKUP: 'ready',
  DISPATCHED: 'out_for_delivery',
  CONCLUDED: 'delivered',
  CANCELLED: 'cancelled'
});

export const IFOOD_STATUS_RANK = Object.freeze({
  PLACED: 0,
  CONFIRMED: 1,
  PREPARATION_STARTED: 2,
  READY_TO_PICKUP: 3,
  DISPATCHED: 4,
  CONCLUDED: 5,
  CANCELLED: 5
});

export const IFOOD_TERMINAL_STATUSES = Object.freeze(new Set(['CONCLUDED', 'CANCELLED']));

// The short codes are present in Events v1 envelopes. Named variants are
// accepted as well because the public Order samples use both representations.
const EXTERNAL_STATUS_ALIASES = Object.freeze({
  PLC: 'PLACED',
  PLACED: 'PLACED',
  ORDER_PLACED: 'PLACED',
  CFM: 'CONFIRMED',
  CONF: 'CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  ORDER_CONFIRMED: 'CONFIRMED',
  PRS: 'PREPARATION_STARTED',
  PREPARATION_STARTED: 'PREPARATION_STARTED',
  ORDER_PREPARATION_STARTED: 'PREPARATION_STARTED',
  RTP: 'READY_TO_PICKUP',
  READY_TO_PICKUP: 'READY_TO_PICKUP',
  ORDER_READY_TO_PICKUP: 'READY_TO_PICKUP',
  DSP: 'DISPATCHED',
  DISPATCHED: 'DISPATCHED',
  ORDER_DISPATCHED: 'DISPATCHED',
  CON: 'CONCLUDED',
  CONCLUDED: 'CONCLUDED',
  ORDER_CONCLUDED: 'CONCLUDED',
  CAN: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  ORDER_CANCELLED: 'CANCELLED'
});

export const IFOOD_ORDER_CONTRACT_KEYS = Object.freeze([
  'externalOrderId',
  'merchantId',
  'externalStatus',
  'occurredAt',
  'customerSnapshot',
  'fulfillment',
  'payment',
  'totals',
  'items',
  'scheduled',
  'preparationStartAt',
  'pickupCode',
  'deliveryCode'
]);

const INTERNAL_TO_EXTERNAL = Object.freeze(Object.fromEntries(
  Object.entries(IFOOD_STATUS_TO_INTERNAL).map(([external, internal]) => [internal, external])
));

function statusToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return token || null;
}

export { statusToken };

// Observed live on the real test account (2026-09-16, see
// CONTRACT_SNAPSHOT.md's "Ciclo completo com pedidos de teste"):
// `confirm` produces both `CONFIRMED` and `DELIVERY_DROP_CODE_REQUESTED`,
// and `requestCancellation` produces both `CANCELLATION_REQUESTED` and
// `CANCELLED`. Neither of these two extra codes is in
// `IFOOD_EXTERNAL_STATUSES`/`EXTERNAL_STATUS_ALIASES`: they carry no
// commercial transition of their own and must never reach
// `decideEventTransition`/quarantine/dead-letter. Task 8's event handler
// checks this set first and short-circuits to a successfully processed,
// no-op event before any RPC call or order-detail fetch.
export const IFOOD_INFORMATIONAL_EVENT_CODES = Object.freeze(new Set([
  'DELIVERY_DROP_CODE_REQUESTED',
  'CANCELLATION_REQUESTED'
]));

/** True when any candidate field on `event` matches a known informational code. */
export function isIfoodInformationalEventCode(event) {
  return eventStatusCandidates(event).some((value) => {
    const token = statusToken(value);
    return Boolean(token && IFOOD_INFORMATIONAL_EVENT_CODES.has(token));
  });
}

/** Return a known external status, or null for a code not in this contract. */
export function normalizeIfoodExternalStatus(value) {
  const token = statusToken(value);
  return token ? EXTERNAL_STATUS_ALIASES[token] || null : null;
}

/** Convert an internal status back to the provider status when needed. */
export function normalizeIfoodStatus(value) {
  return normalizeIfoodExternalStatus(value) || INTERNAL_TO_EXTERNAL[statusToken(value)] || null;
}

/** Keep all candidates available so an unknown fullCode cannot hide a known code. */
export function eventStatusCandidates(event) {
  if (!event || typeof event !== 'object') return [];
  return [
    event.fullCode,
    event.externalStatus,
    event.status,
    event.metadata?.status,
    event.code
  ].filter((value) => typeof value === 'string' && value.trim());
}

export function readIfoodEventStatus(event) {
  const candidates = eventStatusCandidates(event);
  return candidates.map(normalizeIfoodExternalStatus).find(Boolean)
    || (candidates[0] ? statusToken(candidates[0]) : null);
}

export function readCurrentIfoodStatus(current) {
  if (typeof current === 'string') return normalizeIfoodStatus(current) || statusToken(current);
  if (!current || typeof current !== 'object') return null;
  return normalizeIfoodStatus(
    current.externalStatus
      ?? current.status
      ?? current.currentStatus
      ?? current.orderStatus
  ) || statusToken(
    current.externalStatus
      ?? current.status
      ?? current.currentStatus
      ?? current.orderStatus
  );
}

export function isKnownIfoodStatus(value) {
  return Boolean(normalizeIfoodExternalStatus(value));
}

// Friendly aliases keep the contract discoverable for future server modules.
export const EVENT_STATUS_TO_INTERNAL = IFOOD_STATUS_TO_INTERNAL;
export const EVENT_STATUS_RANK = IFOOD_STATUS_RANK;
export const ORDER_STATUS_RANK = IFOOD_STATUS_RANK;
export const STATUS_RANK = IFOOD_STATUS_RANK;
export const TERMINAL_STATUSES = IFOOD_TERMINAL_STATUSES;

export class IfoodOrderContractError extends TypeError {
  constructor(message, field = null) {
    super(`iFood order contract invalid${field ? ` (${field})` : ''}: ${message}`);
    this.name = 'IfoodOrderContractError';
    this.code = 'IFOOD_ORDER_CONTRACT_INVALID';
    this.field = field;
  }
}

function timestampValue(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readEventTimestamp(event) {
  if (!event || typeof event !== 'object') return null;
  return timestampValue(
    event.occurredAt
      ?? event.createdAt
      ?? event.timestamp
      ?? event.metadata?.occurredAt
      ?? event.metadata?.createdAt
  );
}

export function readCurrentEventTimestamp(current) {
  if (!current || typeof current !== 'object') return null;
  return timestampValue(
    current.occurredAt
      ?? current.eventOccurredAt
      ?? current.createdAt
      ?? current.updatedAt
      ?? current.timestamp
  );
}
