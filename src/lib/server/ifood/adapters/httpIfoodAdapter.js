import { createIfoodTokenCache } from '../http/tokenCache.js';
import { abortableSleep, createIfoodRateLimiter } from '../http/rateLimit.js';
import { createIfoodRequestClient, IfoodHttpError } from '../http/request.js';

const DEFAULT_BASE_URL = 'https://merchant-api.ifood.com.br';
const MAX_ACK_IDS_PER_REQUEST = 10_000;

function requireNonEmptyId(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function encodeId(value) {
  return encodeURIComponent(value);
}

function joinedOrUndefined(values) {
  return Array.isArray(values) && values.length ? values.join(',') : undefined;
}

/**
 * Production iFood adapter matching the mock seam
 * (`src/lib/server/ifood/adapters/mockIfoodAdapter.js`) so
 * `createIfoodIntegration` can use either interchangeably. Every route below
 * comes from `docs/integrations/ifood/CONTRACT_SNAPSHOT.md`; nothing here
 * invents a route or a numeric limit the snapshot did not document.
 *
 * A `202` from any order action is HTTP acceptance only — per the global
 * plan constraint, commercial state changes only on a confirmed event, never
 * here.
 */
export function createHttpIfoodAdapter({
  clientId,
  clientSecret,
  fetch: fetchImpl = globalThis.fetch,
  clock = () => Date.now(),
  sleep = abortableSleep,
  random = Math.random,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs,
  retryBudgetMs,
  maxAttempts,
  tokenCache: injectedTokenCache,
  rateLimiter: injectedRateLimiter
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');

  const tokenCache = injectedTokenCache ?? createIfoodTokenCache({
    fetch: fetchImpl,
    clock,
    clientId,
    clientSecret,
    baseUrl
  });
  const rateLimiter = injectedRateLimiter ?? createIfoodRateLimiter({ clock, sleep });
  const { request } = createIfoodRequestClient({
    baseUrl,
    fetch: fetchImpl,
    tokenCache,
    rateLimiter,
    clock,
    sleep,
    random,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(retryBudgetMs !== undefined ? { retryBudgetMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {})
  });

  async function listMerchants({ signal } = {}) {
    // CONTRACT_SNAPSHOT.md #3 notes pagination "is documented" for this route,
    // but the page describing it returns 403 to fetchers, so the actual
    // page/size params and paginated response envelope are unconfirmed; this
    // only reads a single page. Not used by connectMerchant below (see its
    // own comment) precisely because a centralized app's merchant list can
    // span pages this call would never see.
    const { body } = await request({
      method: 'GET',
      path: '/merchant/v1.0/merchants',
      ...(signal ? { signal } : {})
    });
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.merchants)) return body.merchants;
    return [];
  }

  /**
   * The centralized-auth flow means the merchant authorizes Zelo on iFood's
   * side; there is no Zelo-initiated "connect" call in the contract. This
   * uses the per-merchant route the snapshot actually exercised
   * (CONTRACT_SNAPSHOT.md #3, `GET /merchants/{id}/status` observed `200`)
   * instead of `listMerchants`: that list route can paginate for a
   * centralized app (every merchant that ever authorized Zelo), and with its
   * pagination params unconfirmed, a merchant on page 2+ would be wrongly
   * reported `connected: false`. A 2xx here means the merchant status is
   * readable, so it is connected; a 403/404 (`IfoodHttpError.status`) means
   * it is not this app's merchant or does not exist, mapped to
   * `connected: false`. Every other error (401 after retry, 429, 5xx,
   * timeout, abort) propagates unchanged so an outage is never reported as
   * "not connected".
   */
  async function connectMerchant({ merchantId, signal } = {}) {
    const id = requireNonEmptyId(merchantId, 'merchantId');
    try {
      await getMerchantStatus(id, { signal });
      return { merchantId: id, connected: true };
    } catch (error) {
      if (error instanceof IfoodHttpError && (error.status === 403 || error.status === 404)) {
        return { merchantId: id, connected: false };
      }
      throw error;
    }
  }

  async function getMerchantStatus(merchantId, { signal } = {}) {
    const id = requireNonEmptyId(merchantId, 'merchantId');
    const { body } = await request({
      method: 'GET',
      path: `/merchant/v1.0/merchants/${encodeId(id)}/status`,
      ...(signal ? { signal } : {})
    });
    return body;
  }

  async function pollEvents({ merchantIds, types, groups, categories, signal } = {}) {
    const ids = Array.isArray(merchantIds) ? merchantIds.filter((id) => typeof id === 'string' && id) : [];
    if (ids.length === 0) throw new TypeError('merchantIds is required');

    const { status, body } = await request({
      method: 'GET',
      path: '/events/v1.0/events:polling',
      query: {
        types: joinedOrUndefined(types),
        groups: joinedOrUndefined(groups),
        categories: joinedOrUndefined(categories)
      },
      headers: { 'x-polling-merchants': ids.join(',') },
      ...(signal ? { signal } : {})
    });

    if (status === 204 || body === null || body === undefined) return [];
    return Array.isArray(body) ? body : [];
  }

  async function ackEvents(ids, { signal } = {}) {
    const list = Array.isArray(ids) ? ids : [];
    const unique = [...new Set(list.filter((id) => typeof id === 'string' && id))];
    if (unique.length === 0) return { accepted: true, ids: [] };

    if (unique.length > MAX_ACK_IDS_PER_REQUEST) {
      // The acknowledgment endpoint caps a single request at 10,000 ids
      // (CONTRACT_SNAPSHOT.md #4); chunk rather than fail the whole batch.
      let acceptedAll = true;
      for (let i = 0; i < unique.length; i += MAX_ACK_IDS_PER_REQUEST) {
        const chunk = unique.slice(i, i + MAX_ACK_IDS_PER_REQUEST);
        const result = await ackEvents(chunk, { signal });
        acceptedAll = acceptedAll && result.accepted;
      }
      return { accepted: acceptedAll, ids: unique };
    }

    await request({
      method: 'POST',
      path: '/events/v1.0/events/acknowledgment',
      body: unique.map((id) => ({ id })),
      // The ack is idempotent (re-acknowledging an id already acked is a
      // no-op for iFood), so — unlike order actions — an ambiguous timeout/
      // network/5xx here is safe to retry automatically.
      retryUnsafe: true,
      ...(signal ? { signal } : {})
    });
    return { accepted: true, ids: unique };
  }

  async function getOrder(orderId, { signal } = {}) {
    const id = requireNonEmptyId(orderId, 'orderId');
    try {
      const { body } = await request({
        method: 'GET',
        path: `/order/v1.0/orders/${encodeId(id)}`,
        ...(signal ? { signal } : {})
      });
      return body;
    } catch (error) {
      if (error instanceof IfoodHttpError && error.status === 404) {
        // CONTRACT_SNAPSHOT.md #6: a 404 shortly after PLACED is expected to
        // be transient. Surface it as a retryable-flagged error (never null)
        // so the Task 8 event handler can apply its own bounded backoff
        // instead of treating a missing detail as a crash.
        throw new IfoodHttpError({ status: 404, code: 'IFOOD_HTTP_NOT_FOUND', retryable: true });
      }
      throw error;
    }
  }

  async function postOrderAction(orderId, action, actionPath, body, { signal } = {}) {
    const id = requireNonEmptyId(orderId, 'orderId');
    // Order actions (confirm/startPreparation/.../requestCancellation) are
    // not idempotent from iFood's perspective: a second `POST` after an
    // ambiguous timeout/network/5xx could double-send a command such as
    // requestCancellation. `request()` defaults non-GET calls to
    // `retryUnsafe: false`, so those ambiguous failures surface immediately
    // (still `retryable: true`) instead of being auto-retried here — the
    // Task 10 command processor is what decides whether to safely re-send.
    const { status } = await request({
      method: 'POST',
      path: `/order/v1.0/orders/${encodeId(id)}${actionPath}`,
      ...(body !== undefined ? { body } : {}),
      ...(signal ? { signal } : {})
    });
    return {
      orderId: id,
      action,
      accepted: status === 202,
      status: status === 202 ? 'accepted_http' : `http_${status}`
    };
  }

  const confirm = (orderId, options) => postOrderAction(orderId, 'confirm', '/confirm', undefined, options);
  const startPreparation = (orderId, options) => postOrderAction(orderId, 'startPreparation', '/startPreparation', undefined, options);
  const readyToPickup = (orderId, options) => postOrderAction(orderId, 'readyToPickup', '/readyToPickup', undefined, options);
  const dispatch = (orderId, options) => postOrderAction(orderId, 'dispatch', '/dispatch', undefined, options);

  async function getCancellationReasons(orderId, { signal } = {}) {
    const id = requireNonEmptyId(orderId, 'orderId');
    const { body } = await request({
      method: 'GET',
      path: `/order/v1.0/orders/${encodeId(id)}/cancellationReasons`,
      ...(signal ? { signal } : {})
    });
    return Array.isArray(body) ? body : [];
  }

  function requestCancellation({ orderId, signal, ...rest } = {}) {
    return postOrderAction(orderId, 'requestCancellation', '/requestCancellation', rest, { signal });
  }

  const actionsByName = Object.freeze({
    confirm,
    startPreparation,
    readyToPickup,
    dispatch,
    requestCancellation
  });

  /** Compatible with the mock seam's `requestOrderAction({ orderId, action, ... })`. */
  async function requestOrderAction(input = {}) {
    const { orderId, action, signal, ...rest } = input;
    const handler = actionsByName[action];
    if (typeof handler !== 'function') {
      throw new TypeError(`Unsupported iFood order action: ${action}`);
    }
    return action === 'requestCancellation'
      ? handler({ orderId, signal, ...rest })
      : handler(orderId, { signal });
  }

  // `getConnectionHealth` is intentionally not implemented here:
  // `createIfoodIntegration.getConnectionHealth(empresaId)` needs to map an
  // internal `empresaId` to a provider `merchantId`/health signal, and this
  // adapter has no repository access to make that mapping — only
  // `httpIfoodAdapter`'s own `clientId`/`clientSecret`/`baseUrl` config. The
  // seam already treats it as optional and falls back to
  // `{ empresaId, status: 'unknown' }` when neither the repository nor the
  // adapter implement it.
  return Object.freeze({
    listMerchants,
    getMerchantStatus,
    connectMerchant,
    pollEvents,
    ackEvents,
    getOrder,
    confirm,
    startPreparation,
    readyToPickup,
    dispatch,
    getCancellationReasons,
    requestCancellation,
    requestOrderAction
  });
}

export const httpIfoodAdapter = createHttpIfoodAdapter;
export default createHttpIfoodAdapter;
