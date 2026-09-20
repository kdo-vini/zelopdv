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

function titleCaseToken(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

/**
 * When iFood (or another channel) stores card brand / wallet name on the
 * method snapshot, surface it next to the base label — e.g. OTHER + Visa →
 * "Outro (Visa)", DIGITAL_WALLET + Mercado Pago → "Carteira digital (Mercado Pago)".
 */
function firstPaymentMethodDetail(payment) {
  const methods = Array.isArray(payment?.methods) ? payment.methods : [];
  if (methods.length !== 1) return null;
  const method = methods[0];
  const brand = typeof method?.card?.brand === 'string' ? method.card.brand.trim() : '';
  if (brand) return titleCaseToken(brand);
  const wallet = typeof method?.wallet?.name === 'string' ? method.wallet.name.trim() : '';
  if (wallet) return titleCaseToken(wallet);
  return null;
}

function buildPaymentLabel(methodId, payment) {
  if (payment?.isSplit || (Array.isArray(payment?.methods) && payment.methods.length > 1)) {
    return formatPaymentMethod('multiplo');
  }

  const base = formatPaymentMethod(methodId);
  const detail = firstPaymentMethodDetail(payment);
  if (!detail) return base;
  if (base.toLowerCase().includes(detail.toLowerCase())) return base;
  return `${base} (${detail})`;
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
  const id = payment?.isSplit || (Array.isArray(payment?.methods) && payment.methods.length > 1)
    ? normalizePaymentMethodId('multiplo')
    : normalizePaymentMethodId(method);
  const isCash = isCashPaymentMethod(method);
  const received = numberOrNull(firstValue(payment, [
    'cashReceived', 'cash_received', 'valorRecebido', 'valor_recebido', 'amountReceived', 'amount_received'
  ]) ?? firstValue(order, ['cashReceived', 'cash_received', 'valorRecebido', 'valor_recebido']));
  const change = numberOrNull(firstValue(payment, [
    'change', 'troco', 'valorTroco', 'valor_troco'
  ]) ?? firstValue(order, ['change', 'troco', 'valorTroco', 'valor_troco']));

  return {
    id,
    label: buildPaymentLabel(method, payment),
    isCash,
    received,
    change,
    hasCashSettlement: isCash && (received !== null || change !== null)
  };
}

/**
 * iFood rarely exposes the real cellphone (LGPD). When a localizer is present,
 * `number` is the 0800 bridge used to reach the customer — not iFood support.
 */
export function getOrderCustomerPhonePresentation(order) {
  const ifood = order?.ifood && typeof order.ifood === 'object' ? order.ifood : {};
  const number = typeof ifood.phoneNumber === 'string' && ifood.phoneNumber.trim()
    ? ifood.phoneNumber.trim()
    : null;
  const localizer = typeof ifood.phoneLocalizer === 'string' && ifood.phoneLocalizer.trim()
    ? ifood.phoneLocalizer.trim()
    : null;
  const fallback = typeof order?.customer_phone === 'string' && order.customer_phone.trim()
    ? order.customer_phone.trim()
    : null;

  if (!number && !localizer && !fallback) {
    return { kind: 'none', number: null, localizer: null, label: null, hint: null, display: null };
  }

  if (localizer && number) {
    return {
      kind: 'ifood_bridge',
      number,
      localizer,
      label: 'Contato do cliente',
      hint: 'Ao ligar, digite o localizador para falar com o cliente.',
      display: `${number} (localizador ${localizer})`
    };
  }

  return {
    kind: 'direct',
    number: number || fallback,
    localizer: null,
    label: 'Telefone do cliente',
    hint: null,
    display: number || fallback
  };
}
