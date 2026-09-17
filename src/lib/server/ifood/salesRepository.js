// Supabase seam for materializing/reversing iFood sales as public.vendas
// rows. Browser routes never call this directly; only the event handler
// after a CONCLUDED/CANCELLED projection, best-effort, the same pattern
// used by productMappingRepository.js's stock hooks.

function repositoryError() {
  return new Error('iFood sales repository operation failed');
}

function mapMaterialize(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    vendaId: row.venda_id ?? row.vendaId ?? null
  };
}

function mapReverse(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    outcome: row.outcome ?? null,
    estornoId: row.estorno_id ?? row.estornoId ?? null,
    vendaId: row.venda_id ?? row.vendaId ?? null,
    status: row.status ?? null
  };
}

/**
 * @param {{ supabase: { rpc: Function } }} deps
 */
export function createIfoodSalesRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodSalesRepository requires a supabase client with rpc()');
  }

  async function materializeSaleForEvent({
    merchantId,
    externalOrderId,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('materialize_ifood_sale_v1', {
        p_merchant_id: merchantId,
        p_external_order_id: externalOrderId
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapMaterialize(result?.data);
  }

  async function reverseSaleForEvent({
    merchantId,
    externalOrderId,
    eventId,
    signal
  }) {
    let result;
    try {
      result = await supabase.rpc('reverse_ifood_sale_v1', {
        p_merchant_id: merchantId,
        p_external_order_id: externalOrderId,
        p_event_id: eventId
      }).single();
    } catch {
      throw repositoryError();
    }
    if (result?.error) throw repositoryError();
    return mapReverse(result?.data);
  }

  return Object.freeze({
    materializeSaleForEvent,
    reverseSaleForEvent
  });
}

export default createIfoodSalesRepository;
