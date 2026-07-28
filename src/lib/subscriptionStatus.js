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

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Duração real do trial DESTA assinatura, em dias.
 *
 * Não dá pra assumir TRIAL_DAYS: quem entrou antes de 2026-07-27 tem trial de 30 dias
 * gravado em `current_period_end`, e extensão manual do admin estica ainda mais. Usar a
 * constante nesses casos quebrava o progresso na UI ("Dia 1 de 14" pra quem tinha 20
 * dias pela frente, e barra travada em 0%).
 *
 * Deriva de created_at -> current_period_end quando ambos existem; senão cai no
 * fallback (a constante), que é o certo para contas novas.
 *
 * @param {{ created_at?: string, current_period_end?: string, manually_extended_until?: string }} subscription
 * @param {number} fallbackDays
 */
export function getTrialTotalDays(subscription, fallbackDays) {
  const inicio = subscription?.created_at ? new Date(subscription.created_at) : null;
  const fimBruto = subscription?.manually_extended_until || subscription?.current_period_end;
  const fim = fimBruto ? new Date(fimBruto) : null;

  if (!inicio || !fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return fallbackDays;
  }

  const dias = Math.round((fim.getTime() - inicio.getTime()) / DIA_MS);
  return dias > 0 ? dias : fallbackDays;
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
