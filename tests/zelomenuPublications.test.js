import { describe, expect, it, vi } from 'vitest';
import { publishProductsToZeloMenu, unpublishProductsFromZeloMenu } from '../src/lib/zelomenuPublications.js';

function makeClient(results = []) {
  const upsert = vi.fn();
  for (const result of results) {
    upsert.mockResolvedValueOnce(result);
  }

  const updateFilter = vi.fn();
  const inFilter = vi.fn();
  const eqFilter = vi.fn();

  // update().in().eq() chain
  updateFilter.mockReturnValue({ in: inFilter });
  inFilter.mockReturnValue({ eq: eqFilter });

  let updateCallIndex = 0;
  eqFilter.mockImplementation(() => {
    const result = results[updateCallIndex] ?? { error: null };
    updateCallIndex++;
    return Promise.resolve(result);
  });

  return {
    from: vi.fn((table) => {
      expect(table).toBe('zelomenu_product_publications');
      return { upsert, update: updateFilter };
    }),
    upsert,
    update: updateFilter,
    in: inFilter,
    eq: eqFilter,
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

describe('unpublishProductsFromZeloMenu', () => {
  it('sets visivel_online to false for given products', async () => {
    const client = makeClient([{ error: null }]);

    const result = await unpublishProductsFromZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [10, 20],
    });

    expect(client.update).toHaveBeenCalledWith({ visivel_online: false });
    expect(client.in).toHaveBeenCalledWith('id_produto', [10, 20]);
    expect(client.eq).toHaveBeenCalledWith('id_usuario', 'owner-1');
    expect(result).toEqual({
      unpublishedIds: [10, 20],
      failedIds: [],
      errors: [],
    });
  });

  it('deduplicates product ids', async () => {
    const client = makeClient([{ error: null }]);

    const result = await unpublishProductsFromZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [10, 10, 20],
    });

    expect(client.in).toHaveBeenCalledWith('id_produto', [10, 20]);
    expect(result.unpublishedIds).toEqual([10, 20]);
  });

  it('returns empty result when no product ids provided', async () => {
    const client = makeClient();

    const result = await unpublishProductsFromZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [],
    });

    expect(client.from).not.toHaveBeenCalled();
    expect(result).toEqual({ unpublishedIds: [], failedIds: [], errors: [] });
  });

  it('reports failures per batch', async () => {
    const error = { message: 'db timeout' };
    const client = makeClient([{ error: null }, { error }]);

    const result = await unpublishProductsFromZeloMenu(client, {
      ownerUserId: 'owner-1',
      productIds: [1, 2, 3],
      batchSize: 2,
    });

    expect(result).toEqual({
      unpublishedIds: [1, 2],
      failedIds: [3],
      errors: [error],
    });
  });

  it('rejects when ownerUserId is missing', async () => {
    const client = makeClient();

    await expect(
      unpublishProductsFromZeloMenu(client, { ownerUserId: '', productIds: [1] }),
    ).rejects.toThrow('ownerUserId');
  });
});
