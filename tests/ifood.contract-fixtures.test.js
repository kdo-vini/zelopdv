import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const eventFiles = [
  'tests/fixtures/ifood/events/placed.json',
  'tests/fixtures/ifood/events/concluded.json',
  'tests/fixtures/ifood/events/cancelled.json'
];

const orderFiles = [
  'tests/fixtures/ifood/orders/immediate-ifood-delivery.json',
  'tests/fixtures/ifood/orders/immediate-merchant-delivery.json',
  'tests/fixtures/ifood/orders/immediate-pickup.json',
  'tests/fixtures/ifood/orders/scheduled.json'
];

const errorFiles = ['tests/fixtures/ifood/errors/rate-limit.json'];

const fixtureFiles = [...eventFiles, ...orderFiles, ...errorFiles];
const fixtureRoot = resolve('tests/fixtures/ifood');

function discoverFixtureFiles(directory = fixtureRoot) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return discoverFixtureFiles(path);
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

const expectedFixtureFiles = fixtureFiles.map((file) => resolve(file)).sort();
const discoveredFixtureFiles = discoverFixtureFiles();

const loadFixture = (file) => {
  const raw = readFileSync(resolve(file), 'utf8');
  return { raw, data: JSON.parse(raw) };
};

const sensitivePatterns = [
  /\bbearer\s+[a-z0-9._~+/=-]+/i,
  /\b(?:client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|token|secret)\b\s*["']?\s*[:=]/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /(?:\+?55\s*)?(?:\(?[1-9]\d\)?\s*)?(?:9\d{4}[-\s]?\d{4}|[2-5]\d{3}[-\s]?\d{4})\b/,
  /\b(?:rua|r\.|avenida|av\.|travessa|alameda)\s+[^,\n"]+[,]?\s+\d+[a-z]?\b/i,
  /\b\d{5}-?\d{3}\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/
];

function findSensitivePattern(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return sensitivePatterns.find((pattern) => pattern.test(text)) ?? null;
}

describe('iFood external contract fixtures', () => {
  it('discovers exactly the eight fixtures required by the MVP snapshot', () => {
    expect(discoveredFixtureFiles).toEqual(expectedFixtureFiles);
    for (const file of discoveredFixtureFiles) {
      expect(() => loadFixture(file), file).not.toThrow();
    }
  });

  it.each(orderFiles)('keeps the FOOD order shape for %s', (file) => {
    const { data: order } = loadFixture(file);

    expect(order.id).toBeTypeOf('string');
    expect(order.displayId).toBeTypeOf('string');
    expect(order.createdAt).toBeTypeOf('string');
    expect(order.preparationStartDateTime).toBeTypeOf('string');
    expect(order.category).toBe('FOOD');
    expect(order.salesChannel).toBe('IFOOD');
    expect(order.isTest).toBe(true);
    expect(order.merchant?.id).toBeTypeOf('string');
    expect(new Set(['IMMEDIATE', 'SCHEDULED'])).toContain(order.orderTiming);
    expect(new Set(['DELIVERY', 'TAKEOUT'])).toContain(order.orderType);

    expect(order.items).toBeInstanceOf(Array);
    expect(order.items.length).toBeGreaterThan(0);
    for (const item of order.items) {
      expect(item.id).toBeTypeOf('string');
      expect(item.uniqueId).toBeTypeOf('string');
      expect(item.name).toBeTypeOf('string');
      expect(item.externalCode).toBeTypeOf('string');
      expect(item.quantity).toBeTypeOf('number');
      expect(item.unitPrice).toBeTypeOf('number');
      expect(item.price).toBeTypeOf('number');
      expect(item.options).toBeInstanceOf(Array);
    }

    expect(order.total).toEqual(expect.objectContaining({
      subTotal: expect.any(Number),
      deliveryFee: expect.any(Number),
      additionalFees: expect.any(Number),
      benefits: expect.any(Number),
      orderAmount: expect.any(Number)
    }));
    expect(order.payments).toEqual(expect.objectContaining({
      prepaid: expect.any(Number),
      pending: expect.any(Number),
      methods: expect.any(Array)
    }));
    expect(order.payments.methods.length).toBeGreaterThan(0);
    for (const payment of order.payments.methods) {
      expect(payment.value).toBeTypeOf('number');
      expect(payment.currency).toBe('BRL');
      expect(new Set(['ONLINE', 'OFFLINE'])).toContain(payment.type);
      expect(new Set([
        'CASH',
        'CREDIT',
        'DEBIT',
        'MEAL_VOUCHER',
        'FOOD_VOUCHER',
        'GIFT_CARD',
        'DIGITAL_WALLET',
        'PIX',
        'OTHER'
      ])).toContain(payment.method);
    }

    expect(order.additionalFees).toBeInstanceOf(Array);
    expect(order).toHaveProperty('picking');
    expect(order.additionalInfo).toEqual(expect.any(Object));
  });

  it('keeps delivery responsibility and pickup variants distinct', () => {
    const ifoodDelivery = loadFixture(orderFiles[0]).data;
    const merchantDelivery = loadFixture(orderFiles[1]).data;
    const pickup = loadFixture(orderFiles[2]).data;

    expect(ifoodDelivery.delivery?.deliveredBy).toBe('IFOOD');
    expect(merchantDelivery.delivery?.deliveredBy).toBe('MERCHANT');
    expect(pickup.delivery).toBeNull();
    expect(pickup.takeout?.mode).toBe('DEFAULT');
  });

  it('keeps scheduled preparation and delivery windows explicit', () => {
    const { data: scheduled } = loadFixture(orderFiles[3]);

    expect(scheduled.orderTiming).toBe('SCHEDULED');
    expect(scheduled.schedule).toEqual(expect.objectContaining({
      deliveryDateTimeStart: expect.any(String),
      deliveryDateTimeEnd: expect.any(String)
    }));
    expect(scheduled.delivery?.deliveredBy).toBe('MERCHANT');
  });

  it.each(eventFiles)('keeps the event envelope for %s', (file) => {
    const { data: event } = loadFixture(file);

    expect(event.id).toBeTypeOf('string');
    expect(event.code).toBeTypeOf('string');
    expect(event.fullCode).toBeTypeOf('string');
    expect(event.orderId).toBeTypeOf('string');
    expect(event.merchantId).toBeTypeOf('string');
    expect(event.createdAt).toBeTypeOf('string');
    expect(event.metadata).toEqual(expect.any(Object));
  });

  it('preserves the observed PLACED event code and official terminal examples', () => {
    const placed = loadFixture(eventFiles[0]).data;
    const concluded = loadFixture(eventFiles[1]).data;
    const cancelled = loadFixture(eventFiles[2]).data;

    expect(placed.code).toBe('PLC');
    expect(placed.fullCode).toBe('PLACED');
    expect(concluded.code).toBe('CON');
    expect(concluded.fullCode).toBe('CONCLUDED');
    expect(cancelled.code).toBe('CAN');
    expect(cancelled.fullCode).toBe('CANCELLED');
  });

  it('represents the documented rate-limit response without a credential', () => {
    const { data: rateLimit } = loadFixture(errorFiles[0]);

    expect(rateLimit.statusCode).toBe(429);
    expect(rateLimit.code).toBeTypeOf('string');
    expect(rateLimit.message).toBe('Too Many Requests');
    expect(rateLimit.retryAfter).toBeTypeOf('number');
    expect(rateLimit.retryAfter).toBeGreaterThan(0);
  });

  it('contains no credentials, PII, live IDs, or real addresses', () => {
    for (const file of discoveredFixtureFiles) {
      const { raw } = loadFixture(file);
      expect(findSensitivePattern(raw), file).toBeNull();
    }
  });

  it('detects fixed Brazilian phone variants without flagging placeholders', () => {
    expect(findSensitivePattern('1133334444')).not.toBeNull();
    expect(findSensitivePattern('+55 (11) 3333-4444')).not.toBeNull();

    const placeholders = [
      'merchant-fixture',
      'order-fixture',
      'event-fixture',
      'Cliente Teste',
      'phone-fixture',
      'address-fixture'
    ];

    expect(findSensitivePattern(placeholders)).toBeNull();
  });
});
