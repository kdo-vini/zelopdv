import { selectOrdersToAutoPrint } from '$lib/orderAutoPrint.js';
import { shouldPrintIfoodOrder } from '$lib/orders/ifoodPrinting.js';

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

export function createCanonicalOrderAutoPrintRuntime(dependencies) {
  let previousOrders = [];
  let baselineReady = false;
  let stopped = false;
  let refreshing = false;
  let unsubscribe = null;
  let reconciliationTimer = null;
  const retryIds = new Set();
  // Scheduled iFood orders that arrived before preparationStartAt. They stay
  // here without a print reservation until the prep window opens, so the
  // normal "already seen" baseline cannot permanently suppress them.
  const deferredIds = new Set();

  function currentNow() {
    return Number(dependencies.now?.() ?? Date.now());
  }

  function decide(order, now) {
    return shouldPrintIfoodOrder({
      order,
      printOwner: dependencies.resolvePrintOwner?.(order),
      resolvePrintOwner: dependencies.resolvePrintOwner,
      now
    });
  }

  function selectionOptions(now) {
    return {
      maxAgeMs: Number(dependencies.maxAgeMs ?? DEFAULT_MAX_AGE_MS),
      now,
      shouldEnqueue: (order) => {
        const decision = decide(order, now);
        // Defer is still "new" for selection so we can track it; skip removes
        // external/misconfigured iFood orders from the enqueue set entirely.
        return decision.action !== 'skip';
      }
    };
  }

  async function attemptPrint(candidate) {
    if (stopped || !dependencies.reserve(candidate.id)) return;
    try {
      await dependencies.print(candidate);
      retryIds.delete(candidate.id);
      deferredIds.delete(candidate.id);
    } catch (error) {
      const unknown = error?.code === 'PRINT_OUTCOME_UNKNOWN' || error?.retrySafe === false;
      if (!unknown) {
        dependencies.release(candidate.id);
        retryIds.add(candidate.id);
      } else {
        // Uncertain outcome: keep the reservation so realtime+poll overlap
        // cannot fire a second automatic copy.
        retryIds.delete(candidate.id);
        deferredIds.delete(candidate.id);
      }
      dependencies.onError?.(error, candidate);
    }
  }

  async function printCandidates(freshOrders) {
    const now = currentNow();
    const options = selectionOptions(now);
    const freshById = new Map((freshOrders || []).map((order) => [order.id, order]));

    const newOrders = selectOrdersToAutoPrint(previousOrders, freshOrders, options);
    const retries = selectOrdersToAutoPrint(
      [],
      freshOrders.filter((candidate) => retryIds.has(candidate.id)),
      options
    );

    const candidates = new Map();
    for (const order of [...newOrders, ...retries]) {
      candidates.set(order.id, order);
    }

    // Keep watching every live iFood order for schedule/owner policy. A
    // scheduled order may arrive hours before preparationStartAt and fall
    // outside the criado_em age window — it must still print once when ready.
    for (const order of freshOrders || []) {
      if (!order?.canonical) continue;
      if (['closed', 'delivered', 'rejected', 'cancelled'].includes(order.status)) {
        deferredIds.delete(order.id);
        continue;
      }
      const decision = decide(order, now);
      if (decision.reason === 'not_ifood') continue;
      if (decision.action === 'skip') {
        deferredIds.delete(order.id);
        continue;
      }
      if (decision.action === 'defer') {
        deferredIds.add(order.id);
        continue;
      }
      if (deferredIds.has(order.id)) {
        candidates.set(order.id, order);
      }
    }

    for (const deferredId of [...deferredIds]) {
      if (!freshById.has(deferredId)) deferredIds.delete(deferredId);
    }

    for (const candidate of candidates.values()) {
      if (stopped) return;
      const decision = decide(candidate, now);
      if (decision.action === 'skip') {
        deferredIds.delete(candidate.id);
        continue;
      }
      if (decision.action === 'defer') {
        deferredIds.add(candidate.id);
        continue;
      }
      await attemptPrint(candidate);
    }
  }

  async function refresh() {
    if (stopped || refreshing) return;
    refreshing = true;
    try {
      const freshOrders = await dependencies.loadOrders();
      if (baselineReady) await printCandidates(freshOrders);
      else baselineReady = true;
      previousOrders = freshOrders;
    } finally {
      refreshing = false;
    }
  }

  async function start() {
    stopped = false;
    await refresh();
    unsubscribe = dependencies.subscribe(() => refresh());
    reconciliationTimer = dependencies.scheduleInterval(refresh, 30000);
  }

  function stop() {
    stopped = true;
    unsubscribe?.();
    unsubscribe = null;
    if (reconciliationTimer != null) dependencies.clearScheduledInterval(reconciliationTimer);
    reconciliationTimer = null;
  }

  return { start, refresh, stop };
}
