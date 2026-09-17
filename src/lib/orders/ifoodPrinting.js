// Pure print-ownership and schedule policy for iFood orders.
//
// Auto-print must never run for an external print owner, and scheduled
// orders wait until preparationStartAt. Non-iFood orders are out of scope:
// callers keep the legacy auto-print path. PRINT_OUTCOME_UNKNOWN handling
// stays in the runtime (no auto-retry) — this module only decides eligibility.

import { isIfoodOrder, ifoodScheduleState } from './ifoodPresentation.js';

export const IFOOD_PRINT_OWNERS = Object.freeze(['zelo', 'external']);

/**
 * @param {unknown} value
 * @returns {'zelo' | 'external' | null}
 */
export function normalizePrintOwner(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'zelo' || normalized === 'external') return normalized;
  return null;
}

/**
 * Resolve the print owner for an order from injected context or order fields.
 * Prefer an explicit map/function from the connection row; fall back to
 * sanitized fields already on the queue view model when present.
 *
 * @param {object|null|undefined} order
 * @param {{
 *   printOwner?: unknown,
 *   resolvePrintOwner?: (order: object) => unknown
 * }} [context]
 * @returns {'zelo' | 'external' | null}
 */
export function resolveIfoodPrintOwner(order, context = {}) {
  if (typeof context.resolvePrintOwner === 'function' && order) {
    const resolved = normalizePrintOwner(context.resolvePrintOwner(order));
    if (resolved) return resolved;
  }
  if (context.printOwner !== undefined) {
    return normalizePrintOwner(context.printOwner);
  }
  const ifood = order?.ifood && typeof order.ifood === 'object' ? order.ifood : {};
  return normalizePrintOwner(
    ifood.printOwner
    ?? ifood.print_owner
    ?? order?.printOwner
    ?? order?.print_owner
  );
}

/**
 * Decide whether an automatic kitchen print should run for this order.
 *
 * @returns {{
 *   action: 'print' | 'skip' | 'defer',
 *   shouldPrint: boolean,
 *   reason:
 *     | 'not_ifood'
 *     | 'print_owner_external'
 *     | 'print_owner_missing'
 *     | 'print_owner_invalid'
 *     | 'scheduled_before_prep'
 *     | 'ready'
 * }}
 */
export function shouldPrintIfoodOrder({ order, printOwner, resolvePrintOwner, now = Date.now() } = {}) {
  if (!isIfoodOrder(order)) {
    return { action: 'print', shouldPrint: true, reason: 'not_ifood' };
  }

  const owner = resolveIfoodPrintOwner(order, { printOwner, resolvePrintOwner });
  if (owner === null) {
    const raw = printOwner ?? order?.ifood?.printOwner ?? order?.printOwner;
    const reason = raw === undefined || raw === null || raw === ''
      ? 'print_owner_missing'
      : 'print_owner_invalid';
    return { action: 'skip', shouldPrint: false, reason };
  }
  if (owner === 'external') {
    return { action: 'skip', shouldPrint: false, reason: 'print_owner_external' };
  }

  const schedule = ifoodScheduleState(order, now);
  if (!schedule.readyForKitchen) {
    return { action: 'defer', shouldPrint: false, reason: 'scheduled_before_prep' };
  }

  return { action: 'print', shouldPrint: true, reason: 'ready' };
}

/** True when the auto-print pipeline should enqueue this candidate now. */
export function isIfoodAutoPrintEligible(order, context = {}) {
  return shouldPrintIfoodOrder({ order, ...context }).shouldPrint;
}

export default {
  normalizePrintOwner,
  resolveIfoodPrintOwner,
  shouldPrintIfoodOrder,
  isIfoodAutoPrintEligible
};
