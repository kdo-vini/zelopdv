// Browser-facing orchestration for the sanitized iFood order sync state.
// Authentication, access context, and persistence are injected so this module
// remains independent of SvelteKit and Supabase.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result(status, body) {
  return { status, body };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export function normalizeIfoodOrderIds(orderIds) {
  if (!Array.isArray(orderIds)) return null;

  const normalized = [];
  const seen = new Set();
  for (const orderId of orderIds) {
    if (!isValidUuid(orderId)) return null;
    const trimmed = orderId.trim();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }

  if (normalized.length < 1 || normalized.length > 100) return null;
  return normalized;
}

export function canReadIfoodSyncState(accessContext) {
  if (!accessContext) return false;
  if (!accessContext.isSubUser) return true;
  return accessContext.permissions?.['pedidos.acessar'] === true
    || accessContext.permissions?.['pedidos.cozinha'] === true;
}

function getUserId(authResult) {
  return authResult?.user?.id ?? authResult?.data?.user?.id ?? null;
}

function mapCommand(row) {
  const hasCommand = row.commandIntent !== null && row.commandIntent !== undefined
    || row.commandStatus !== null && row.commandStatus !== undefined
    || row.commandUpdatedAt !== null && row.commandUpdatedAt !== undefined
    || row.commandErrorCode !== null && row.commandErrorCode !== undefined;
  if (!hasCommand) return null;

  return {
    intent: row.commandIntent ?? null,
    status: row.commandStatus ?? null,
    updatedAt: row.commandUpdatedAt ?? null,
    errorCode: row.commandErrorCode ?? null
  };
}

function mapOrder(row) {
  if (!row || typeof row !== 'object' || !isValidUuid(row.zeloOrderId)) return null;
  const zeloOrderId = row.zeloOrderId.trim();
  return {
    zeloOrderId,
    value: {
      externalStatus: row.externalStatus ?? null,
      lastEventAt: row.lastEventAt ?? null,
      connectionStatus: row.connectionStatus ?? null,
      command: mapCommand(row)
    }
  };
}

function mapResponse(rows) {
  const orders = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const mapped = mapOrder(row);
    if (mapped) orders[mapped.zeloOrderId] = mapped.value;
  }
  return { orders };
}

/**
 * @param {{
 *   repository: { getOrderSyncState: Function },
 *   accessResolver: (userId: string) => Promise<object>
 * }} deps
 */
export function createIfoodSyncStateService({ repository, accessResolver } = {}) {
  if (!repository || typeof repository.getOrderSyncState !== 'function') {
    throw new TypeError('createIfoodSyncStateService requires repository.getOrderSyncState()');
  }
  if (typeof accessResolver !== 'function') {
    throw new TypeError('createIfoodSyncStateService requires an accessResolver()');
  }

  async function getOrderSyncState({
    authResult,
    accessContext: providedAccessContext,
    empresaId,
    orderIds,
    signal
  } = {}) {
    const userId = getUserId(authResult);
    if (!isNonEmptyString(userId)) return result(401, { error: 'unauthorized' });

    const normalizedOrderIds = normalizeIfoodOrderIds(orderIds);
    if (!isNonEmptyString(empresaId) || !normalizedOrderIds) {
      return result(400, { error: 'invalid_request' });
    }

    let accessContext;
    try {
      accessContext = providedAccessContext ?? await accessResolver(userId);
    } catch {
      return result(500, { error: 'unavailable' });
    }

    if (!canReadIfoodSyncState(accessContext)) {
      return result(403, { error: 'forbidden' });
    }

    try {
      const rows = await repository.getOrderSyncState({
        empresaId: empresaId.trim(),
        orderIds: normalizedOrderIds,
        signal
      });
      return result(200, mapResponse(rows));
    } catch {
      // Repository errors can contain SQL details or private integration data.
      return result(500, { error: 'unavailable' });
    }
  }

  return Object.freeze({ getOrderSyncState });
}

export const createIfoodOrderSyncStateService = createIfoodSyncStateService;

export default createIfoodSyncStateService;
