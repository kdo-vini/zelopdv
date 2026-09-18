import {
  IFOOD_ORDER_CONTRACT_KEYS,
  IfoodOrderContractError,
  normalizeIfoodExternalStatus,
  normalizeIfoodStatus,
  readIfoodEventStatus
} from './contracts.js';
import { PAYMENT_METHOD_IDS, normalizePaymentMethodId } from '../../finance/paymentMethods.js';

export { IfoodOrderContractError } from './contracts.js';

const ORDER_TYPES = new Set(['DELIVERY', 'TAKEOUT']);
const ORDER_TIMINGS = new Set(['IMMEDIATE', 'SCHEDULED']);
const DELIVERY_PROVIDERS = new Set(['IFOOD', 'MERCHANT']);
const MONEY_TOLERANCE = 0.01;

const hasValue = (value) => value !== undefined && value !== null;

function fail(message, field = null) {
  throw new IfoodOrderContractError(message, field);
}

function objectOrFail(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object', field);
  return value;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail('required non-empty string', field);
  return value;
}

function enumValue(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    fail(`must be one of ${[...allowed].join(', ')}`, field);
  }
  return value;
}

function requiredMoney(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail('must be a finite non-negative number', field);
  }
  return value;
}

function optionalMoney(value, field) {
  return hasValue(value) ? requiredMoney(value, field) : 0;
}

function requiredQuantity(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail('must be a finite positive number', field);
  }
  return value;
}

function timestamp(value, field) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail('must be a valid timestamp', field);
  }
  return value;
}

function closeEnough(left, right) {
  return Math.abs(left - right) <= MONEY_TOLERANCE;
}

function cloneOperationalValue(value) {
  if (Array.isArray(value)) return value.map(cloneOperationalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneOperationalValue(nested)]));
  }
  return value;
}

function pickOperationalFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(fields
    .filter((field) => Object.prototype.hasOwnProperty.call(value, field) && value[field] !== undefined)
    .map((field) => [field, cloneOperationalValue(value[field])]));
}

function normalizeOption(option = {}, itemIndex, optionIndex) {
  objectOrFail(option, `items[${itemIndex}].options[${optionIndex}]`);
  const field = (name) => `items[${itemIndex}].options[${optionIndex}].${name}`;
  return {
    id: option.id ?? null,
    externalId: option.id ?? null,
    externalCode: option.externalCode ?? null,
    name: requiredString(option.name, field('name')),
    groupName: option.groupName ?? option.group?.name ?? null,
    quantity: requiredQuantity(option.quantity, field('quantity')),
    unitPrice: requiredMoney(option.unitPrice, field('unitPrice')),
    price: requiredMoney(option.price, field('price')),
    addition: optionalMoney(option.addition, field('addition'))
  };
}

function normalizeItem(item = {}, position) {
  objectOrFail(item, `items[${position}]`);
  const field = (name) => `items[${position}].${name}`;
  const options = hasValue(item.options)
    ? (Array.isArray(item.options)
      ? item.options.map((option, index) => normalizeOption(option, position, index))
      : fail('must be an array', field('options')))
    : [];
  const totalPrice = requiredMoney(item.totalPrice, field('totalPrice'));
  const price = requiredMoney(item.price, field('price'));

  return {
    id: item.id ?? null,
    externalId: item.id ?? item.uniqueId ?? null,
    uniqueId: item.uniqueId ?? null,
    externalCode: item.externalCode ?? null,
    name: requiredString(item.name, field('name')),
    quantity: requiredQuantity(item.quantity, field('quantity')),
    unit: item.unit ?? null,
    unitPrice: requiredMoney(item.unitPrice, field('unitPrice')),
    price,
    optionsPrice: optionalMoney(item.optionsPrice, field('optionsPrice')),
    totalPrice,
    subtotal: totalPrice,
    observations: item.observations ?? null,
    position: item.index ?? position + 1,
    options
  };
}

function normalizeFulfillment(order) {
  const orderType = enumValue(order.orderType, ORDER_TYPES, 'orderType');
  const orderTiming = enumValue(order.orderTiming, ORDER_TIMINGS, 'orderTiming');
  const delivery = order.delivery == null ? null : objectOrFail(order.delivery, 'delivery');
  const takeout = order.takeout == null ? null : objectOrFail(order.takeout, 'takeout');
  const schedule = order.schedule == null ? null : objectOrFail(order.schedule, 'schedule');

  if (orderType === 'DELIVERY' && !delivery) fail('delivery details are required for DELIVERY', 'delivery');
  if (orderType === 'TAKEOUT' && !takeout) fail('takeout details are required for TAKEOUT', 'takeout');
  if (orderType === 'DELIVERY') {
    enumValue(delivery.deliveredBy, DELIVERY_PROVIDERS, 'delivery.deliveredBy');
  } else if (delivery?.deliveredBy !== undefined && delivery.deliveredBy !== null) {
    enumValue(delivery.deliveredBy, DELIVERY_PROVIDERS, 'delivery.deliveredBy');
  }
  if (orderTiming === 'SCHEDULED') {
    if (!schedule) fail('schedule details are required for SCHEDULED', 'schedule');
    timestamp(schedule.deliveryDateTimeStart, 'schedule.deliveryDateTimeStart');
    timestamp(schedule.deliveryDateTimeEnd, 'schedule.deliveryDateTimeEnd');
  }

  const deliveredBy = delivery?.deliveredBy ? String(delivery.deliveredBy) : null;
  if (delivery?.deliveryDateTime !== undefined && delivery.deliveryDateTime !== null) {
    timestamp(delivery.deliveryDateTime, 'delivery.deliveryDateTime');
  }
  if (takeout?.takeoutDateTime !== undefined && takeout.takeoutDateTime !== null) {
    timestamp(takeout.takeoutDateTime, 'takeout.takeoutDateTime');
  }

  const scheduleWindow = schedule
    ? {
        start: schedule.deliveryDateTimeStart,
        end: schedule.deliveryDateTimeEnd,
        deliveryDateTimeStart: schedule.deliveryDateTimeStart,
        deliveryDateTimeEnd: schedule.deliveryDateTimeEnd
      }
    : null;

  return {
    orderType,
    orderTiming,
    mode: orderType === 'DELIVERY' ? 'delivery' : 'retirada',
    type: orderType === 'DELIVERY' ? 'delivery' : 'takeout',
    deliveredBy,
    provider: deliveredBy ? deliveredBy.toLowerCase() : null,
    deliveryDateTime: delivery?.deliveryDateTime ?? null,
    pickupDateTime: takeout?.takeoutDateTime ?? null,
    observations: delivery?.observations ?? takeout?.observations ?? null,
    schedule: scheduleWindow
  };
}

const IFOOD_PAYMENT_TO_NATIVE = Object.freeze({
  CASH: PAYMENT_METHOD_IDS.DINHEIRO,
  CREDIT: PAYMENT_METHOD_IDS.CARTAO_CREDITO,
  DEBIT: PAYMENT_METHOD_IDS.CARTAO_DEBITO,
  PIX: PAYMENT_METHOD_IDS.PIX,
  MEAL_VOUCHER: PAYMENT_METHOD_IDS.VALE_REFEICAO,
  FOOD_VOUCHER: PAYMENT_METHOD_IDS.VALE_REFEICAO
});

function externalPaymentToken(value, field) {
  const code = requiredString(value, field)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return code;
}

function canonicalPaymentMethodId(code) {
  const mapped = IFOOD_PAYMENT_TO_NATIVE[code];
  if (mapped) return mapped;
  const configured = normalizePaymentMethodId(code);
  const nativeIds = new Set(Object.values(PAYMENT_METHOD_IDS));
  if (nativeIds.has(configured) && configured !== PAYMENT_METHOD_IDS.MULTIPLO) return configured;
  // Unknown provider methods remain traceable but cannot be mistaken for a
  // local financial method. The token is code-only and contains no PII.
  return `ifood:${code.toLowerCase()}`;
}

function normalizePaymentMethod(method = {}, index) {
  objectOrFail(method, `payments.methods[${index}]`);
  const field = (name) => `payments.methods[${index}].${name}`;
  const externalMethod = externalPaymentToken(method.method, field('method'));
  const value = requiredMoney(method.value, field('value'));
  const normalized = {
    value,
    currency: requiredString(method.currency, field('currency')),
    type: requiredString(method.type, field('type')).toUpperCase(),
    method: externalMethod,
    externalMethod,
    methodId: canonicalPaymentMethodId(externalMethod),
    prepaid: method.prepaid
  };
  if (typeof method.prepaid !== 'boolean') fail('must be boolean', field('prepaid'));
  if (method.cash) {
    objectOrFail(method.cash, field('cash'));
    normalized.cash = { changeFor: optionalMoney(method.cash.changeFor, field('cash.changeFor')) };
  }
  if (method.card) {
    objectOrFail(method.card, field('card'));
    normalized.card = { brand: method.card.brand ?? null };
  }
  if (method.wallet) {
    objectOrFail(method.wallet, field('wallet'));
    normalized.wallet = { name: method.wallet.name ?? null };
  }
  return normalized;
}

function normalizePayment(payments) {
  objectOrFail(payments, 'payments');
  const prepaid = requiredMoney(payments.prepaid, 'payments.prepaid');
  const pending = requiredMoney(payments.pending, 'payments.pending');
  if (!Array.isArray(payments.methods) || payments.methods.length === 0) {
    fail('must contain at least one method', 'payments.methods');
  }
  const methods = payments.methods.map(normalizePaymentMethod);
  const declaredMethod = methods.length === 1 ? methods[0].methodId : null;

  return {
    prepaid,
    pending,
    declaredMethod,
    method: declaredMethod,
    isSplit: methods.length > 1,
    methods
  };
}

function normalizeTotals(order, items) {
  const total = objectOrFail(order.total, 'total');
  const subTotal = requiredMoney(total.subTotal ?? total.subtotal, 'total.subTotal');
  const deliveryFee = optionalMoney(total.deliveryFee, 'total.deliveryFee');
  const additionalFeesFromLines = Array.isArray(order.additionalFees)
    ? order.additionalFees.reduce((sum, fee, index) => {
        objectOrFail(fee, `additionalFees[${index}]`);
        return sum + requiredMoney(fee.value, `additionalFees[${index}].value`);
      }, 0)
    : 0;
  const additionalFees = hasValue(total.additionalFees)
    ? requiredMoney(total.additionalFees, 'total.additionalFees')
    : additionalFeesFromLines;
  const benefitsFromLines = Array.isArray(order.benefits)
    ? order.benefits.reduce((sum, benefit, index) => {
        objectOrFail(benefit, `benefits[${index}]`);
        return sum + requiredMoney(benefit.value, `benefits[${index}].value`);
      }, 0)
    : 0;
  const benefits = hasValue(total.benefits)
    ? requiredMoney(total.benefits, 'total.benefits')
    : benefitsFromLines;
  const orderAmount = requiredMoney(total.orderAmount, 'total.orderAmount');
  if (Array.isArray(order.additionalFees) && !closeEnough(additionalFeesFromLines, additionalFees)) {
    fail('does not reconcile with fee lines', 'total.additionalFees');
  }
  const itemSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  if (!closeEnough(itemSubtotal, subTotal)) {
    fail('does not reconcile with item totals', 'total.subTotal');
  }
  const expectedOrderAmount = subTotal + deliveryFee + additionalFees - benefits;
  if (!closeEnough(expectedOrderAmount, orderAmount)) {
    fail(`does not reconcile (expected ${expectedOrderAmount}, received ${orderAmount})`, 'total.orderAmount');
  }

  return {
    subTotal,
    subtotal: subTotal,
    deliveryFee,
    additionalFees,
    benefits,
    discounts: benefits,
    orderAmount,
    total: orderAmount
  };
}

function normalizeCustomerSnapshot(order) {
  const customer = order.customer && typeof order.customer === 'object'
    ? order.customer
    : {};

  const snapshot = {};
  if (Object.prototype.hasOwnProperty.call(customer, 'name') && customer.name !== undefined) {
    snapshot.name = cloneOperationalValue(customer.name);
  }

  const phone = pickOperationalFields(customer.phone, [
    'number',
    'localizer',
    'localizerExpiration'
  ]);
  if (phone) snapshot.phone = phone;

  const deliveryAddressSource = order.delivery?.deliveryAddress
    ?? order.delivery?.address
    ?? customer.deliveryAddress;
  const deliveryAddress = pickOperationalFields(deliveryAddressSource, [
    'streetName',
    'streetNumber',
    'formattedAddress',
    'neighborhood',
    'complement',
    'postalCode',
    'city',
    'state',
    'country',
    'reference'
  ]);
  if (deliveryAddress) {
    snapshot.deliveryAddress = deliveryAddress;
  }

  return snapshot;
}

function statusFromOrder(order) {
  const status = readIfoodEventStatus(order);
  return normalizeIfoodExternalStatus(status) || normalizeIfoodStatus(status) || 'PLACED';
}

function codeFor(order, fulfillment, kind) {
  const delivery = order.delivery && typeof order.delivery === 'object' ? order.delivery : {};
  const takeout = order.takeout && typeof order.takeout === 'object' ? order.takeout : {};
  const picking = order.picking && typeof order.picking === 'object' ? order.picking : {};
  const code = kind === 'pickup'
    ? delivery.pickupCode ?? takeout.pickupCode ?? picking.pickupCode ?? null
    : delivery.deliveryCode ?? delivery.verifyDeliveryCode ?? delivery.pickupCode ?? picking.deliveryCode ?? null;

  if (kind === 'pickup' && fulfillment.type === 'delivery' && fulfillment.deliveredBy !== 'IFOOD') return null;
  if (kind === 'delivery' && (fulfillment.type !== 'delivery' || fulfillment.deliveredBy === 'IFOOD')) return null;
  return code;
}

/**
 * Translate an iFood Order detail into the internal operational snapshot.
 * The returned object intentionally has no analytics or raw-payload field.
 * Buyer data remains only in `customerSnapshot`, where operational consumers
 * can use it without making it available to analytics projections.
 */
export function normalizeIfoodOrder(order) {
  objectOrFail(order, 'order');
  const externalOrderId = requiredString(order.id, 'id');
  const displayId = order.displayId == null ? null : requiredString(order.displayId, 'displayId');
  const merchantId = requiredString(order.merchant?.id ?? order.merchantId, 'merchant.id');
  const occurredAt = order.createdAt;
  timestamp(occurredAt, 'createdAt');
  const preparationStartAt = timestamp(order.preparationStartDateTime, 'preparationStartDateTime');
  const fulfillment = normalizeFulfillment(order);
  if (!Array.isArray(order.items) || order.items.length === 0) fail('must contain at least one item', 'items');
  const items = order.items.map(normalizeItem);

  const normalized = {
    externalOrderId,
    displayId,
    merchantId,
    externalStatus: statusFromOrder(order),
    occurredAt,
    customerSnapshot: normalizeCustomerSnapshot(order),
    fulfillment,
    payment: normalizePayment(order.payments),
    totals: normalizeTotals(order, items),
    items,
    scheduled: fulfillment.orderTiming === 'SCHEDULED',
    preparationStartAt,
    pickupCode: codeFor(order, fulfillment, 'pickup'),
    deliveryCode: codeFor(order, fulfillment, 'delivery')
  };

  if (Object.keys(normalized).some((key) => !IFOOD_ORDER_CONTRACT_KEYS.includes(key))) {
    throw new IfoodOrderContractError('unexpected output field');
  }
  return normalized;
}

export default normalizeIfoodOrder;
