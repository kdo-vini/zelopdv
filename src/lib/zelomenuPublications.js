const DEFAULT_BATCH_SIZE = 50;

/**
 * Publishes base products in ZeloMenu without changing the PDV catalog fields.
 * Each batch is atomic; failures are returned so callers can preserve only the
 * failed products in their selection.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ ownerUserId: string, productIds: Array<number|string>, batchSize?: number }} input
 * @returns {Promise<{ publishedIds: Array<number|string>, failedIds: Array<number|string>, errors: Array<object> }>}
 */
export async function publishProductsToZeloMenu(
  client,
  { ownerUserId, productIds, batchSize = DEFAULT_BATCH_SIZE },
) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  if (!client?.from) throw new Error('Supabase client is required');

  const uniqueProductIds = [...new Set((productIds || []).filter((id) => id != null))];
  if (uniqueProductIds.length === 0) {
    return { publishedIds: [], failedIds: [], errors: [] };
  }

  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || DEFAULT_BATCH_SIZE));
  const publishedIds = [];
  const failedIds = [];
  const errors = [];

  for (let index = 0; index < uniqueProductIds.length; index += safeBatchSize) {
    const batchIds = uniqueProductIds.slice(index, index + safeBatchSize);
    const rows = batchIds.map((productId) => ({
      id_usuario: ownerUserId,
      id_produto: productId,
      visivel_online: true,
      pausado_manualmente: false,
    }));

    const { error } = await client
      .from('zelomenu_product_publications')
      .upsert(rows, { onConflict: 'id_usuario,id_produto' });

    if (error) {
      failedIds.push(...batchIds);
      errors.push(error);
    } else {
      publishedIds.push(...batchIds);
    }
  }

  return { publishedIds, failedIds, errors };
}

/**
 * Unpublishes products from ZeloMenu by setting visivel_online to false.
 * Each batch is atomic; failures are returned so callers can preserve only the
 * failed products in their selection.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ ownerUserId: string, productIds: Array<number|string>, batchSize?: number }} input
 * @returns {Promise<{ unpublishedIds: Array<number|string>, failedIds: Array<number|string>, errors: Array<object> }>}
 */
export async function unpublishProductsFromZeloMenu(
  client,
  { ownerUserId, productIds, batchSize = DEFAULT_BATCH_SIZE },
) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  if (!client?.from) throw new Error('Supabase client is required');

  const uniqueProductIds = [...new Set((productIds || []).filter((id) => id != null))];
  if (uniqueProductIds.length === 0) {
    return { unpublishedIds: [], failedIds: [], errors: [] };
  }

  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || DEFAULT_BATCH_SIZE));
  const unpublishedIds = [];
  const failedIds = [];
  const errors = [];

  for (let index = 0; index < uniqueProductIds.length; index += safeBatchSize) {
    const batchIds = uniqueProductIds.slice(index, index + safeBatchSize);

    const { error } = await client
      .from('zelomenu_product_publications')
      .update({ visivel_online: false })
      .in('id_produto', batchIds)
      .eq('id_usuario', ownerUserId);

    if (error) {
      failedIds.push(...batchIds);
      errors.push(error);
    } else {
      unpublishedIds.push(...batchIds);
    }
  }

  return { unpublishedIds, failedIds, errors };
}
