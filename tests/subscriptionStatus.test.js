import { describe, it, expect } from 'vitest';
import { isSubscriptionActiveStrict } from '../src/lib/guards.js';

describe('isSubscriptionActiveStrict', () => {
  it('returns true only for status "active" (any casing/whitespace)', () => {
    expect(isSubscriptionActiveStrict('active')).toBe(true);
    expect(isSubscriptionActiveStrict(' Active ')).toBe(true);
    expect(isSubscriptionActiveStrict('ACTIVE')).toBe(true);
  });

  it('returns false for non-active statuses or falsy', () => {
    expect(isSubscriptionActiveStrict('trialing')).toBe(false);
    expect(isSubscriptionActiveStrict('past_due')).toBe(false);
    expect(isSubscriptionActiveStrict('canceled')).toBe(false);
    expect(isSubscriptionActiveStrict('')).toBe(false);
    expect(isSubscriptionActiveStrict(null)).toBe(false);
    expect(isSubscriptionActiveStrict(undefined)).toBe(false);
  });
});
