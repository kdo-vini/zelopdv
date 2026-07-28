import { describe, it, expect } from 'vitest';
import { isSubscriptionActiveStrict, getTrialTotalDays } from '../src/lib/subscriptionStatus.js';

describe('isSubscriptionActiveStrict', () => {
  it('returns true for status "active" (any casing/whitespace)', () => {
    expect(isSubscriptionActiveStrict({ status: 'active' })).toBe(true);
    expect(isSubscriptionActiveStrict({ status: ' Active ' })).toBe(true);
    expect(isSubscriptionActiveStrict({ status: 'ACTIVE' })).toBe(true);
  });

  it('returns true for status "trialing" (free trial period)', () => {
    expect(isSubscriptionActiveStrict({ status: 'trialing' })).toBe(true);
    expect(isSubscriptionActiveStrict({ status: ' Trialing ' })).toBe(true);
    expect(isSubscriptionActiveStrict({ status: 'TRIALING' })).toBe(true);
  });

  it('returns false for non-active/non-trialing statuses or falsy', () => {
    expect(isSubscriptionActiveStrict({ status: 'trial_expired' })).toBe(false);
    expect(isSubscriptionActiveStrict({ status: 'past_due' })).toBe(false);
    expect(isSubscriptionActiveStrict({ status: 'canceled' })).toBe(false);
    expect(isSubscriptionActiveStrict({ status: 'incomplete' })).toBe(false);
    expect(isSubscriptionActiveStrict({ status: '' })).toBe(false);
    expect(isSubscriptionActiveStrict(null)).toBe(false);
    expect(isSubscriptionActiveStrict(undefined)).toBe(false);
  });

  it('returns false for active/trialing status with expired period', () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // yesterday
    expect(isSubscriptionActiveStrict({ status: 'active', current_period_end: expiredDate })).toBe(false);
    expect(isSubscriptionActiveStrict({ status: 'trialing', current_period_end: expiredDate })).toBe(false);
  });

  it('returns true for active/trialing status with future period end', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now
    expect(isSubscriptionActiveStrict({ status: 'active', current_period_end: futureDate })).toBe(true);
    expect(isSubscriptionActiveStrict({ status: 'trialing', current_period_end: futureDate })).toBe(true);
  });

  it('returns true for a manual extension even when trial was marked expired', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isSubscriptionActiveStrict({
      status: 'trial_expired',
      current_period_end: '2026-01-01T00:00:00.000Z',
      manually_extended_until: futureDate,
    })).toBe(true);
  });
});

describe('getTrialTotalDays', () => {
  const dias = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

  it('deriva 30 dias de uma conta antiga, ignorando o fallback de 14', () => {
    const sub = { created_at: dias(-10), current_period_end: dias(20) };
    expect(getTrialTotalDays(sub, 14)).toBe(30);
  });

  it('deriva 14 dias de uma conta nova', () => {
    const sub = { created_at: dias(-3), current_period_end: dias(11) };
    expect(getTrialTotalDays(sub, 14)).toBe(14);
  });

  it('considera a extensão manual como fim do trial', () => {
    const sub = {
      created_at: dias(-5),
      current_period_end: dias(9),
      manually_extended_until: dias(25),
    };
    expect(getTrialTotalDays(sub, 14)).toBe(30);
  });

  it('cai no fallback quando falta created_at', () => {
    expect(getTrialTotalDays({ current_period_end: dias(14) }, 14)).toBe(14);
  });

  it('cai no fallback com datas inválidas ou invertidas', () => {
    expect(getTrialTotalDays({ created_at: 'nao-e-data', current_period_end: dias(14) }, 14)).toBe(14);
    expect(getTrialTotalDays({ created_at: dias(5), current_period_end: dias(1) }, 14)).toBe(14);
    expect(getTrialTotalDays(null, 14)).toBe(14);
  });
});
