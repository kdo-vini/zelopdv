import { decideEventTransition } from './eventPolicy.js';
import { IfoodOrderContractError, normalizeIfoodOrder } from './orderNormalizer.js';

function operationError(name) {
  return new TypeError(`iFood adapter does not implement ${name}`);
}

function eventIdOf(event) {
  return event?.id ?? event?.eventId ?? null;
}

function insertedFrom(result) {
  if (result === undefined || result === null) return true;
  if (typeof result === 'boolean') return result;
  if (typeof result === 'object') {
    if (result.duplicate === true || result.inserted === false || result.created === false) return false;
    if (result.inserted === true || result.created === true) return true;
  }
  return true;
}

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : clock.now();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(value).toISOString();
}

/**
 * The domain module is the deep seam: policy and orchestration live here,
 * while adapters/repositories are injected and can vary without leaking their
 * protocol into callers. Its public interface intentionally stays small.
 */
export function createIfoodIntegration(deps = {}) {
  const { adapter, repository, clock = () => new Date() } = deps;
  if (!adapter || typeof adapter !== 'object') throw new TypeError('iFood adapter is required');
  if (!repository || typeof repository !== 'object') throw new TypeError('iFood repository is required');
  if (typeof clock !== 'function' && typeof clock?.now !== 'function') {
    throw new TypeError('iFood clock must be callable');
  }

  async function receiveEvent(event) {
    const eventId = eventIdOf(event);
    if (!event || typeof event !== 'object' || !eventId) {
      throw new TypeError('iFood event id is required');
    }

    if (typeof repository.appendEvent !== 'function') throw operationError('appendEvent');
    const current = typeof repository.getOrderState === 'function'
      ? await repository.getOrderState(event.orderId, event.merchantId)
      : null;
    const transition = decideEventTransition(current, event);
    let normalizedOrder = null;
    let contractError = null;
    const orderDetail = event.order ?? event.orderDetail;
    if (orderDetail) {
      try {
        normalizedOrder = normalizeIfoodOrder(orderDetail);
      } catch (error) {
        if (error instanceof IfoodOrderContractError) contractError = error;
        else throw error;
      }
    }

    const appendResult = await repository.appendEvent(event);

    const inserted = insertedFrom(appendResult);
    const mustQuarantine = transition.decision === 'quarantine' || contractError;
    if (mustQuarantine) {
      if (typeof repository.quarantineEvent !== 'function') throw operationError('quarantineEvent');
      await repository.quarantineEvent(event);
    }

    if (!inserted) {
      return {
        accepted: true,
        duplicate: true,
        quarantined: Boolean(mustQuarantine),
        eventId,
        decision: mustQuarantine ? 'quarantine' : 'ignore',
        reason: mustQuarantine ? (contractError?.code || transition.reason) : 'duplicate'
      };
    }

    return {
      accepted: true,
      duplicate: false,
      quarantined: Boolean(mustQuarantine),
      eventId,
      orderId: event.orderId ?? null,
      merchantId: event.merchantId ?? null,
      decision: transition.decision,
      reason: transition.reason,
      transition,
      order: normalizedOrder,
      contractError: contractError?.code ?? null,
      receivedAt: nowIso(clock)
    };
  }

  async function connectMerchant(input) {
    if (typeof adapter.connectMerchant !== 'function') throw operationError('connectMerchant');
    return adapter.connectMerchant(input);
  }

  async function requestOrderAction(input) {
    if (typeof adapter.requestOrderAction !== 'function') throw operationError('requestOrderAction');
    return adapter.requestOrderAction(input);
  }

  async function reconcileEvents(input) {
    if (typeof adapter.pollEvents !== 'function') throw operationError('pollEvents');
    return adapter.pollEvents(input);
  }

  /**
   * Thin passthrough to the adapter's own `getOrder`, added for Task 8's
   * event handler so it can fetch the full order detail needed to refresh
   * `zelo_orders`'s snapshot columns. Deliberately does not wrap, retry, or
   * reinterpret adapter errors (e.g. `IfoodHttpError` with
   * `code: 'IFOOD_HTTP_NOT_FOUND'`) — that policy (bounded 404 retry
   * window, generic classification of other errors) belongs to the caller,
   * not to this deep module, exactly like `requestOrderAction` and
   * `reconcileEvents` already leave their own retry/backoff policy to the
   * adapter or caller.
   */
  async function getOrderDetail(orderId, options = {}) {
    if (typeof adapter.getOrder !== 'function') throw operationError('getOrder');
    return adapter.getOrder(orderId, options);
  }

  async function getConnectionHealth(empresaId) {
    const result = typeof repository.getConnectionHealth === 'function'
      ? await repository.getConnectionHealth(empresaId)
      : undefined;
    if (result !== undefined) return result;
    const adapterResult = typeof adapter.getConnectionHealth === 'function'
      ? await adapter.getConnectionHealth(empresaId)
      : undefined;
    return adapterResult ?? { empresaId, status: 'unknown' };
  }

  return Object.freeze({
    connectMerchant,
    receiveEvent,
    requestOrderAction,
    reconcileEvents,
    getConnectionHealth,
    getOrderDetail
  });
}

export default createIfoodIntegration;
