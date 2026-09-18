// Supabase seams for progressive iFood product mapping and stock ledger.
// Browser routes and the event handler inject this module; it never decides
// authorization and never returns raw SQL/provider text to callers.

function repositoryError() {
  return new Error('iFood product mapping repository operation failed');
}

function mapSuggest(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    existingMapping: row.existing_mapping ?? row.existingMapping ?? null,
    exactMatch: row.exact_match ?? row.exactMatch ?? null,
    similarMatches: row.similar_matches ?? row.similarMatches ?? []
  };
}

function mapConfirm(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    mappingId: row.mapping_id ?? row.mappingId ?? null,
    mappingStatus: row.mapping_status ?? row.mappingStatus ?? null,
    productId: row.product_id ?? row.productId ?? null
  };
}

function mapCommit(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    committedCount: Number(row.committed_count ?? row.committedCount ?? 0),
    skippedUnmapped: Number(row.skipped_unmapped ?? row.skippedUnmapped ?? 0),
    skippedInsufficient: Number(row.skipped_insufficient ?? row.skippedInsufficient ?? 0),
    duplicateCount: Number(row.duplicate_count ?? row.duplicateCount ?? 0)
  };
}

function mapRelease(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    releasedCount: Number(row.released_count ?? row.releasedCount ?? 0),
    duplicateCount: Number(row.duplicate_count ?? row.duplicateCount ?? 0)
  };
}

/**
 * @param {{ supabase: { rpc: Function } }} deps
 */
export function createIfoodProductMappingRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodProductMappingRepository requires a supabase client with rpc()');
  }

  async function suggestMapping({
    empresaId,
    merchantId,
    externalItemId,
    externalCode = null,
    itemName = null,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('suggest_ifood_product_mapping_v1', {
        p_empresa_id: empresaId,
        p_merchant_id: merchantId,
        p_external_item_id: externalItemId,
        p_external_code: externalCode,
        p_item_name: itemName
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapSuggest(result?.data);
  }

  async function confirmMapping({
    empresaId,
    merchantId,
    externalItemId,
    productId,
    externalCode = null,
    action = 'confirm',
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('confirm_ifood_product_mapping_v1', {
        p_empresa_id: empresaId,
        p_merchant_id: merchantId,
        p_external_item_id: externalItemId,
        p_product_id: productId,
        p_external_code: externalCode,
        p_action: action
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapConfirm(result?.data);
  }

  async function commitStockForEvent({
    merchantId,
    externalOrderId,
    eventId,
    items,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('commit_ifood_stock_for_event_v1', {
        p_merchant_id: merchantId,
        p_external_order_id: externalOrderId,
        p_event_id: eventId,
        p_items: items
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapCommit(result?.data);
  }

  async function releaseStockForEvent({
    merchantId,
    externalOrderId,
    eventId,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('release_ifood_stock_for_event_v1', {
        p_merchant_id: merchantId,
        p_external_order_id: externalOrderId,
        p_event_id: eventId
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapRelease(result?.data);
  }

  return Object.freeze({
    suggestMapping,
    confirmMapping,
    commitStockForEvent,
    releaseStockForEvent
  });
}

export default createIfoodProductMappingRepository;
