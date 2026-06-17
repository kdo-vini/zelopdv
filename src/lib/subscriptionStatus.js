export const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  TRIALING: 'trialing',
  TRIAL_EXPIRED: 'trial_expired',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  INCOMPLETE: 'incomplete',
});

export const ADMIN_MUTABLE_SUBSCRIPTION_STATUSES = Object.freeze([
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.TRIALING,
  SUBSCRIPTION_STATUS.TRIAL_EXPIRED,
  SUBSCRIPTION_STATUS.PAST_DUE,
  SUBSCRIPTION_STATUS.CANCELED,
]);

export function normalizeSubscriptionStatus(status) {
  return (status ?? '').toString().trim().toLowerCase();
}

/**
 * Strict entitlement check used by guards and server endpoints.
 * A manual extension grants access regardless of status; otherwise only
 * active/trialing rows with a future period end are active.
 */
export function isSubscriptionActiveStrict(subscription, now = new Date()) {
  if (!subscription) return false;

  const status = normalizeSubscriptionStatus(subscription.status);
  const isActiveStatus = status === SUBSCRIPTION_STATUS.ACTIVE || status === SUBSCRIPTION_STATUS.TRIALING;

  if (subscription.manually_extended_until) {
    const extendedUntil = new Date(subscription.manually_extended_until);
    if (!Number.isNaN(extendedUntil.getTime()) && extendedUntil > now) return true;
  }

  if (subscription.current_period_end) {
    const expiryDate = new Date(subscription.current_period_end);
    const notExpired = !Number.isNaN(expiryDate.getTime()) && expiryDate > now;
    return isActiveStatus && notExpired;
  }

  return isActiveStatus;
}

export function getOperationalSubscriptionStatus(subscription, now = new Date()) {
  if (!subscription) return 'unknown';
  const status = normalizeSubscriptionStatus(subscription.status);
  if ((status === SUBSCRIPTION_STATUS.ACTIVE || status === SUBSCRIPTION_STATUS.TRIALING)
    && !isSubscriptionActiveStrict(subscription, now)) {
    return status === SUBSCRIPTION_STATUS.TRIALING
      ? SUBSCRIPTION_STATUS.TRIAL_EXPIRED
      : 'expired';
  }
  return status || 'unknown';
}
