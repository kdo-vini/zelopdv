import { describe, expect, test } from 'vitest';
import { formatStoredDateForPtBr, getLocalDateInputValue, localDateInputToIso } from '../src/lib/dateRange.js';

describe('date range helpers', () => {
  test('builds inclusive local-day ISO ranges for date inputs', () => {
    const start = localDateInputToIso('2026-07-01');
    const end = localDateInputToIso('2026-07-31', { endOfDay: true });

    expect(new Date(start).getFullYear()).toBe(2026);
    expect(new Date(start).getMonth()).toBe(6);
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(start).getHours()).toBe(0);

    expect(new Date(end).getFullYear()).toBe(2026);
    expect(new Date(end).getMonth()).toBe(6);
    expect(new Date(end).getDate()).toBe(31);
    expect(new Date(end).getHours()).toBe(23);
    expect(new Date(end).getMinutes()).toBe(59);
  });

  test('uses the local calendar day for date input defaults', () => {
    expect(getLocalDateInputValue(new Date(2026, 6, 1, 1, 30))).toBe('2026-07-01');
  });

  test('formats stored ISO timestamps by their intended date part', () => {
    expect(formatStoredDateForPtBr('2026-07-01T00:00:00.000Z')).toBe('01/07/2026');
    expect(formatStoredDateForPtBr('2026-07-01')).toBe('01/07/2026');
  });
});
