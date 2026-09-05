import { describe, expect, it, vi } from 'vitest';
import {
  categoriaCompartilhaEstoque,
  estoqueDisponivel,
  produtoControlaEstoque,
  produtoSemEstoque,
  somarQuantidadePorEstoque,
} from '../src/lib/stock.js';
import {
  canonicalFulfillmentMode,
  canonicalPaymentMethod,
  itemModifierGroups,
  loadCanonicalOrders,
  mapCanonicalOrder,
  subscribeCanonicalOrderUpdates,
  transitionCanonicalOrder,
} from '../src/lib/onlineOrders.js';
import {
  AUTO_PRINT_DEDUPE_WINDOW_MS,
  createPrintedOrderStore,
  selectOrdersToAutoPrint,
} from '../src/lib/orderAutoPrint.js';
import { buildOrderText } from '../src/lib/orderPrint.js';
import { resolveModifierSelections } from '../src/lib/zelomenuModifiers.js';

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function order(id, overrides = {}) {
  return {
    id,
    canonical: true,
    status: 'pending_review',
    criado_em: '2026-08-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('operational stock invariants', () => {
  it('uses individual stock when the category is not shared', () => {
    const product = { id: 1, controlar_estoque: true, estoque_atual: 4, categorias: { controlar_estoque_compartilhado: false } };
    expect(categoriaCompartilhaEstoque(product)).toBe(false);
    expect(produtoControlaEstoque(product)).toBe(true);
    expect(estoqueDisponivel(product)).toBe(4);
    expect(produtoSemEstoque(product)).toBe(false);
  });

  it('uses shared category stock even when the product flag is false', () => {
    const product = {
      id: 2,
      controlar_estoque: false,
      estoque_atual: 0,
      categorias: { id: 20, nome: 'Bebidas', controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 3 },
    };
    expect(categoriaCompartilhaEstoque(product)).toBe(true);
    expect(produtoControlaEstoque(product)).toBe(true);
    expect(estoqueDisponivel(product)).toBe(3);
  });

  it('marks a controlled product unavailable at zero or negative stock', () => {
    expect(produtoSemEstoque({ controlar_estoque: true, estoque_atual: 0 })).toBe(true);
    expect(produtoSemEstoque({ controlar_estoque: true, estoque_atual: -1 })).toBe(true);
    expect(produtoSemEstoque({ controlar_estoque: false, estoque_atual: 0 })).toBe(false);
  });

  it('aggregates quantities by product and skips uncontrolled products', () => {
    const result = somarQuantidadePorEstoque([
      { id_produto: 1, nome: 'Café', quantidade: 2 },
      { id_produto: 1, nome: 'Café', quantidade: 3 },
      { id_produto: 2, nome: 'Água', quantidade: 9 },
    ], [
      { id: 1, nome: 'Café', controlar_estoque: true, estoque_atual: 10 },
      { id: 2, nome: 'Água', controlar_estoque: false, estoque_atual: 0 },
    ]);
    expect(result).toEqual([{ key: 'prod:1', nome: 'Café', disponivel: 10, quantidade: 5 }]);
  });

  it('aggregates shared stock across different products in the same category', () => {
    const category = { id: 8, nome: 'Sabores', controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 6 };
    const result = somarQuantidadePorEstoque([
      { id_produto: 1, quantidade: 2 },
      { id_produto: 2, quantidade: 3 },
    ], [
      { id: 1, nome: 'A', categorias: category },
      { id: 2, nome: 'B', categorias: category },
    ]);
    expect(result).toEqual([{ key: 'cat:8', nome: 'Sabores', disponivel: 6, quantidade: 5 }]);
  });
});

describe('canonical operational orders', () => {
  it('maps all supported fallback shapes into the queue contract', () => {
    const mapped = mapCanonicalOrder({
      id: 'order-12345678',
      source: 'mesa',
      status: 'ready',
      revision: '4',
      customer: { nome: 'Bia', telefone: '5511000000000' },
      fulfillment: { type: 'retirada', pickup_time: '18:00' },
      payment: { forma_pagamento: 'dinheiro' },
      total: '42.5',
      delivery_fee: '0',
      created_at: '2026-08-11T12:00:00Z',
      zelo_order_items: [{
        id: 'item-1', product_id: 2, name: 'Burger', unit_price: '21.25', quantity: '2', subtotal: '42.5',
        modifiers: [{ name: 'Adicional', selectedOptions: [{ name: 'Bacon', quantity: 2 }] }],
      }],
    });
    expect(mapped).toMatchObject({
      source: 'mesa', nome_cliente: 'Bia', customer_phone: '5511000000000', revision: 4,
      total: 42.5, tipo_pedido: 'retirada', forma_pagamento: 'dinheiro', canonical: true,
    });
    expect(mapped.pedido_itens[0]).toMatchObject({ quantidade: 2, preco_unitario: 21.25, enviado_cozinha: true });
    expect(mapped.pedido_itens[0].modifierGroups).toEqual([{ groupName: 'Adicional', optionNames: ['2x Bacon'] }]);
  });

  it('keeps pending payment orders out of the kitchen query', async () => {
    const calls = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field, value) => { calls.push(['eq', field, value]); return query; }),
      in: vi.fn((field, values) => { calls.push(['in', field, values]); return query; }),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    await loadCanonicalOrders({ from: vi.fn(() => query) }, 'empresa-1', { kitchen: true });
    expect(calls).toContainEqual(['in', 'status', ['accepted', 'preparing', 'ready']]);
  });

  it('returns no orders without an empresa id and propagates database errors', async () => {
    expect(await loadCanonicalOrders({ from: vi.fn() }, '')).toEqual([]);
    const error = new Error('temporary database failure');
    const query = { select: () => query, eq: () => query, in: () => query, order: async () => ({ data: null, error }) };
    await expect(loadCanonicalOrders({ from: () => query }, 'empresa-1')).rejects.toBe(error);
  });

  it('passes expected revision, action, actor and detail to transitions', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { revision: 5 }, error: null });
    await transitionCanonicalOrder({ rpc }, { id: 'order-1', revision: 4 }, 'dispatch', null, { reason: 'driver' });
    expect(rpc).toHaveBeenCalledWith('transition_zelo_order', {
      p_order_id: 'order-1', p_expected_revision: 4, p_action: 'dispatch', p_actor_id: null, p_detail: { reason: 'driver' },
    });
  });

  it('supports legacy and canonical fulfillment/payment names', () => {
    expect(canonicalFulfillmentMode({ mode: 'delivery' })).toBe('delivery');
    expect(canonicalFulfillmentMode({ type: 'delivery' })).toBe('delivery');
    expect(canonicalFulfillmentMode({ type: 'retirada' })).toBe('retirada');
    expect(canonicalPaymentMethod({ declaredMethod: 'pix' })).toBe('pix');
    expect(canonicalPaymentMethod({ method: 'card' })).toBe('card');
    expect(canonicalPaymentMethod({})).toBe('outro');
  });

  it('does not create a realtime channel without a valid subscription context', () => {
    const channel = vi.fn();
    expect(subscribeCanonicalOrderUpdates({ channel }, '', vi.fn())).toBeNull();
    expect(channel).not.toHaveBeenCalled();
    expect(subscribeCanonicalOrderUpdates(null, 'empresa-1', vi.fn())).toBeNull();
  });
});

describe('automatic order printing', () => {
  it('rejects old, terminal, legacy and malformed orders', () => {
    const now = Date.parse('2026-08-11T12:15:00.000Z');
    expect(selectOrdersToAutoPrint([], [
      order('old', { criado_em: '2026-08-11T11:00:00.000Z' }),
      order('terminal', { status: 'delivered' }),
      order('legacy', { canonical: false }),
      order('invalid', { criado_em: 'not-a-date' }),
    ], { now, maxAgeMs: 15 * 60 * 1000 })).toEqual([]);
  });

  it('does not print the initial snapshot or duplicate ids', () => {
    const now = Date.parse('2026-08-11T12:05:00.000Z');
    const result = selectOrdersToAutoPrint(
      [order('known')],
      [order('known'), order('new')],
      { now, maxAgeMs: 15 * 60 * 1000 },
    );
    expect(result.map((item) => item.id)).toEqual(['new']);
  });

  it('persists reservations, supports release and expires entries after 48 hours', () => {
    const storage = memoryStorage();
    let now = 1_000;
    const store = createPrintedOrderStore({ storage, now: () => now });
    expect(store.reserve('order-1')).toBe(true);
    expect(store.reserve('order-1')).toBe(false);
    store.release('order-1');
    expect(store.reserve('order-1')).toBe(true);
    now += AUTO_PRINT_DEDUPE_WINDOW_MS + 1;
    expect(store.reserve('order-1')).toBe(true);
  });

  it('ignores malformed persisted storage and empty ids', () => {
    const store = createPrintedOrderStore({ storage: memoryStorage({ zelopdv_auto_printed_order_ids_v1: '{bad' }) });
    expect(store.reserve('')).toBe(false);
    expect(store.reserve(null)).toBe(false);
    expect(store.reserve('valid')).toBe(true);
  });
});

describe('operational printer contract', () => {
  it('prints pickup orders with default payment/customer labels', async () => {
    const { buildOrderText } = await import('../src/lib/orderPrint.js');
    const text = buildOrderText({
      id: '00000000-0000-0000-0000-12345678',
      total: 9.5,
      items: [{ product: 'Café', quantity: 1 }],
      fulfillment: { pickup_time: '19:30' },
    }, 'Loja');
    expect(text).toContain('LOJA');
    expect(text).toContain('PEDIDO #12345678');
    expect(text).toContain('Cliente: Cliente');
    expect(text).toContain('Pagamento: -');
    expect(text).toContain('Retirada: 19:30');
  });

  it('wraps long delivery addresses and observations without dropping content', () => {
    const text = buildOrderText({
      id: 'order-1',
      total: 1,
      fulfillment: { delivery_address: 'Rua muito longa com um endereço que precisa quebrar em várias linhas para a impressora térmica' },
      observations: 'Deixar na portaria e avisar quando chegar',
      items: [{ name: 'Produto', quantity: 1 }],
    });
    expect(text).toContain('Entrega:');
    expect(text).toContain('Rua muito longa');
    expect(text).toContain('Obs: Deixar na portaria');
  });

  it('exports the shared printer width contract', async () => {
    const { LINE_WIDTH } = await import('../src/lib/orderPrint.js');
    expect(LINE_WIDTH).toBe(32);
  });
});

describe('modifier selection operational invariants', () => {
  it('orders selected options deterministically and computes price deltas', () => {
    const result = resolveModifierSelections([
      {
        id: 'extras', name: 'Extras', kind: 'adicional', allowsQuantity: true, minSelections: 0, maxSelections: 3,
        options: [
          { id: 'b', name: 'Bacon', priceDelta: 3, quantity: 1 },
          { id: 'a', name: 'Queijo', priceDelta: 2, quantity: 2 },
        ],
      },
    ], [{ groupId: 'extras', optionSelections: [{ optionId: 'b', quantity: 1 }, { optionId: 'a', quantity: 2 }] }], 10);
    expect(result.selectedGroups[0].selectedOptions.map((option) => option.optionId)).toEqual(['a', 'b']);
    expect(result.finalUnitPrice).toBe(17);
    expect(result.ok).toBe(true);
  });

  it('rejects missing mandatory groups and over-selected options', () => {
    const required = resolveModifierSelections([
      { id: 'size', name: 'Tamanho', kind: 'variacao', minSelections: 1, maxSelections: 1, options: [{ id: 'small', name: 'P', priceDelta: 0 }] },
    ], [], 10);
    expect(required.ok).toBe(false);

    const tooMany = resolveModifierSelections([
      { id: 'extras', name: 'Extras', kind: 'adicional', minSelections: 0, maxSelections: 1, options: [{ id: 'a', name: 'A', priceDelta: 1 }, { id: 'b', name: 'B', priceDelta: 1 }] },
    ], [{ groupId: 'extras', optionSelections: [{ optionId: 'a', quantity: 1 }, { optionId: 'b', quantity: 1 }] }], 10);
    expect(tooMany.ok).toBe(false);
  });
});
