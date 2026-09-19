import { describe, expect, it } from 'vitest';
import { findNewIfoodReviewOrders } from '../src/lib/orders/ifoodArrivalSound.js';

describe('findNewIfoodReviewOrders', () => {
  it('flags only new pending_review iFood orders', () => {
    const previous = [{ id: 'a', source: 'ifood', status: 'pending_review' }];
    const next = [
      { id: 'a', source: 'ifood', status: 'pending_review' },
      { id: 'b', source: 'ifood', status: 'pending_review' },
      { id: 'c', source: 'zelomenu', status: 'pending_review' },
      { id: 'd', source: 'ifood', status: 'accepted' },
    ];
    expect(findNewIfoodReviewOrders(previous, next).map((order) => order.id)).toEqual(['b']);
  });

  it('treats an empty previous list as all-new so the caller can skip first paint', () => {
    const next = [{ id: 'b', source: 'ifood', status: 'pending_review' }];
    expect(findNewIfoodReviewOrders([], next)).toHaveLength(1);
  });
});
