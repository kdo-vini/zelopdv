// Browser-facing orchestration for iFood order commands. Authentication and
// access context are injected so this module remains independent of SvelteKit,
// Supabase, and the provider adapter.

export const IFOOD_COMMAND_PERMISSIONS = Object.freeze({
  confirm: 'pedidos.acessar',
  dispatch: 'pedidos.acessar',
  start_preparation: 'pedidos.cozinha',
  ready_to_pickup: 'pedidos.cozinha',
  cancel: 'pedidos.cancelar'
});

const VALID_INTENTS = new Set(Object.keys(IFOOD_COMMAND_PERMISSIONS));
const INTENT_ALIASES = Object.freeze({
  accept: 'confirm',
  reject: 'cancel'
});
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

export function permissionForIfoodIntent(intent) {
  return IFOOD_COMMAND_PERMISSIONS[intent] ?? null;
}

export function canUseIfoodIntent(accessContext, intent) {
  const permission = permissionForIfoodIntent(intent);
  if (!permission || !accessContext) return false;
  return !accessContext.isSubUser || accessContext.permissions?.[permission] === true;
}

function sanitizeCancellationPayload(body) {
  if (!isNonEmptyString(body?.cancellationCode)) return null;
  const cancellationCode = body.cancellationCode.trim();
  const rawReason = body.reason;
  if (rawReason !== undefined && rawReason !== null && typeof rawReason !== 'string') return null;
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (reason.length > 250) return null;
  return {
    cancellationCode,
    ...(reason ? { reason } : {})
  };
}

function validateInput({ empresaId, orderId, body }) {
  if (!isNonEmptyString(empresaId) || !isValidUuid(orderId)) return { code: 'invalid_input' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: 'invalid_payload' };

  const rawIntent = typeof body.intent === 'string' ? body.intent.trim().toLowerCase() : '';
  const intent = INTENT_ALIASES[rawIntent] || rawIntent;
  if (!VALID_INTENTS.has(intent)) return { code: 'invalid_payload' };

  const expectedRevision = body.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return { code: 'invalid_payload' };

  const payload = intent === 'cancel' ? sanitizeCancellationPayload(body) : {};
  if (payload === null) return { code: 'invalid_payload' };

  return { intent, expectedRevision, payload };
}

function mapRepositoryOutcome(repositoryResult) {
  const outcome = repositoryResult?.outcome;
  switch (outcome) {
    case 'queued':
    case 'requeued':
      return result(202, {
        commandId: repositoryResult.commandId ?? null,
        status: repositoryResult.status ?? 'queued'
      });
    case 'duplicate':
      return result(200, {
        commandId: repositoryResult.commandId ?? null,
        status: repositoryResult.status ?? 'queued'
      });
    case 'not_found':
      return result(404, { error: 'order_not_found' });
    case 'revision_conflict':
      return result(409, { error: 'revision_conflict' });
    case 'connection_unavailable':
      return result(409, { error: 'connection_unavailable' });
    case 'invalid_transition':
      return result(422, { error: 'invalid_transition' });
    case 'invalid_payload':
      return result(422, { error: 'invalid_payload' });
    default:
      return result(500, { error: 'unavailable' });
  }
}

function serverIdempotencyKey({ empresaId, orderId, intent, expectedRevision }) {
  // A client-provided idempotency key is intentionally ignored. The database
  // key is deterministic for the tenant/order/intent/revision tuple and the
  // RPC still enforces the same tuple independently of this string.
  return `ifood:command:v1:${empresaId}:${orderId}:${intent}:${expectedRevision}`;
}

/**
 * @param {{
 *   repository: { enqueueCommand: Function },
 *   accessResolver: (userId: string) => Promise<object>,
 *   clock?: () => number
 * }} deps
 */
export function createIfoodCommandService({ repository, accessResolver, clock: _clock } = {}) {
  if (!repository || typeof repository.enqueueCommand !== 'function') {
    throw new TypeError('createIfoodCommandService requires repository.enqueueCommand()');
  }
  if (typeof accessResolver !== 'function') {
    throw new TypeError('createIfoodCommandService requires an accessResolver()');
  }

  async function enqueueCommand({
    authResult,
    accessContext: providedAccessContext,
    empresaId,
    orderId,
    body,
    signal
  } = {}) {
    const userId = authResult?.user?.id ?? authResult?.data?.user?.id;
    if (!isNonEmptyString(userId)) return result(401, { error: 'unauthorized' });

    const input = validateInput({ empresaId, orderId, body });
    if (input.code === 'invalid_input') return result(400, { error: 'invalid_request' });
    if (input.code === 'invalid_payload') return result(422, { error: 'invalid_payload' });

    let accessContext;
    try {
      accessContext = providedAccessContext ?? await accessResolver(userId);
    } catch {
      return result(500, { error: 'unavailable' });
    }

    if (!canUseIfoodIntent(accessContext, input.intent)) {
      return result(403, { error: 'forbidden' });
    }

    try {
      const repositoryResult = await repository.enqueueCommand({
        empresaId: empresaId.trim(),
        zeloOrderId: orderId.trim(),
        intent: input.intent,
        expectedRevision: input.expectedRevision,
        payload: input.payload,
        idempotencyKey: serverIdempotencyKey({
          empresaId: empresaId.trim(),
          orderId: orderId.trim(),
          intent: input.intent,
          expectedRevision: input.expectedRevision
        }),
        signal
      });
      return mapRepositoryOutcome(repositoryResult);
    } catch {
      // Repository errors may include SQL text, query parameters, or provider
      // values. Only a stable response crosses the browser boundary.
      return result(500, { error: 'unavailable' });
    }
  }

  return Object.freeze({ enqueueCommand });
}

export default createIfoodCommandService;
