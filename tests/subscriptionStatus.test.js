import { describe, it, expect } from 'vitest';
import { isSubscriptionActiveStrict } from '../src/lib/guards.js';

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
});
