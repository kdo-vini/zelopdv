/**
 * Subscription expiry helpers — used by the admin panel to display "when
 * does the customer actually lose access" in a way that respects manual
 * extensions.
 *
 * The `subscriptions` row in Supabase is the source of truth. Stripe,
 * Abacate Pay, and manual admin actions only feed these columns; the admin
 * panel should not ask payment providers to decide customer access.
 *
 * Background: the `subscriptions` table has two relevant columns:
 *   - `current_period_end`: paid billing period end (set by Stripe
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

export function parseSubscriptionDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  if (typeof value === 'number') {
    const milliseconds = value < 100000000000 ? value * 1000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+$/.test(trimmed)) return parseSubscriptionDate(Number(trimmed))

    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

export function formatSubscriptionDate(value) {
  const date = parseSubscriptionDate(value)
  return date ? date.toLocaleDateString('pt-BR') : '—'
}

export function getEffectiveExpiry(sub) {
  if (!sub) return null
  const periodEnd = parseSubscriptionDate(sub.current_period_end)
  const manualEnd = parseSubscriptionDate(sub.manually_extended_until)
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

export function getSubscriptionAdminStatus(sub) {
  if (!sub) return 'unknown'
  if (isSubscriptionExpired(sub) && (sub.status === 'active' || sub.status === 'trialing')) {
    return sub.status === 'trialing' ? 'trial_expired' : 'expired'
  }
  return sub.status || 'unknown'
}

/**
 * True when manually_extended_until is set, in the future, AND extends
 * past current_period_end. Used to surface a UI badge so the admin can
 * see at a glance which subs are on a courtesy extension vs. a regular
 * paid period.
 */
export function hasActiveManualExtension(sub) {
  if (!sub?.manually_extended_until) return false
  const manualEnd = parseSubscriptionDate(sub.manually_extended_until)
  if (!manualEnd) return false
  if (manualEnd.getTime() < Date.now()) return false
  if (!sub.current_period_end) return true
  const periodEnd = parseSubscriptionDate(sub.current_period_end)
  if (!periodEnd) return true
  return manualEnd > periodEnd
}

/**
 * Mirrors ZeloPDV isSubscriptionActiveStrict (src/lib/guards.js).
 * Returns { active: boolean, reason: string } for debugging.
 */
export function isPdvActive(sub) {
  if (!sub) return { active: false, reason: 'sem row' };
  const now = new Date();
  const manualEnd = parseSubscriptionDate(sub.manually_extended_until);
  // Extension manual vence status
  if (manualEnd && manualEnd > now) return { active: true, reason: 'extensão manual' };
  // Normal path: status + expiry
  if (sub.status === 'active' || sub.status === 'trialing') {
    const periodEnd = parseSubscriptionDate(sub.current_period_end);
    if (periodEnd && periodEnd > now) return { active: true, reason: `status=${sub.status}, período futuro` };
    // Fallback: só status (sem period_end)
    if (!periodEnd && sub.status === 'active') return { active: true, reason: 'status sem period_end' };
    return { active: false, reason: `status=${sub.status}, período vencido` };
  }
  // Sem period_end, só status
  if (!parseSubscriptionDate(sub.current_period_end) && (sub.status === 'active' || sub.status === 'trialing')) {
    return { active: true, reason: 'status sem period_end' };
  }
  return { active: false, reason: `status=${sub.status} inativo` };
}

/**
 * Mirrors ZeloChat isSubscriptionCurrentlyActive (src/domain/subscription.ts).
 * Returns { active: boolean, reason: string } for debugging.
 */
export function isChatActive(sub) {
  if (!sub) return { active: false, reason: 'sem row' };
  // ZeloChat só aceita chat/bundle tiers
  if (!['chat', 'bundle'].includes(sub.plan_tier)) {
    return { active: false, reason: `plan_tier=${sub.plan_tier} não é chat/bundle` };
  }
  const now = Date.now();
  const manualEnd = parseSubscriptionDate(sub.manually_extended_until);
  // Extension manual vence status (pós-fix de 2026-06-11)
  if (manualEnd && manualEnd > now) return { active: true, reason: 'extensão manual' };
  // ZeloChat exige status='active' estrito (trialing rejeitado)
  if (sub.status !== 'active') return { active: false, reason: `status=${sub.status} (Chat exige active)` };
  // Effective expiry = max(current_period_end, manually_extended_until)
  const periodEnd = parseSubscriptionDate(sub.current_period_end);
  const effectiveExpiry = periodEnd ? (manualEnd && manualEnd > periodEnd ? manualEnd : periodEnd) : null;
  if (!effectiveExpiry) return { active: false, reason: 'sem expiry' };
  if (effectiveExpiry <= now) return { active: false, reason: 'efectivo vencido' };
  return { active: true, reason: `status=active, expiry futuro` };
}

/**
 * Combined entitlement check for a subscription row.
 * Returns { pdv: {active, reason}, chat: {active, reason}, divergent: boolean }.
 */
export function getEntitlement(sub) {
  const pdv = isPdvActive(sub);
  const chat = isChatActive(sub);
  return {
    pdv,
    chat,
    divergent: pdv.active !== chat.active,
  };
}
