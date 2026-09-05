const PRINTED_ORDER_IDS_KEY = 'zelopdv_auto_printed_order_ids_v1';

export const AUTO_PRINT_DEDUPE_WINDOW_MS = 48 * 60 * 60 * 1000;

const TERMINAL_ORDER_STATUSES = new Set([
  'closed',
  'delivered',
  'rejected',
  'cancelled',
]);

/**
 * Given the previously-known queue and a freshly fetched queue, returns the
 * recent canonical orders that were not present before. The initial snapshot
 * is intentionally not printed: reconciliation is a safety net for orders
 * that arrive after the page has established its baseline.
 */
export function selectOrdersToAutoPrint(previousOrders, freshOrders, options) {
  const previousIds = new Set((previousOrders || []).map((order) => order.id));
  const now = Number(options?.now ?? Date.now());
  const maxAgeMs = Number(options?.maxAgeMs ?? 15 * 60 * 1000);

  return (freshOrders || []).filter((order) => {
    if (!order?.canonical || previousIds.has(order.id)) return false;
    if (TERMINAL_ORDER_STATUSES.has(order.status)) return false;

    const createdAtMs = Date.parse(order.criado_em || order.createdAt || '');
    if (Number.isNaN(createdAtMs)) return false;
    return now - createdAtMs <= maxAgeMs;
  });
}

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readPrintedIds(storage) {
  if (!storage) return new Map();
  try {
    const parsed = JSON.parse(storage.getItem(PRINTED_ORDER_IDS_KEY) || 'null');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter((entry) => (
      Array.isArray(entry)
      && typeof entry[0] === 'string'
      && Number.isFinite(entry[1])
    )));
  } catch {
    return new Map();
  }
}

function writePrintedIds(storage, printedIds) {
  if (!storage) return;
  try {
    storage.setItem(PRINTED_ORDER_IDS_KEY, JSON.stringify([...printedIds.entries()]));
  } catch {
    // localStorage can be unavailable/full; printing still proceeds in memory.
  }
}

/**
 * Small persistent reservation store used by the automatic printer. A job is
 * reserved before the async print call and released when that call fails, so
 * polling/realtime overlap cannot duplicate a successful print and failures
 * remain retryable.
 */
export function createPrintedOrderStore({ storage = browserStorage(), now = () => Date.now() } = {}) {
  const printedIds = readPrintedIds(storage);

  function prune(currentTime) {
    for (const [orderId, timestamp] of printedIds) {
      if (currentTime - timestamp > AUTO_PRINT_DEDUPE_WINDOW_MS) printedIds.delete(orderId);
    }
    writePrintedIds(storage, printedIds);
  }

  return {
    reserve(orderId) {
      if (!orderId) return false;
      const currentTime = Number(now());
      for (const [storedId, timestamp] of readPrintedIds(storage)) {
        const currentStored = printedIds.get(storedId);
        if (currentStored === undefined || timestamp > currentStored) printedIds.set(storedId, timestamp);
      }
      prune(currentTime);
      const previousTime = printedIds.get(orderId);
      if (previousTime !== undefined && currentTime - previousTime < AUTO_PRINT_DEDUPE_WINDOW_MS) {
        return false;
      }
      printedIds.set(orderId, currentTime);
      writePrintedIds(storage, printedIds);
      return true;
    },

    release(orderId) {
      if (!orderId) return;
      printedIds.delete(orderId);
      writePrintedIds(storage, printedIds);
    },
  };
}

export { PRINTED_ORDER_IDS_KEY };
