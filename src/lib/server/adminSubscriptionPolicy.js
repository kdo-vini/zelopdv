// Altering a status is not a payment or a renewal. Operators must grant an
// explicit extension through the existing audited extension action first.
export function expiredReactivation(subscription, nextStatus, now = Date.now()) {
  if (!['active', 'trialing'].includes(nextStatus)) return false;
  const expiry = Math.max(
    Date.parse(subscription.current_period_end || '') || 0,
    Date.parse(subscription.manually_extended_until || '') || 0,
  );
  return expiry <= now;
}

export const EXPIRED_REACTIVATION_MESSAGE = 'A assinatura está sem prazo vigente. Use Estender prazo ou Estender trial para definir a validade antes de reativar.';
