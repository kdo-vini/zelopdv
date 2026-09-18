function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]));
  return value;
}

function orderEntries(orders) {
  if (orders instanceof Map) return [...orders.entries()];
  if (Array.isArray(orders)) return orders.map((order) => [order.id, order]);
  if (orders && typeof orders === 'object') return Object.entries(orders);
  return [];
}

function responseFor(responses, name, input, fallback) {
  const configured = responses?.[name];
  if (configured === undefined) return clone(fallback);
  return typeof configured === 'function' ? configured(input) : clone(configured);
}

/**
 * In-memory adapter for the iFood seam. It performs no network or filesystem
 * work and returns copies, making repeated calls deterministic and isolated.
 */
export function createMockIfoodAdapter(config = {}) {
  const responses = config.responses || {};
  const orders = new Map(orderEntries(config.orders));
  const calls = [];
  const configuredAction = config.actionResult ?? responses.requestOrderAction;

  const record = (method, input) => {
    calls.push({ method, input: clone(input) });
  };

  return {
    calls,

    async connectMerchant(input = {}) {
      record('connectMerchant', input);
      return responseFor(responses, 'connectMerchant', input, {
        merchantId: input.merchantId,
        connected: true
      });
    },

    async listMerchants(input = {}) {
      record('listMerchants', input);
      return responseFor(responses, 'listMerchants', input, config.merchants || []);
    },

    async pollEvents(input = {}) {
      record('pollEvents', input);
      return responseFor(responses, 'pollEvents', input, config.events || []);
    },

    async ackEvents(input = []) {
      record('ackEvents', input);
      return responseFor(responses, 'ackEvents', input, {
        accepted: true,
        ids: Array.isArray(input) ? [...input] : []
      });
    },

    async getOrder(orderId) {
      record('getOrder', orderId);
      return responseFor(responses, 'getOrder', orderId, orders.get(orderId) || null);
    },

    async requestOrderAction(input = {}) {
      record('requestOrderAction', input);
      return responseFor(responses, 'requestOrderAction', input, configuredAction || {
        orderId: input.orderId,
        action: input.action,
        accepted: true,
        status: 'accepted_http'
      });
    }
  };
}

export const mockIfoodAdapter = createMockIfoodAdapter;
export default createMockIfoodAdapter;
