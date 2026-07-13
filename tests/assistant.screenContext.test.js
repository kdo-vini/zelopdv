import { describe, expect, it, vi } from 'vitest';
import { _getScreenContextForOwner } from '../src/routes/api/chat/assistant/+server.js';

describe('assistant screen context', () => {
  it('binds a selected product lookup to the resolved owner', async () => {
    const filters = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field, value) => {
        filters.push({ field, value });
        return query;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const client = { from: vi.fn(() => query) };

    await expect(_getScreenContextForOwner({ kind: 'product', id: 'other-company-product' }, 'owner-1', client))
      .resolves.toBeNull();

    expect(client.from).toHaveBeenCalledWith('produtos');
    expect(filters).toEqual([
      { field: 'id', value: 'other-company-product' },
      { field: 'id_usuario', value: 'owner-1' },
    ]);
  });
});
