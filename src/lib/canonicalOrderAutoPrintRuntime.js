import { selectOrdersToAutoPrint } from '$lib/orderAutoPrint.js';

export function createCanonicalOrderAutoPrintRuntime(dependencies) {
  let previousOrders = [];
  let baselineReady = false;
  let stopped = false;
  let refreshing = false;
  let unsubscribe = null;
  let reconciliationTimer = null;
  const retryIds = new Set();

  async function printCandidates(freshOrders) {
    const options = { maxAgeMs: 15 * 60 * 1000, now: Date.now() };
    const newOrders = selectOrdersToAutoPrint(previousOrders, freshOrders, options);
    const retries = selectOrdersToAutoPrint(
      [], freshOrders.filter((candidate) => retryIds.has(candidate.id)), options,
    );
    const candidates = new Map([...newOrders, ...retries].map((candidate) => [candidate.id, candidate]));

    for (const candidate of candidates.values()) {
      if (stopped || !dependencies.reserve(candidate.id)) continue;
      try {
        await dependencies.print(candidate);
        retryIds.delete(candidate.id);
      } catch (error) {
        const unknown = error?.code === 'PRINT_OUTCOME_UNKNOWN' || error?.retrySafe === false;
        if (!unknown) {
          dependencies.release(candidate.id);
          retryIds.add(candidate.id);
        } else {
          retryIds.delete(candidate.id);
        }
        dependencies.onError?.(error, candidate);
      }
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
