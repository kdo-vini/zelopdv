import { describe, expect, it } from 'vitest';
import { selectEligibleCompanyIds } from '../src/lib/server/intelligence/fetchers.js';

describe('selectEligibleCompanyIds', () => {
  const now = new Date('2026-07-12T12:00:00.000Z');

  it('uses only the latest subscription row for each enabled company', () => {
    const result = selectEligibleCompanyIds(
      ['enabled', 'cancelled'],
      [
        { user_id: 'enabled', status: 'active', updated_at: '2026-07-11T10:00:00.000Z' },
        { user_id: 'cancelled', status: 'active', updated_at: '2026-07-01T10:00:00.000Z' },
        { user_id: 'cancelled', status: 'canceled', updated_at: '2026-07-11T10:00:00.000Z' },
      ],
      now,
    );

    expect(result).toEqual([{ id: 'enabled' }]);
  });

  it('honors strict expiry and a valid manual extension on the latest row', () => {
    const result = selectEligibleCompanyIds(
      ['expired', 'extended'],
      [
        {
          user_id: 'expired',
          status: 'active',
          current_period_end: '2026-07-11T12:00:00.000Z',
          updated_at: '2026-07-11T10:00:00.000Z',
        },
        {
          user_id: 'extended',
          status: 'trial_expired',
          manually_extended_until: '2026-07-20T12:00:00.000Z',
          updated_at: '2026-07-11T10:00:00.000Z',
        },
      ],
      now,
    );

    expect(result).toEqual([{ id: 'extended' }]);
  });
});
