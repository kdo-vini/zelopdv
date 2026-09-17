// Browser-facing orchestration for progressive iFood product mapping.
// Authentication and access context are injected so this module stays free
// of SvelteKit and Supabase concerns.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_PERMISSION = 'produtos.visualizar';
const WRITE_PERMISSION = 'produtos.gerenciar';

function result(status, body) {
  return { status, body };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

function getUserId(authResult) {
  return authResult?.user?.id ?? authResult?.data?.user?.id ?? null;
}

export function canSuggestIfoodProductMapping(accessContext) {
  if (!accessContext) return false;
  if (!accessContext.isSubUser) return true;
  return accessContext.permissions?.[READ_PERMISSION] === true
    || accessContext.permissions?.[WRITE_PERMISSION] === true;
}

export function canConfirmIfoodProductMapping(accessContext) {
  if (!accessContext) return false;
  if (!accessContext.isSubUser) return true;
  return accessContext.permissions?.[WRITE_PERMISSION] === true;
}

function sanitizeSuggestQuery(query = {}) {
  if (!isNonEmptyString(query.merchantId) || !isNonEmptyString(query.externalItemId)) {
    return { code: 'invalid_request' };
  }
  const externalCode = query.externalCode;
  if (externalCode !== undefined && externalCode !== null && typeof externalCode !== 'string') {
    return { code: 'invalid_request' };
  }
  const itemName = query.name ?? query.itemName;
  if (itemName !== undefined && itemName !== null && typeof itemName !== 'string') {
    return { code: 'invalid_request' };
  }
  return {
    merchantId: query.merchantId.trim(),
    externalItemId: query.externalItemId.trim(),
    externalCode: typeof externalCode === 'string' ? externalCode.trim() || null : null,
    itemName: typeof itemName === 'string' ? itemName.trim() || null : null
  };
}

function sanitizeConfirmBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { code: 'invalid_payload' };
  }
  if (!isNonEmptyString(body.merchantId) || !isNonEmptyString(body.externalItemId)) {
    return { code: 'invalid_payload' };
  }
  const productId = body.productId;
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return { code: 'invalid_payload' };
  }
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'confirm';
  if (action !== 'confirm' && action !== 'disable') {
    return { code: 'invalid_payload' };
  }
  const externalCode = body.externalCode;
  if (externalCode !== undefined && externalCode !== null && typeof externalCode !== 'string') {
    return { code: 'invalid_payload' };
  }
  return {
    merchantId: body.merchantId.trim(),
    externalItemId: body.externalItemId.trim(),
    productId,
    action,
    externalCode: typeof externalCode === 'string' ? externalCode.trim() || null : null
  };
}

function mapSuggestOutcome(repositoryResult) {
  const outcome = repositoryResult?.outcome;
  if (outcome === 'connection_not_found') {
    return result(404, { error: 'connection_not_found' });
  }
  if (outcome !== 'ok') {
    return result(500, { error: 'unavailable' });
  }
  return result(200, {
    existingMapping: repositoryResult.existingMapping ?? null,
    exactMatch: repositoryResult.exactMatch ?? null,
    similarMatches: Array.isArray(repositoryResult.similarMatches)
      ? repositoryResult.similarMatches
      : []
  });
}

function mapConfirmOutcome(repositoryResult) {
  const outcome = repositoryResult?.outcome;
  switch (outcome) {
    case 'ok':
      return result(200, {
        mappingId: repositoryResult.mappingId ?? null,
        mappingStatus: repositoryResult.mappingStatus ?? null,
        productId: repositoryResult.productId ?? null
      });
    case 'connection_not_found':
      return result(404, { error: 'connection_not_found' });
    case 'product_not_found':
      return result(404, { error: 'product_not_found' });
    case 'invalid_payload':
      return result(422, { error: 'invalid_payload' });
    default:
      return result(500, { error: 'unavailable' });
  }
}

/**
 * @param {{
 *   repository: {
 *     suggestMapping: Function,
 *     confirmMapping: Function
 *   },
 *   accessResolver: (userId: string) => Promise<object>
 * }} deps
 */
export function createIfoodProductMappingService({ repository, accessResolver } = {}) {
  if (!repository
    || typeof repository.suggestMapping !== 'function'
    || typeof repository.confirmMapping !== 'function') {
    throw new TypeError('createIfoodProductMappingService requires suggestMapping() and confirmMapping()');
  }
  if (typeof accessResolver !== 'function') {
    throw new TypeError('createIfoodProductMappingService requires an accessResolver()');
  }

  async function resolveAccess(authResult, providedAccessContext) {
    const userId = getUserId(authResult);
    if (!isNonEmptyString(userId)) return { error: result(401, { error: 'unauthorized' }) };
    try {
      const accessContext = providedAccessContext ?? await accessResolver(userId);
      return { userId, accessContext };
    } catch {
      return { error: result(500, { error: 'unavailable' }) };
    }
  }

  async function suggest({
    authResult,
    accessContext: providedAccessContext,
    empresaId,
    query,
    signal
  } = {}) {
    if (!isValidUuid(empresaId)) return result(400, { error: 'invalid_request' });

    const access = await resolveAccess(authResult, providedAccessContext);
    if (access.error) return access.error;
    if (!canSuggestIfoodProductMapping(access.accessContext)) {
      return result(403, { error: 'forbidden' });
    }

    const input = sanitizeSuggestQuery(query);
    if (input.code === 'invalid_request') return result(400, { error: 'invalid_request' });

    try {
      const repositoryResult = await repository.suggestMapping({
        empresaId: empresaId.trim(),
        merchantId: input.merchantId,
        externalItemId: input.externalItemId,
        externalCode: input.externalCode,
        itemName: input.itemName,
        signal
      });
      return mapSuggestOutcome(repositoryResult);
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  async function confirm({
    authResult,
    accessContext: providedAccessContext,
    empresaId,
    body,
    signal
  } = {}) {
    if (!isValidUuid(empresaId)) return result(400, { error: 'invalid_request' });

    const access = await resolveAccess(authResult, providedAccessContext);
    if (access.error) return access.error;
    if (!canConfirmIfoodProductMapping(access.accessContext)) {
      return result(403, { error: 'forbidden' });
    }

    const input = sanitizeConfirmBody(body);
    if (input.code === 'invalid_payload') return result(422, { error: 'invalid_payload' });

    try {
      const repositoryResult = await repository.confirmMapping({
        empresaId: empresaId.trim(),
        merchantId: input.merchantId,
        externalItemId: input.externalItemId,
        productId: input.productId,
        externalCode: input.externalCode,
        action: input.action,
        signal
      });
      return mapConfirmOutcome(repositoryResult);
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  return Object.freeze({ suggest, confirm });
}

export default createIfoodProductMappingService;
