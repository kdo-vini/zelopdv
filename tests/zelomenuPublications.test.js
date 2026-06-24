import { describe, expect, it, vi } from 'vitest';
import { publishProductsToZeloMenu } from '../src/lib/zelomenuPublications.js';

function makeClient(results = []) {
  const upsert = vi.fn();
  for (const result of results) {
    upsert.mockResolvedValueOnce(result);
  }

  return {
    from: vi.fn((table) => {
      expect(table).toBe('zelomenu_product_publications');
      return { upsert };
    }),
    upsert,
  };
}

describe('publishProductsToZeloMenu', () => {
  it('publishes deduplicated products through the canonical publication table', async () => {
    const client = makeClient([{ error: null }]);

    const result = await publishProductsToZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [10, 20, 10],
    });

    expect(client.upsert).toHaveBeenCalledWith(
      [
        {
          id_usuario: 'owner-1',
          id_produto: 10,
          visivel_online: true,
          pausado_manualmente: false,
        },
        {
          id_usuario: 'owner-1',
          id_produto: 20,
          visivel_online: true,
          pausado_manualmente: false,
        },
      ],
      { onConflict: 'id_usuario,id_produto' },
    );
    expect(result).toEqual({
      publishedIds: [10, 20],
      failedIds: [],
      errors: [],
    });
  });

  it('reports partial failure by batch without claiming total success', async () => {
    const error = { message: 'network failure' };
    const client = makeClient([{ error: null }, { error }]);

    const result = await publishProductsToZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [1, 2, 3],
      batchSize: 2,
    });

    expect(result).toEqual({
      publishedIds: [1, 2],
      failedIds: [3],
      errors: [error],
    });
  });

  it('does not write when required input is missing', async () => {
    const client = makeClient();

    await expect(
      publishProductsToZeloMenu(client, { ownerUserId: '', productIds: [1] }),
    ).rejects.toThrow('ownerUserId');

    expect(client.from).not.toHaveBeenCalled();
  });
});
