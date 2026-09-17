// Self-service iFood connection: repository + orchestration for
// `/api/integrations/ifood/connection`, `/authorization` and `/health`.
//
// Kept SvelteKit/`$env`-free (like `productMappingService.js`) so it stays
// testable with a fake `supabase`/adapter. The route files own auth headers,
// `$env`, and `supabaseAdmin`; this module owns the policy: entitlement,
// capability, the CSRF-safe authorization state, and the "no active orders"
// gate before pausing/disconnecting a merchant.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isSubscriptionActiveStrict } from '../../subscriptionStatus.js';
import { isValidPlanTier } from '../../pricing.js';
import { evaluateConnectionHealth } from './connectionHealth.js';

// Independent of `src/lib/server/accessControl.js` on purpose (same reason
// `productMappingService.js` defines its own permission constants): this
// module has no `$env`/`supabaseAdmin` dependency, so it must not pull in
// the heavier server-only accessControl module transitively. The string
// itself is the single source of truth and must stay identical to
// `IFOOD_INTEGRATION_PERMISSION` in both `accessControl.js` files.
const IFOOD_INTEGRATION_PERMISSION = 'integracoes.ifood.gerenciar';

// A pending connection stays authorizable for 30 minutes; after that the
// owner must resubmit the merchantId (a fresh `pending` row/state) rather
// than confirm a stale attempt. Chosen to comfortably cover a human
// completing the authorization step on iFood's own Partner Portal.
const AUTHORIZATION_WINDOW_MS = 30 * 60 * 1000;

// iFood's official self-service authorization contract for third-party
// self-onboarding is NOT confirmed for this app (see
// docs/integrations/ifood/CONTRACT_SNAPSHOT.md, "Conexão de lojista em
// produção: Não concluída"). This URL is a generic entry point, not a
// verified deep link, and is overridable so ops can correct it without a
// code change once iFood confirms the real flow.
const DEFAULT_PARTNER_PORTAL_URL = 'https://portal.ifood.com.br/';

const ACTIVE_ORDER_TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'rejected']);
const CONNECTION_STATUSES = new Set(['pending', 'active', 'degraded', 'paused', 'revoked']);

function result(status, body) {
  return { status, body };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getUserId(authResult) {
  return authResult?.user?.id ?? authResult?.data?.user?.id ?? null;
}

/**
 * Owners always manage their own iFood connection. Sub-users need the
 * `integracoes.ifood.gerenciar` capability explicitly set on their role.
 * Identical rule to both `accessControl.js` copies (Task 17).
 */
export function canManageIfoodConnection(accessContext) {
  if (!accessContext) return false;
  if (!accessContext.isSubUser) return true;
  return accessContext.permissions?.[IFOOD_INTEGRATION_PERMISSION] === true;
}

/**
 * Eligibility is "plano padrão (R$59+), planos superiores ou trial ativo,
 * sem add-on": every plan in the catalog already costs R$59+, so this is
 * simply "the owner has an active or trialing subscription in good
 * standing" — no add-on flag, no plan-tier allowlist beyond validity.
 */
export function isIfoodEligibleSubscription(subscription) {
  if (!isSubscriptionActiveStrict(subscription)) return false;
  return isValidPlanTier(subscription?.plan_tier);
}

function sanitizeMerchantId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * CSRF-safe correlation token for the authorization step. Deterministic
 * (HMAC over connectionId + merchantId + the timestamp of the last
 * transition into `pending`) rather than a stored random nonce, so it
 * survives a browser refresh mid-flow without a dedicated DB column: the
 * server always recomputes the same value for the same still-pending
 * connection, and a transition out of `pending` (activated, or restarted
 * with a new `updated_at`) changes the input and invalidates every
 * previously issued token — which is exactly the replay protection the
 * matrix in Task 17's Step 1 exercises.
 */
function computeAuthorizationState({ connectionId, merchantId, pendingSince, secret }) {
  if (!secret) return null;
  const material = `${connectionId}:${merchantId}:${pendingSince}`;
  return createHmac('sha256', secret).update(material).digest('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function mapConnectionRow(row) {
  if (!row) return null;
  return {
    connectionId: row.connectionId ?? row.connection_id ?? null,
    merchantId: row.merchantId ?? row.merchant_id ?? null,
    status: row.status ?? null,
    printOwner: row.printOwner ?? row.print_owner ?? 'zelo',
    lastWebhookAt: row.lastWebhookAt ?? row.last_webhook_at ?? null,
    lastPollAt: row.lastPollAt ?? row.last_poll_at ?? null,
    lastTokenAt: row.lastTokenAt ?? row.last_token_at ?? null,
    workerHeartbeatAt: row.workerHeartbeatAt ?? row.worker_heartbeat_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null
  };
}

function connectionSnapshot(connection) {
  if (!connection) return { status: 'not_connected', merchantId: null, printOwner: null };
  return {
    status: connection.status,
    merchantId: connection.merchantId,
    printOwner: connection.printOwner
  };
}

function repositoryError() {
  return new Error('iFood connection repository operation failed');
}

/**
 * @param {{ supabase: { rpc: Function } }} deps
 */
export function createIfoodConnectionRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodConnectionRepository requires a supabase client with rpc()');
  }

  async function getConnection({ empresaId, signal } = {}) {
    let response;
    try {
      response = await supabase
        .rpc('get_ifood_connection_v1', { p_empresa_id: empresaId })
        .maybeSingle();
    } catch {
      throw repositoryError();
    }
    if (response?.error) throw repositoryError();
    return mapConnectionRow(response?.data);
  }

  async function upsertConnection({ empresaId, merchantId, status, signal } = {}) {
    let response;
    try {
      response = await supabase
        .rpc('upsert_ifood_connection_v1', {
          p_empresa_id: empresaId,
          p_merchant_id: merchantId,
          p_status: status
        })
        .single();
    } catch {
      throw repositoryError();
    }
    if (response?.error) throw repositoryError();
    const data = response?.data;
    return {
      outcome: data?.outcome ?? null,
      connectionId: data?.connectionId ?? data?.connection_id ?? null,
      merchantId: data?.merchantId ?? data?.merchant_id ?? null,
      status: data?.status ?? null
    };
  }

  async function countActiveOrders({ connectionId, signal } = {}) {
    let response;
    try {
      response = await supabase.rpc('count_ifood_active_orders_v1', {
        p_connection_id: connectionId
      });
    } catch {
      throw repositoryError();
    }
    if (response?.error) throw repositoryError();
    const value = response?.data;
    return Number.isInteger(value) ? value : Number(value ?? 0);
  }

  async function setPrintOwner({ empresaId, printOwner, signal } = {}) {
    let response;
    try {
      response = await supabase
        .rpc('set_ifood_connection_print_owner_v1', {
          p_empresa_id: empresaId,
          p_print_owner: printOwner
        })
        .single();
    } catch {
      throw repositoryError();
    }
    if (response?.error) throw repositoryError();
    const data = response?.data;
    return {
      outcome: data?.outcome ?? null,
      connectionId: data?.connectionId ?? data?.connection_id ?? null,
      merchantId: data?.merchantId ?? data?.merchant_id ?? null,
      printOwner: data?.printOwner ?? data?.print_owner ?? null
    };
  }

  return Object.freeze({ getConnection, upsertConnection, countActiveOrders, setPrintOwner });
}

/**
 * @param {{
 *   repository: { getConnection: Function, upsertConnection: Function, countActiveOrders: Function },
 *   adapter: { connectMerchant: Function },
 *   clock?: () => number,
 *   stateSecret: string,
 *   partnerPortalUrl?: string
 * }} deps
 */
export function createIfoodConnectionService({
  repository,
  adapter,
  clock = () => Date.now(),
  stateSecret,
  partnerPortalUrl = DEFAULT_PARTNER_PORTAL_URL
} = {}) {
  if (!repository
    || typeof repository.getConnection !== 'function'
    || typeof repository.upsertConnection !== 'function'
    || typeof repository.countActiveOrders !== 'function') {
    throw new TypeError('createIfoodConnectionService requires a connection repository');
  }
  if (!adapter || typeof adapter.connectMerchant !== 'function') {
    throw new TypeError('createIfoodConnectionService requires an adapter with connectMerchant()');
  }

  function authorize({ authResult, accessContext, subscription } = {}) {
    const userId = getUserId(authResult);
    if (!isNonEmptyString(userId)) return { error: result(401, { error: 'unauthorized' }) };
    if (!accessContext) return { error: result(401, { error: 'unauthorized' }) };
    if (!canManageIfoodConnection(accessContext)) {
      return { error: result(403, { error: 'forbidden' }) };
    }
    if (!isIfoodEligibleSubscription(subscription)) {
      return { error: result(402, { error: 'subscription_required' }) };
    }
    return { userId };
  }

  function authorizationPrompt(connection) {
    if (!connection) return { status: 'not_connected' };
    if (connection.status !== 'pending') {
      return { status: connection.status, merchantId: connection.merchantId };
    }
    const pendingSince = connection.updatedAt;
    const pendingSinceMs = timestampMs(pendingSince);
    const nowMs = clock();
    if (pendingSinceMs === null || nowMs - pendingSinceMs > AUTHORIZATION_WINDOW_MS) {
      return { status: 'expired', merchantId: connection.merchantId };
    }
    const state = computeAuthorizationState({
      connectionId: connection.connectionId,
      merchantId: connection.merchantId,
      pendingSince,
      secret: stateSecret
    });
    if (!state) return { status: 'expired', merchantId: connection.merchantId };
    return {
      status: 'pending',
      merchantId: connection.merchantId,
      state,
      authorizationUrl: partnerPortalUrl,
      expiresAt: new Date(pendingSinceMs + AUTHORIZATION_WINDOW_MS).toISOString()
    };
  }

  /** GET /api/integrations/ifood/connection */
  async function getStatus({ authResult, accessContext, subscription, empresaId, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      return result(200, {
        ...connectionSnapshot(connection),
        authorization: connection ? authorizationPrompt(connection) : null
      });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /** POST /api/integrations/ifood/connection — starts (or restarts) a connection. */
  async function startConnection({ authResult, accessContext, subscription, empresaId, body, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    const merchantId = sanitizeMerchantId(body?.merchantId);
    if (!merchantId) return result(400, { error: 'invalid_merchant_id' });

    try {
      const existing = await repository.getConnection({ empresaId, signal });
      if (existing && existing.merchantId !== merchantId && existing.status !== 'revoked') {
        return result(409, {
          error: 'connection_already_exists',
          merchantId: existing.merchantId,
          status: existing.status
        });
      }

      // An already-active connection to the SAME merchant stays active — a
      // resubmission of the same merchantId must never demote it back to
      // pending. Everything else (first connect, retry after paused/
      // degraded/revoked) starts a fresh pending authorization window.
      const targetStatus = existing?.status === 'active' && existing.merchantId === merchantId
        ? 'active'
        : 'pending';

      const upserted = await repository.upsertConnection({ empresaId, merchantId, status: targetStatus, signal });
      if (upserted.outcome === 'merchant_taken') {
        return result(409, { error: 'merchant_already_connected' });
      }
      if (upserted.outcome !== 'created' && upserted.outcome !== 'updated') {
        return result(500, { error: 'unavailable' });
      }

      const connection = await repository.getConnection({ empresaId, signal });
      return result(upserted.outcome === 'created' ? 201 : 200, {
        ...connectionSnapshot(connection),
        authorization: authorizationPrompt(connection)
      });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /** GET /api/integrations/ifood/authorization — read-only prompt, no side effects. */
  async function getAuthorizationPrompt({ authResult, accessContext, subscription, empresaId, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      return result(200, authorizationPrompt(connection));
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /**
   * POST /api/integrations/ifood/authorization — the owner confirms they
   * completed authorization on iFood's side; this checks it against the
   * provider and, only then, flips `pending` to `active`.
   */
  async function checkAuthorization({ authResult, accessContext, subscription, empresaId, body, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    if (!isNonEmptyString(body?.state)) return result(400, { error: 'invalid_request' });

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      if (!connection) return result(404, { error: 'not_connected' });
      if (connection.status !== 'pending') {
        // Covers both a stale replay after the connection already moved on,
        // and CSRF: an authenticated caller cannot resurrect a finished or
        // never-started authorization by resubmitting an old token.
        return result(409, { error: 'connection_not_pending', status: connection.status });
      }

      const pendingSince = connection.updatedAt;
      const pendingSinceMs = timestampMs(pendingSince);
      if (pendingSinceMs === null || clock() - pendingSinceMs > AUTHORIZATION_WINDOW_MS) {
        return result(410, { error: 'authorization_expired' });
      }

      const expectedState = computeAuthorizationState({
        connectionId: connection.connectionId,
        merchantId: connection.merchantId,
        pendingSince,
        secret: stateSecret
      });
      if (!expectedState || !safeEqual(body.state, expectedState)) {
        return result(403, { error: 'invalid_state' });
      }

      let providerResult;
      try {
        providerResult = await adapter.connectMerchant({ merchantId: connection.merchantId, signal });
      } catch {
        return result(503, { error: 'unavailable' });
      }

      if (!providerResult?.connected) {
        return result(202, { status: 'pending', merchantId: connection.merchantId });
      }

      const activated = await repository.upsertConnection({
        empresaId,
        merchantId: connection.merchantId,
        status: 'active',
        signal
      });
      if (activated.outcome !== 'updated' && activated.outcome !== 'created') {
        return result(500, { error: 'unavailable' });
      }
      return result(200, { status: 'active', merchantId: connection.merchantId });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /** PATCH /api/integrations/ifood/connection — pause | resume | disconnect. */
  async function updateConnectionStatus({ authResult, accessContext, subscription, empresaId, body, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
    const ACTION_TARGET = { pause: 'paused', resume: 'active', disconnect: 'revoked' };
    const targetStatus = ACTION_TARGET[action];
    if (!targetStatus) return result(400, { error: 'invalid_action' });

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      if (!connection) return result(404, { error: 'not_connected' });
      if (connection.status === 'revoked') return result(409, { error: 'connection_revoked' });

      if (action === 'pause' || action === 'disconnect') {
        const activeOrders = await repository.countActiveOrders({ connectionId: connection.connectionId, signal });
        if (activeOrders > 0) {
          return result(409, { error: 'active_orders_present', count: activeOrders });
        }
      }

      const updated = await repository.upsertConnection({
        empresaId,
        merchantId: connection.merchantId,
        status: targetStatus,
        signal
      });
      if (updated.outcome !== 'updated' && updated.outcome !== 'created') {
        return result(500, { error: 'unavailable' });
      }
      return result(200, { status: targetStatus, merchantId: connection.merchantId });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /**
   * PATCH /api/integrations/ifood/connection — `{ printOwner: 'zelo' | 'external' }`.
   * Setup wizard step 6 (design doc 3.1): the owner picks exactly one system
   * that prints iFood orders. Independent of `updateConnectionStatus` — this
   * never touches `status` and is never subject to the active-orders gate
   * (choosing who prints does not stop/start the connection).
   */
  async function updatePrintOwner({ authResult, accessContext, subscription, empresaId, body, signal } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    const printOwner = typeof body?.printOwner === 'string' ? body.printOwner.trim().toLowerCase() : '';
    if (printOwner !== 'zelo' && printOwner !== 'external') {
      return result(400, { error: 'invalid_print_owner' });
    }
    if (typeof repository.setPrintOwner !== 'function') {
      return result(503, { error: 'unavailable' });
    }

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      if (!connection) return result(404, { error: 'not_connected' });

      const updated = await repository.setPrintOwner({ empresaId, printOwner, signal });
      if (updated.outcome === 'not_connected') return result(404, { error: 'not_connected' });
      if (updated.outcome !== 'updated') return result(500, { error: 'unavailable' });
      return result(200, { printOwner: updated.printOwner ?? printOwner });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  /** GET /api/integrations/ifood/health — sanitized, no payload/PII. */
  async function getHealth({
    authResult,
    accessContext,
    subscription,
    empresaId,
    workerHeartbeatAt,
    lastTokenAt,
    signal
  } = {}) {
    const access = authorize({ authResult, accessContext, subscription });
    if (access.error) return access.error;

    try {
      const connection = await repository.getConnection({ empresaId, signal });
      if (!connection) return result(404, { error: 'not_connected' });

      const evaluation = evaluateConnectionHealth({
        connection: {
          merchantId: connection.merchantId,
          status: connection.status,
          workerHeartbeatAt: connection.workerHeartbeatAt,
          lastPollAt: connection.lastPollAt,
          lastTokenAt: connection.lastTokenAt,
          configurationValid: true
        },
        workerHeartbeatAt: workerHeartbeatAt ?? connection.workerHeartbeatAt,
        lastTokenAt: lastTokenAt ?? connection.lastTokenAt,
        now: clock()
      });

      return result(200, {
        merchantId: connection.merchantId,
        status: connection.status,
        healthy: evaluation.healthy,
        reasons: evaluation.reasons
      });
    } catch {
      return result(500, { error: 'unavailable' });
    }
  }

  return Object.freeze({
    getStatus,
    startConnection,
    getAuthorizationPrompt,
    checkAuthorization,
    updateConnectionStatus,
    updatePrintOwner,
    getHealth
  });
}

export const IFOOD_CONNECTION_STATUSES = Object.freeze([...CONNECTION_STATUSES]);
export const IFOOD_PRINT_OWNERS = Object.freeze(['zelo', 'external']);
export const IFOOD_CONNECTION_ACTIVE_ORDER_TERMINAL_STATUSES = Object.freeze([...ACTIVE_ORDER_TERMINAL_STATUSES]);
export const IFOOD_CONNECTION_AUTHORIZATION_WINDOW_MS = AUTHORIZATION_WINDOW_MS;

export default createIfoodConnectionService;
