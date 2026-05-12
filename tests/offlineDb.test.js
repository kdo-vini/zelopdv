import { describe, expect, test, vi } from 'vitest';
import { prepareVendaOfflineRecord, shouldQueueVendaOffline } from '../src/lib/offlineDb.js';

describe('shouldQueueVendaOffline', () => {
  test('queues network-like failures for offline replay', () => {
    expect(shouldQueueVendaOffline(new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldQueueVendaOffline(new Error('The operation timed out'))).toBe(true);
    expect(shouldQueueVendaOffline('ERR_INTERNET_DISCONNECTED')).toBe(true);
  });

  test('does not queue business or authorization errors', () => {
    expect(shouldQueueVendaOffline({ message: 'Estoque insuficiente para: Coca-Cola' })).toBe(false);
    expect(shouldQueueVendaOffline({ message: 'violates row-level security policy' })).toBe(false);
    expect(shouldQueueVendaOffline({ message: 'insert or update on table violates foreign key constraint' })).toBe(false);
  });

  test('queues when the browser reports offline even if the message is generic', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(shouldQueueVendaOffline(new Error('Request failed'))).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('prepareVendaOfflineRecord', () => {
  test('preserves an existing client_sale_id in the queued payload', () => {
    const record = prepareVendaOfflineRecord({
      payload: { client_sale_id: 'sale-existing', valor_total: 10 }
    });

    expect(record.payload.client_sale_id).toBe('sale-existing');
  });

  test('adds a client_sale_id when an offline payload does not have one', () => {
    const record = prepareVendaOfflineRecord({
      payload: { valor_total: 10 }
    });

    expect(record.payload.client_sale_id).toBeTruthy();
  });
});
