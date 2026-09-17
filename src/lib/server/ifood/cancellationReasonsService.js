// Read-only cancellation-reasons orchestration. The route owns auth and
// permission checks; this seam owns tenant-scoped ref resolution, connection
// gating, provider invocation, and response sanitization.

function response(status, body) {
  return { status, body };
}

function refValues(ref) {
  return {
    merchantId: ref?.merchantId ?? ref?.merchant_id,
    externalOrderId: ref?.externalOrderId ?? ref?.external_order_id,
    connectionStatus: ref?.connectionStatus ?? ref?.connection_status
  };
}

function mapReason(reason) {
  if (!reason || typeof reason !== 'object') return null;
  const rawCode = reason.cancelCodeId ?? reason.code;
  const rawDescription = reason.description;
  if (rawCode === null || rawCode === undefined || rawDescription === null || rawDescription === undefined) {
    return null;
  }
  const code = String(rawCode).trim();
  const description = String(rawDescription).trim();
  if (!code || !description) return null;
  return { code, description };
}

/**
 * @param {{
 *   repository: { getOrderRef: Function },
 *   adapter: { getCancellationReasons: Function }
 * }} deps
 */
export function createIfoodCancellationReasonsService({ repository, adapter } = {}) {
  if (!repository || typeof repository.getOrderRef !== 'function') {
    throw new TypeError('createIfoodCancellationReasonsService requires repository.getOrderRef()');
  }
  if (!adapter || typeof adapter.getCancellationReasons !== 'function') {
    throw new TypeError('createIfoodCancellationReasonsService requires adapter.getCancellationReasons()');
  }

  async function getCancellationReasons({ empresaId, zeloOrderId, signal, ref: providedRef } = {}) {
    let ref = providedRef;
    if (!ref) {
      try {
        ref = await repository.getOrderRef({ empresaId, zeloOrderId, signal });
      } catch {
        return response(503, { error: 'unavailable' });
      }
    }

    if (!ref) return response(404, { error: 'order_not_found' });
    const resolved = refValues(ref);
    if (!resolved.merchantId || !resolved.externalOrderId) {
      return response(404, { error: 'order_not_found' });
    }
    if (String(resolved.connectionStatus || '').toLowerCase() !== 'active') {
      return response(409, { error: 'connection_unavailable' });
    }

    try {
      const providerReasons = await adapter.getCancellationReasons(resolved.externalOrderId, { signal });
      const reasons = Array.isArray(providerReasons)
        ? providerReasons.map(mapReason).filter(Boolean)
        : [];
      return response(200, reasons);
    } catch {
      return response(502, { error: 'provider_unavailable' });
    }
  }

  return Object.freeze({ getCancellationReasons });
}

export const fetchIfoodCancellationReasons = async (options) => {
  const service = createIfoodCancellationReasonsService(options);
  return service.getCancellationReasons(options);
};

export default createIfoodCancellationReasonsService;
