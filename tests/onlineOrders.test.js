import { describe, expect, it, vi } from 'vitest';
import {
  canonicalFulfillmentMode,
  canonicalPaymentMethod,
  closeCanonicalOrder,
  itemModifierGroups,
  loadCanonicalOrders,
  mapCanonicalOrder,
  subscribeCanonicalOrderUpdates,
  transitionCanonicalOrder
} from '../src/lib/onlineOrders.js';

describe('onlineOrders', () => {
  const order = {
    id: 'abcd1234-0000-0000-0000-000000000000',
    source: 'zelomenu', status: 'pending_review', revision: 3,
    customer: { name: 'Ana' }, fulfillment: { mode: 'delivery' }, payment: { method: 'pix' },
    total: 25, created_at: '2026-07-12T12:00:00Z',
    zelo_order_items: [{ id: 'i1', product_id: 9, name: 'Combo', unit_price: 12.5, quantity: 2, subtotal: 25 }]
  };

  it('maps the canonical model to the existing queue view model', () => {
    const mapped = mapCanonicalOrder(order);
    expect(mapped).toMatchObject({ canonical: true, nome_cliente: 'Ana', status: 'pending_review', revision: 3, total: 25 });
    expect(mapped.pedido_itens[0]).toMatchObject({ id_produto: 9, nome: 'Combo', quantidade: 2, preco_unitario: 12.5 });
  });

  it('maps current ZeloMenu snapshots into the financial sale contract', () => {
    const mapped = mapCanonicalOrder({
      ...order,
      fulfillment: { type: 'delivery' },
      payment: { declaredMethod: 'pix' }
    });

    expect(mapped).toMatchObject({ forma_pagamento: 'pix', tipo_pedido: 'delivery' });
    expect(canonicalPaymentMethod(mapped)).toBe('pix');
    expect(canonicalFulfillmentMode(mapped)).toBe('delivery');
  });

  it('preserves selected modifier groups for the queue and printer ticket', () => {
    const mapped = mapCanonicalOrder({
      ...order,
      zelo_order_items: [{
        ...order.zelo_order_items[0],
        name: 'Monte sua Massa',
        modifiers: [{
          groupName: 'Proteína',
          selectedOptions: [{ optionName: 'Frango', quantity: 1 }],
        }],
      }],
    });

    expect(mapped.pedido_itens[0].modifierGroups).toEqual([{
      groupName: 'Proteína',
      optionNames: ['Frango'],
    }]);
  });

  it('reads the item assembly from either the mapped or the raw shape', () => {
    const raw = {
      modifiers: [
        {
          groupName: 'Massa',
          selectedOptions: [{ optionName: 'Penne', priceDelta: 32, quantity: 1 }],
        },
        {
          groupName: 'Adicionais',
          selectedOptions: [{ optionName: 'Bacon', priceDelta: 5, quantity: 3 }],
        },
        { groupName: 'Vazio', selectedOptions: [] },
      ],
    };

    const groups = itemModifierGroups(raw);
    expect(groups).toEqual([
      { groupName: 'Massa', optionNames: ['Penne'] },
      { groupName: 'Adicionais', optionNames: ['3x Bacon'] },
    ]);
    expect(itemModifierGroups({ modifierGroups: groups })).toEqual(groups);
    expect(itemModifierGroups({})).toEqual([]);
  });

  it('transitions with optimistic revision and actor context', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { orderId: order.id, revision: 4 }, error: null });
    await transitionCanonicalOrder({ rpc }, mapCanonicalOrder(order), 'accept', 'actor-1');
    expect(rpc).toHaveBeenCalledWith('transition_zelo_order', {
      p_order_id: order.id, p_expected_revision: 3, p_action: 'accept', p_actor_id: 'actor-1', p_detail: {}
    });
  });

  it('filters canonical orders by empresa_perfil.id, not by auth owner id', async () => {
    const filters = [];
    const query = {
      select: () => query, eq: (field, value) => { filters.push([field, value]); return query; },
      in: () => query, order: async () => ({ data: [], error: null })
    };
    await loadCanonicalOrders({ from: vi.fn(() => query) }, 'empresa-profile-7');
    expect(filters).toContainEqual(['empresa_id', 'empresa-profile-7']);
  });

  it('delegates financial close to the exactly-once database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { saleId: 44 }, error: null });
    await closeCanonicalOrder({ rpc }, mapCanonicalOrder(order), { method: 'pix' }, 'actor-1');
    expect(rpc).toHaveBeenCalledWith('close_zelo_order', {
      p_order_id: order.id, p_expected_revision: 3, p_payment: { method: 'pix' }, p_actor_id: 'actor-1'
    });
  });

  it('subscribes the PDV queue to canonical status changes from other surfaces', () => {
    const subscribe = vi.fn();
    const on = vi.fn(() => ({ on, subscribe }));
    const channel = vi.fn(() => ({ on, subscribe }));
    const callback = vi.fn();

    subscribeCanonicalOrderUpdates({ channel }, 'empresa-1', callback);

    expect(channel).toHaveBeenCalledWith('zelo-pdv-orders-empresa-1');
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'zelo_orders', filter: 'empresa_id=eq.empresa-1' },
      callback
    );
    expect(subscribe).toHaveBeenCalledOnce();
  });
});
