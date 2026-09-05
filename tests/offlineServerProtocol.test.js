import { describe, it, expect } from 'vitest';
import { validateOfflineBatch, classifyOfflineRpcError } from '../src/lib/server/offlineProtocol.js';

const operation = () => ({ operationId: 'sale-1', schemaVersion: 1, type: 'sale.create',
  ownerUserId: 'owner', operatorId: 'operator', deviceId: 'device', entityType: 'sale',
  entityId: 'sale-1', sequence: 1, dependencies: [], occurredAt: new Date().toISOString(), payload: {} });
describe('offline server protocol', () => {
  it('accepts a durable manual order envelope', () => {
    const order = { ...operation(), type: 'order.create', entityType: 'order', payload: {
      items: [{ productId: 1, quantity: 1, unitPrice: 10 }], deliveryFee: 0
    } };
    expect(validateOfflineBatch({ operations: [order] })).toEqual([order]);
  });
  it('bounds batches before dispatch and rejects duplicate intent IDs', () => {
    expect(validateOfflineBatch({operations:[operation()]})).toHaveLength(1);
    expect(() => validateOfflineBatch({operations:Array.from({length:51},operation)})).toThrow();
    expect(() => validateOfflineBatch({operations:[operation(),operation()]})).toThrow();
  });
  it('does not dispatch unknown versions, types, malformed dependencies or timestamps', () => {
    for (const change of [{schemaVersion:2},{type:'sql.execute'},{dependencies:'x'},{occurredAt:'invalid'},{payload:[]}]) {
      expect(() => validateOfflineBatch({operations:[{...operation(),...change}]})).toThrow();
    }
  });
  it('never calls infrastructure failure a definitive financial rejection', () => {
    expect(classifyOfflineRpcError({code:'57014'})).toBe('retry');
    expect(classifyOfflineRpcError({code:'08006'})).toBe('retry');
    expect(classifyOfflineRpcError({code:'P0001'})).toBe('needs_review');
    expect(classifyOfflineRpcError({code:'42501'})).toBe('rejected');
  });
});
