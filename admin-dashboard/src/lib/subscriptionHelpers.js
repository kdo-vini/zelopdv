/**
 * Subscription expiry helpers — used by the admin panel to display "when
 * does the customer actually lose access" in a way that respects manual
 * extensions.
 *
 * Background: the `subscriptions` table has two relevant columns:
 *   - `current_period_end`: paid billing period end (set by Stripe/Asaas
 *     webhooks or trial extension).
 *   - `manually_extended_until`: courtesy extension set by admin via the
 *     "Renovar" flow (see admin_extend_subscription RPC) or by an enterprise
 *     contract that pre-pays beyond the billing cycle.
 *
 * `ensureActiveSubscription()` (in apps that gate by sub) treats the sub
 * as active if EITHER column is in the future. The admin panel must show
 * the same effective state — otherwise the admin sees "expirada / restam
 * 12 dias" while the customer still has access. That divergence has caused
 * unnecessary "Renovar" clicks and confused operational decisions.
 *
 * NOTE: actions that mutate the sub (cancel, trial extension) intentionally
 * write to `current_period_end` directly — those should NOT use these
 * helpers. These helpers are for read/display only.
 */

export function getEffectiveExpiry(sub) {
  if (!sub) return null
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
  const manualEnd = sub.manually_extended_until ? new Date(sub.manually_extended_until) : null
  if (!periodEnd && !manualEnd) return null
  if (!periodEnd) return manualEnd
  if (!manualEnd) return periodEnd
  return manualEnd > periodEnd ? manualEnd : periodEnd
}

export function getDaysUntilEffectiveExpiry(sub) {
  const expiry = getEffectiveExpiry(sub)
  if (!expiry) return 0
  const diff = expiry.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function isSubscriptionExpired(sub) {
  const expiry = getEffectiveExpiry(sub)
  return expiry ? expiry.getTime() < Date.now() : true
}

/**
 * True when manually_extended_until is set, in the future, AND extends
 * past current_period_end. Used to surface a UI badge so the admin can
 * see at a glance which subs are on a courtesy extension vs. a regular
 * paid period.
 */
export function hasActiveManualExtension(sub) {
  if (!sub?.manually_extended_until) return false
  const manualEnd = new Date(sub.manually_extended_until)
  if (manualEnd.getTime() < Date.now()) return false
  if (!sub.current_period_end) return true
  const periodEnd = new Date(sub.current_period_end)
  return manualEnd > periodEnd
}
