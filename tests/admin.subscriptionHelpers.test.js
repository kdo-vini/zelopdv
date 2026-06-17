import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSubscriptionAdminStatus,
  isSubscriptionExpired,
} from '../admin-dashboard/src/lib/subscriptionHelpers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('admin subscription helpers', () => {
  it('classifies an expired trial as trial_expired for admin display', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));

    const sub = {
      status: 'trialing',
      current_period_end: '2026-06-13T13:33:00.084Z',
      manually_extended_until: null,
    };

    expect(isSubscriptionExpired(sub)).toBe(true);
    expect(getSubscriptionAdminStatus(sub)).toBe('trial_expired');
  });

  it('keeps a non-expired trial as trialing for admin display', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));

    expect(getSubscriptionAdminStatus({
      status: 'trialing',
      current_period_end: '2026-06-20T13:33:00.084Z',
      manually_extended_until: null,
    })).toBe('trialing');
  });

  it('keeps past_due distinct from date-derived expiration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));

    expect(getSubscriptionAdminStatus({
      status: 'past_due',
      current_period_end: '2026-06-13T13:33:00.084Z',
      manually_extended_until: null,
    })).toBe('past_due');
  });

  it('keeps persisted trial_expired as trial_expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));

    expect(getSubscriptionAdminStatus({
      status: 'trial_expired',
      current_period_end: '2026-06-13T13:33:00.084Z',
      manually_extended_until: null,
    })).toBe('trial_expired');
  });
});
