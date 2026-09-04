import {
  formatPaymentMethod,
  isCashPaymentMethod,
  normalizePaymentMethodId
} from './finance/paymentMethods.js';
import { canonicalFulfillmentMode, canonicalPaymentMethod } from './onlineOrders.js';

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function sanitizeVisibleText(value) {
  return typeof value === 'string'
    ? value.replace(/[—–]/g, ' - ').replace(/\s+/g, ' ').trim()
    : value;
}

function formatPostalCode(value) {
  const postalCode = String(value || '').replace(/\D/g, '');
  return postalCode.length === 8
    ? `${postalCode.slice(0, 5)}-${postalCode.slice(5)}`
    : sanitizeVisibleText(value) || null;
}

export function getOrderDeliveryPresentation(order) {
  const fulfillment = order?.fulfillment || {};
  const isDelivery = canonicalFulfillmentMode(order) === 'delivery';
  const kind = isDelivery ? 'delivery' : 'pickup';

  if (!isDelivery) {
    return {
      kind,
      label: 'Retirada',
      address: null,
      complement: null,
      neighborhood: null,
      cityState: null,
      postalCode: null,
      distanceM: null,
      fee: 0,
      asap: Boolean(fulfillment.asap),
      pickupDate: firstValue(fulfillment, ['pickupDate', 'pickup_date']),
      pickupTime: firstValue(fulfillment, ['pickupTime', 'pickup_time'])
    };
  }

  const street = firstValue(fulfillment, ['deliveryStreet', 'delivery_street']);
  const number = firstValue(fulfillment, ['deliveryNumber', 'delivery_number']);
  const address = street
    ? [street, number].filter(Boolean).map(sanitizeVisibleText).join(', ')
    : sanitizeVisibleText(firstValue(fulfillment, ['deliveryAddress', 'delivery_address', 'address']));
  const city = sanitizeVisibleText(firstValue(fulfillment, ['deliveryCity', 'delivery_city']));
  const state = sanitizeVisibleText(firstValue(fulfillment, ['deliveryState', 'delivery_state']));

  return {
    kind,
    label: 'Entrega',
    address: address || null,
    complement: sanitizeVisibleText(firstValue(fulfillment, ['deliveryComplement', 'delivery_complement'])),
    neighborhood: sanitizeVisibleText(firstValue(fulfillment, ['deliveryNeighborhood', 'delivery_neighborhood'])),
    cityState: [city, state].filter(Boolean).join(' - ') || null,
    postalCode: formatPostalCode(firstValue(fulfillment, ['deliveryPostalCode', 'delivery_postal_code'])),
    distanceM: numberOrNull(firstValue(fulfillment, ['deliveryDistanceM', 'delivery_distance_m'])),
    fee: numberOrNull(firstValue(fulfillment, ['deliveryFee', 'delivery_fee']))
      ?? numberOrNull(order?.delivery_fee)
      ?? 0,
    asap: Boolean(fulfillment.asap),
    pickupDate: firstValue(fulfillment, ['pickupDate', 'pickup_date']),
    pickupTime: firstValue(fulfillment, ['pickupTime', 'pickup_time'])
  };
}

export function getOrderPaymentPresentation(order) {
  const payment = order?.payment || {};
  const method = canonicalPaymentMethod(order);
  const id = normalizePaymentMethodId(method);
  const isCash = isCashPaymentMethod(method);
  const received = numberOrNull(firstValue(payment, [
    'cashReceived', 'cash_received', 'valorRecebido', 'valor_recebido', 'amountReceived', 'amount_received'
  ]) ?? firstValue(order, ['cashReceived', 'cash_received', 'valorRecebido', 'valor_recebido']));
  const change = numberOrNull(firstValue(payment, [
    'change', 'troco', 'valorTroco', 'valor_troco'
  ]) ?? firstValue(order, ['change', 'troco', 'valorTroco', 'valor_troco']));

  return {
    id,
    label: formatPaymentMethod(method),
    isCash,
    received,
    change,
    hasCashSettlement: isCash && (received !== null || change !== null)
  };
}
