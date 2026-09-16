import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeIfoodOrder } from '../src/lib/server/ifood/orderNormalizer.js';

const loadFixture = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));

const orders = {
  ifoodDelivery: loadFixture('tests/fixtures/ifood/orders/immediate-ifood-delivery.json'),
  merchantDelivery: loadFixture('tests/fixtures/ifood/orders/immediate-merchant-delivery.json'),
  pickup: loadFixture('tests/fixtures/ifood/orders/immediate-pickup.json'),
  scheduled: loadFixture('tests/fixtures/ifood/orders/scheduled.json')
};

const contractKeys = [
  'externalOrderId',
  'merchantId',
  'externalStatus',
  'occurredAt',
  'customerSnapshot',
  'fulfillment',
  'payment',
  'totals',
  'items',
  'scheduled',
  'preparationStartAt',
  'pickupCode',
  'deliveryCode'
];

describe('normalizeIfoodOrder', () => {
  it.each(Object.entries(orders))('returns the internal contract for %s', (_, order) => {
    const normalized = normalizeIfoodOrder(order);

    expect(Object.keys(normalized).sort()).toEqual([...contractKeys].sort());
    expect(normalized).toMatchObject({
      externalOrderId: order.id,
      merchantId: order.merchant.id,
      externalStatus: 'PLACED',
      occurredAt: order.createdAt,
      scheduled: order.orderTiming === 'SCHEDULED',
      preparationStartAt: order.preparationStartDateTime
    });
    expect(normalized.customerSnapshot).toMatchObject({ id: order.customer.id, name: order.customer.name });
    expect(normalized).not.toHaveProperty('analytics');
    expect(normalized).not.toHaveProperty('raw');
  });

  it('distinguishes iFood delivery, merchant delivery and takeout codes', () => {
    const ifoodDelivery = normalizeIfoodOrder(orders.ifoodDelivery);
    const merchantDelivery = normalizeIfoodOrder(orders.merchantDelivery);
    const pickup = normalizeIfoodOrder(orders.pickup);

    expect(ifoodDelivery.fulfillment).toMatchObject({ mode: 'delivery', type: 'delivery', deliveredBy: 'IFOOD' });
    expect(ifoodDelivery.pickupCode).toBe('pickup-fixture');
    expect(ifoodDelivery.deliveryCode).toBeNull();
    expect(merchantDelivery.fulfillment).toMatchObject({ mode: 'delivery', type: 'delivery', deliveredBy: 'MERCHANT' });
    expect(merchantDelivery.pickupCode).toBeNull();
    expect(merchantDelivery.deliveryCode).toBe('delivery-fixture');
    expect(pickup.fulfillment).toMatchObject({ mode: 'retirada', type: 'takeout', deliveredBy: null });
  });

  it('preserves complementos, discounts and payment details in operational fields', () => {
    const normalized = normalizeIfoodOrder(orders.ifoodDelivery);
    const item = normalized.items[0];

    expect(item).toMatchObject({
      externalCode: 'product-fixture',
      name: 'Produto Fixture',
      quantity: 1,
      unitPrice: 22,
      totalPrice: 25
    });
    expect(item.options).toEqual([expect.objectContaining({
      externalCode: 'option-fixture',
      name: 'Complemento Fixture',
      groupName: 'Grupo Fixture',
      quantity: 1,
      price: 3
    })]);
    expect(item).not.toHaveProperty('complements');
    expect(item).not.toHaveProperty('modifiers');
    expect(normalized.totals).toMatchObject({ subTotal: 25, benefits: 2, discounts: 2, deliveryFee: 5, orderAmount: 29 });
    expect(normalized.payment).toMatchObject({
      prepaid: 29,
      pending: 0,
      declaredMethod: 'pix'
    });
    expect(normalized.payment.methods[0]).toMatchObject({ value: 29, type: 'ONLINE', method: 'PIX' });
  });

  it('keeps the buyer snapshot operational while leaving analytics free of PII', () => {
    const order = {
      ...orders.ifoodDelivery,
      customer: {
        ...orders.ifoodDelivery.customer,
        phone: 'phone-fixture',
        address: { street: 'address-fixture', number: '1' }
      }
    };

    const normalized = normalizeIfoodOrder(order);

    expect(normalized.customerSnapshot).toMatchObject({ phone: 'phone-fixture', address: { street: 'address-fixture' } });
    expect(normalized.analytics).toBeUndefined();
    expect(JSON.stringify(normalized)).toContain('phone-fixture');
  });

  it.each([
    ['missing item price', (order) => ({ ...order, items: [{ ...order.items[0], unitPrice: undefined }] })],
    ['non-money item price', (order) => ({ ...order, items: [{ ...order.items[0], unitPrice: 'not-money' }] })],
    ['NaN total', (order) => ({ ...order, total: { ...order.total, orderAmount: Number.NaN } })],
    ['invalid item quantity', (order) => ({ ...order, items: [{ ...order.items[0], quantity: 'many' }] })],
    ['zero item quantity', (order) => ({ ...order, items: [{ ...order.items[0], quantity: 0 }] })],
    ['negative payment', (order) => ({
      ...order,
      payments: { ...order.payments, methods: [{ ...order.payments.methods[0], value: -1 }] }
    })]
  ])('fails closed for %s instead of coercing invalid numeric data to zero', (_, mutate) => {
    expect(() => normalizeIfoodOrder(mutate(orders.ifoodDelivery))).toThrow(/iFood order contract/i);
  });

  it('fails closed for unknown or absent order enums', () => {
    expect(() => normalizeIfoodOrder({ ...orders.ifoodDelivery, orderType: 'DELIVERY_PARTNER' }))
      .toThrow(/orderType/i);
    expect(() => normalizeIfoodOrder({ ...orders.ifoodDelivery, orderTiming: undefined }))
      .toThrow(/orderTiming/i);
  });

  it('fails closed when totals do not reconcile', () => {
    expect(() => normalizeIfoodOrder({
      ...orders.ifoodDelivery,
      total: { ...orders.ifoodDelivery.total, orderAmount: 99 }
    })).toThrow(/total/i);
  });

  it('maps iFood payment codes to canonical IDs and keeps split methods explicit', () => {
    const order = {
      ...orders.ifoodDelivery,
      payments: {
        prepaid: 10,
        pending: 0,
        methods: [
          { value: 10, currency: 'BRL', type: 'ONLINE', method: 'CREDIT', prepaid: true },
          { value: 19, currency: 'BRL', type: 'OFFLINE', method: 'CASH', prepaid: false, cash: { changeFor: 40 } },
          { value: 0, currency: 'BRL', type: 'ONLINE', method: 'DIGITAL_WALLET', prepaid: false }
        ]
      },
      total: { ...orders.ifoodDelivery.total, orderAmount: 29 }
    };

    const normalized = normalizeIfoodOrder(order);

    expect(normalized.payment.methods.map((method) => method.methodId)).toEqual([
      'cartao_credito',
      'dinheiro',
      'ifood:digital_wallet'
    ]);
    expect(normalized.payment.methods).toHaveLength(3);
    expect(normalized.payment.method).not.toBe('multiplo');
    expect(normalized.payment.declaredMethod).toBeNull();
  });
});
