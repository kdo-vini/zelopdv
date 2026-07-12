import { describe, expect, it, vi } from 'vitest';
import { buildSignalContextPrompt, getSignalContextForOwner } from '../src/lib/server/intelligence/signalContext.js';

function makeClient(rows) {
  const calls = [];
  return {
    calls,
    from: vi.fn(() => {
      const filters = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((field, value) => {
          filters.push({ field, value });
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data: rows.find((row) => filters.every(({ field, value }) => row[field] === value)) || null,
          error: null,
        })),
      };
      calls.push({ filters, query });
      return query;
    }),
  };
}

describe('intelligence signal chat context', () => {
  it('binds a signal lookup to the resolved owner, blocking another tenant signal', async () => {
    const client = makeClient([{ id: 'signal-other', user_id: 'owner-other', type: 'REVENUE_BELOW_WEEKDAY_AVG' }]);

    const signal = await getSignalContextForOwner('signal-other', 'owner-current', client);

    expect(signal).toBeNull();
    expect(client.calls[0].filters).toEqual([
      { field: 'id', value: 'signal-other' },
      { field: 'user_id', value: 'owner-current' },
    ]);
  });

  it('includes only the selected signal evidence and its stored narrative in the prompt', () => {
    const prompt = buildSignalContextPrompt({
      type: 'STOCK_COVERAGE_LOW', severity: 'attention', signal_date: '2026-07-12',
      evidence: { coverage_days: 3.5 }, narrative: 'O estoque cobre o ritmo medio por 3,5 dias.',
    });

    expect(prompt).toContain('coverage_days');
    expect(prompt).toContain('3.5');
    expect(prompt).toContain('exatamente os numeros');
  });
});
