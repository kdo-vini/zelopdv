import {
  IFOOD_STATUS_RANK,
  IFOOD_STATUS_TO_INTERNAL,
  IFOOD_TERMINAL_STATUSES,
  normalizeIfoodExternalStatus,
  readCurrentIfoodStatus,
  readCurrentEventTimestamp,
  readEventTimestamp,
  readIfoodEventStatus
} from './contracts.js';

function result(decision, fields) {
  return {
    decision,
    // `action` is a deliberate vocabulary alias for command/event callers.
    // Both values always agree; the policy itself remains the only source of truth.
    action: decision,
    ...fields
  };
}

/**
 * Decide whether an external event may advance the canonical order.
 *
 * Normal statuses are monotonic by rank. Terminal events are explicit
 * exceptions: a cancellation can arrive after conclusion (and vice versa),
 * which is needed to represent a later reversal without silently rewriting
 * history. Unknown provider codes are durable quarantine candidates.
 */
export function decideEventTransition(current, event) {
  const rawExternalStatus = readIfoodEventStatus(event);
  const externalStatus = normalizeIfoodExternalStatus(rawExternalStatus);

  if (!externalStatus) {
    return result('quarantine', {
      reason: 'unknown_event',
      externalStatus: rawExternalStatus,
      internalStatus: null,
      rank: null,
      currentExternalStatus: readCurrentIfoodStatus(current)
    });
  }

  const internalStatus = IFOOD_STATUS_TO_INTERNAL[externalStatus];
  const rank = IFOOD_STATUS_RANK[externalStatus];
  const currentExternalStatus = readCurrentIfoodStatus(current);

  if (!currentExternalStatus) {
    return result('apply', {
      reason: 'new',
      externalStatus,
      internalStatus,
      rank,
      currentExternalStatus: null
    });
  }

  if (currentExternalStatus === externalStatus) {
    return result('ignore', {
      reason: 'duplicate',
      externalStatus,
      internalStatus,
      rank,
      currentExternalStatus
    });
  }

  if (IFOOD_TERMINAL_STATUSES.has(externalStatus)
      && IFOOD_TERMINAL_STATUSES.has(currentExternalStatus)) {
    const currentAt = readCurrentEventTimestamp(current);
    const eventAt = readEventTimestamp(event);
    if (currentAt === null || eventAt === null) {
      return result('quarantine', {
        reason: 'terminal_conflict_ambiguous',
        externalStatus,
        internalStatus,
        rank,
        currentExternalStatus
      });
    }
    if (eventAt <= currentAt) {
      return result('quarantine', {
        reason: 'terminal_conflict',
        externalStatus,
        internalStatus,
        rank,
        currentExternalStatus
      });
    }
    return result('apply', {
      reason: 'terminal_override',
      externalStatus,
      internalStatus,
      rank,
      currentExternalStatus
    });
  }

  const currentRank = IFOOD_STATUS_RANK[currentExternalStatus];
  if (currentRank === undefined) {
    return result('apply', {
      reason: 'advance_from_unknown',
      externalStatus,
      internalStatus,
      rank,
      currentExternalStatus
    });
  }

  if (rank <= currentRank) {
    return result('ignore', {
      reason: 'stale',
      externalStatus,
      internalStatus,
      rank,
      currentExternalStatus
    });
  }

  return result('apply', {
    reason: 'advance',
    externalStatus,
    internalStatus,
    rank,
    currentExternalStatus
  });
}

export default decideEventTransition;
