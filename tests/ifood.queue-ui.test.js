import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapCanonicalOrder } from '../src/lib/onlineOrders.js';
import { getOrderDeliveryPresentation, getOrderPaymentPresentation, getOrderCustomerPhonePresentation } from '../src/lib/orderPresentation.js';
import {
  fetchIfoodCancellationReasons,
  fetchIfoodSyncState,
  sendIfoodCommand
} from '../src/lib/orders/ifoodCommandsClient.js';
import {
  kitchenVisibleOrders,
  resolveKitchenAdvance,
  resolveQueueAdvance
} from '../src/lib/orders/ifoodPresentation.js';

const ORDER_ID = '11111111-2222-4333-8444-555555555555';

function ifoodRow(overrides = {}) {
  return {
    id: ORDER_ID,
    source: 'ifood',
    status: 'pending_review',
    revision: 2,
    created_at: '2026-09-16T12:00:00.000Z',
    total: 29,
    delivery_fee: 4,
    observations: null,
    customer: {
      name: 'Cliente Teste',
      phone: { number: '0800 000 0000', localizer: '12345678' },
      deliveryAddress: {
        streetName: 'Rua Fixture',
        streetNumber: '100',
        complement: 'Apto 1',
        neighborhood: 'Centro',
        city: 'Cidade',
        state: 'SP',
        postalCode: '01001000',
        reference: 'Portão azul'
      }
    },
    fulfillment: {
      orderType: 'DELIVERY',
      orderTiming: 'IMMEDIATE',
      mode: 'delivery',
      type: 'delivery',
      deliveredBy: 'MERCHANT',
      observations: 'Tocar interfone',
      ifood: {
        displayId: '7421',
        externalOrderId: 'order-fixture',
        preparationStartAt: '2026-09-16T12:00:00.000Z',
        scheduled: false,
        pickupCode: null,
        deliveryCode: '4321'
      }
    },
    payment: {
      prepaid: 0,
      pending: 29,
      declaredMethod: 'dinheiro',
      method: 'dinheiro',
      isSplit: false,
      methods: [{ value: 29, method: 'CASH', methodId: 'dinheiro', prepaid: false, type: 'OFFLINE', cash: { changeFor: 40 } }]
    },
    zelo_order_items: [{
      id: 'item-1',
      product_id: null,
      name: 'X-Burger',
      unit_price: 20,
      quantity: 1,
      subtotal: 25,
      position: 1,
      modifiers: [
        { name: 'Bacon', groupName: 'Adicionais', quantity: 1, unitPrice: 5, price: 5 },
        { name: 'Sem cebola', groupName: 'Preferências', quantity: 1, unitPrice: 0, price: 0 },
        { name: 'Cheddar', groupName: 'Adicionais', quantity: 2, unitPrice: 0, price: 0 }
      ]
    }],
    ...overrides
  };
}

describe('mapCanonicalOrder with real order source', () => {
  it('uses row.source instead of the old zelomenu hardcode', () => {
    expect(mapCanonicalOrder(ifoodRow()).origem).toBe('ifood');
    expect(mapCanonicalOrder(ifoodRow({ source: 'manual' })).origem).toBe('manual');
    expect(mapCanonicalOrder(ifoodRow({ source: undefined })).origem).toBe('zelomenu');
  });

  it('exposes the iFood block, display reference and flattened delivery fields', () => {
    const mapped = mapCanonicalOrder(ifoodRow());
    expect(mapped.ifood).toMatchObject({ displayId: '7421', deliveryCode: '4321', scheduled: false });
    expect(mapped.numero_pedido).toBe('7421');

    const delivery = getOrderDeliveryPresentation(mapped);
    expect(delivery).toMatchObject({
      kind: 'delivery',
      address: 'Rua Fixture, 100',
      complement: 'Apto 1',
      neighborhood: 'Centro',
      cityState: 'Cidade - SP',
      postalCode: '01001-000'
    });
    expect(mapped.customer_phone).toBe('0800 000 0000 (localizador 12345678)');
    expect(mapped.ifood).toMatchObject({
      phoneNumber: '0800 000 0000',
      phoneLocalizer: '12345678'
    });
    expect(getOrderCustomerPhonePresentation(mapped)).toMatchObject({
      kind: 'ifood_bridge',
      number: '0800 000 0000',
      localizer: '12345678',
      label: 'Contato do cliente'
    });
  });

  it('turns flat iFood options into grouped modifiers for queue and kitchen', () => {
    const mapped = mapCanonicalOrder(ifoodRow());
    expect(mapped.pedido_itens[0].modifierGroups).toEqual([
      { groupName: 'Adicionais', optionNames: ['Bacon', '2x Cheddar'] },
      { groupName: 'Preferências', optionNames: ['Sem cebola'] }
    ]);
  });

  it('shows cash change from the iFood changeFor value', () => {
    const payment = getOrderPaymentPresentation(mapCanonicalOrder(ifoodRow()));
    expect(payment).toMatchObject({ isCash: true, received: 40, change: 11 });
  });

  it('shows friendly labels for iFood OTHER / DIGITAL_WALLET instead of Ifood:other', () => {
    const other = getOrderPaymentPresentation(mapCanonicalOrder(ifoodRow({
      payment: {
        prepaid: 29,
        pending: 0,
        declaredMethod: 'ifood:other',
        method: 'ifood:other',
        isSplit: false,
        methods: [{
          value: 29,
          method: 'OTHER',
          externalMethod: 'OTHER',
          methodId: 'ifood:other',
          prepaid: true,
          type: 'ONLINE',
          card: { brand: 'ELO' }
        }]
      }
    })));
    expect(other).toMatchObject({
      id: 'ifood:other',
      label: 'Outro (Elo)',
      isCash: false
    });

    const wallet = getOrderPaymentPresentation(mapCanonicalOrder(ifoodRow({
      payment: {
        prepaid: 29,
        pending: 0,
        declaredMethod: 'ifood:digital_wallet',
        method: 'ifood:digital_wallet',
        isSplit: false,
        methods: [{
          value: 29,
          method: 'DIGITAL_WALLET',
          externalMethod: 'DIGITAL_WALLET',
          methodId: 'ifood:digital_wallet',
          prepaid: true,
          type: 'ONLINE',
          wallet: { name: 'IFOOD' }
        }]
      }
    })));
    expect(wallet.label).toBe('Carteira digital (Ifood)');

    const credit = getOrderPaymentPresentation(mapCanonicalOrder(ifoodRow({
      payment: {
        prepaid: 29,
        pending: 0,
        declaredMethod: 'cartao_credito',
        method: 'cartao_credito',
        isSplit: false,
        methods: [{
          value: 29,
          method: 'CREDIT',
          externalMethod: 'CREDIT',
          methodId: 'cartao_credito',
          prepaid: true,
          type: 'ONLINE'
        }]
      }
    })));
    expect(credit).toMatchObject({ id: 'cartao_credito', label: 'Cartão de crédito' });
  });

  it('keeps non-iFood orders exactly as before (no ifood block)', () => {
    const mapped = mapCanonicalOrder(ifoodRow({ source: 'zelomenu', fulfillment: { mode: 'delivery' } }));
    expect(mapped.ifood).toBeNull();
    expect(mapped.numero_pedido).toBe(ORDER_ID.slice(0, 8).toUpperCase());
  });
});

describe('queue action routing', () => {
  it('iFood orders advance through the command API, never transition_zelo_order', () => {
    const ifood = mapCanonicalOrder(ifoodRow());
    expect(resolveQueueAdvance(ifood)).toEqual({ kind: 'ifood_command', intent: 'confirm' });
    expect(resolveQueueAdvance({ ...ifood, status: 'ready' })).toEqual({ kind: 'ifood_command', intent: 'dispatch' });
    // An iFood order is never closed into a caixa sale from the queue.
    expect(resolveQueueAdvance({ ...ifood, status: 'out_for_delivery' })).toEqual({ kind: 'ifood_command', intent: 'verify_delivery_code' });
  });

  it('other channels keep transition_zelo_order and close_zelo_order', () => {
    const zelomenu = mapCanonicalOrder(ifoodRow({ source: 'zelomenu', fulfillment: { mode: 'delivery' } }));
    expect(resolveQueueAdvance(zelomenu)).toEqual({ kind: 'transition', action: 'accept' });
    expect(resolveQueueAdvance({ ...zelomenu, status: 'ready' })).toEqual({ kind: 'transition', action: 'dispatch' });
    expect(resolveQueueAdvance({ ...zelomenu, status: 'out_for_delivery' })).toEqual({ kind: 'close' });
    expect(resolveKitchenAdvance({ ...zelomenu, status: 'accepted' }, 'start')).toEqual({ kind: 'transition', action: 'start_preparing' });
  });

  it('completes a ready mesa order without creating another sale', () => {
    const mesa = mapCanonicalOrder(ifoodRow({ source: 'mesa', status: 'ready', fulfillment: { type: 'mesa' } }));
    expect(resolveQueueAdvance(mesa)).toEqual({ kind: 'transition', action: 'deliver' });
  });

  it('kitchen routes iFood steps to commands and blocks ready for iFood-delivered orders', () => {
    const ifood = mapCanonicalOrder(ifoodRow({ status: 'accepted' }));
    expect(resolveKitchenAdvance(ifood, 'start')).toEqual({ kind: 'ifood_command', intent: 'start_preparation' });
    const pickup = mapCanonicalOrder(ifoodRow({ status: 'preparing', fulfillment: { mode: 'retirada', type: 'takeout', ifood: {} } }));
    expect(resolveKitchenAdvance(pickup, 'ready')).toEqual({ kind: 'ifood_command', intent: 'ready_to_pickup' });
    const ifoodDelivered = mapCanonicalOrder(ifoodRow({ status: 'preparing', fulfillment: { mode: 'delivery', type: 'delivery', deliveredBy: 'IFOOD', ifood: {} } }));
    expect(resolveKitchenAdvance(ifoodDelivered, 'ready')).toEqual({ kind: 'none' });
  });

  it('a scheduled iFood order does not enter the kitchen before preparationStartAt', () => {
    const scheduled = mapCanonicalOrder(ifoodRow({
      status: 'accepted',
      fulfillment: {
        mode: 'delivery', type: 'delivery', deliveredBy: 'MERCHANT', orderTiming: 'SCHEDULED',
        ifood: { displayId: '9001', scheduled: true, preparationStartAt: '2026-09-16T18:30:00.000Z' }
      }
    }));
    const immediate = mapCanonicalOrder(ifoodRow({ id: '22222222-2222-4333-8444-555555555555', status: 'accepted' }));
    expect(kitchenVisibleOrders([scheduled, immediate], '2026-09-16T18:00:00.000Z').map((o) => o.id)).toEqual([immediate.id]);
    expect(kitchenVisibleOrders([scheduled, immediate], '2026-09-16T18:30:00.000Z')).toHaveLength(2);
  });
});

describe('iFood commands browser client', () => {
  function supabaseWithSession(token = 'session-token') {
    return { auth: { getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })) } };
  }

  function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }

  it('posts the intent with bearer auth and the order revision to the Task 10 route', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { commandId: 'cmd-1', status: 'queued' }));
    const order = mapCanonicalOrder(ifoodRow());
    const result = await sendIfoodCommand(supabaseWithSession(), order, 'confirm', {}, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/integrations/ifood/orders/${ORDER_ID}/commands`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token', 'Content-Type': 'application/json' })
      })
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ intent: 'confirm', expectedRevision: 2 });
    expect(result).toEqual({ ok: true, status: 202, commandId: 'cmd-1', commandStatus: 'queued' });
  });

  it('sends only the cancellation code and reason for cancel', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { commandId: 'cmd-2', status: 'queued' }));
    await sendIfoodCommand(supabaseWithSession(), mapCanonicalOrder(ifoodRow()), 'cancel', {
      cancellationCode: '501', reason: 'Problemas de sistema', extra: 'ignored'
    }, { fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      intent: 'cancel', expectedRevision: 2, cancellationCode: '501', reason: 'Problemas de sistema'
    });
  });

  it('maps server errors to operator messages without raw server text', async () => {
    const cases = [
      [409, { error: 'revision_conflict' }, 'O pedido mudou. Atualize a fila e tente de novo.'],
      [409, { error: 'connection_unavailable' }, 'A conexão com o iFood está indisponível. Use o Portal do Parceiro.'],
      [422, { error: 'invalid_transition' }, 'Esta ação não vale para o momento atual do pedido.'],
      [403, { error: 'forbidden' }, 'Seu cargo não pode fazer esta ação.'],
      [500, { error: 'unavailable', detail: 'raw sql text' }, 'Não foi possível enviar ao iFood agora. Tente de novo.']
    ];
    for (const [status, body, message] of cases) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, body));
      const result = await sendIfoodCommand(supabaseWithSession(), mapCanonicalOrder(ifoodRow()), 'confirm', {}, { fetchImpl });
      expect(result).toMatchObject({ ok: false, status, message });
      expect(JSON.stringify(result)).not.toContain('raw sql text');
    }
  });

  it('fails without a session and never calls the API', async () => {
    const fetchImpl = vi.fn();
    const result = await sendIfoodCommand(supabaseWithSession(null), mapCanonicalOrder(ifoodRow()), 'confirm', {}, { fetchImpl });
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads cancellation reasons and sync state from the server routes', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('cancellation-reasons')) return jsonResponse(200, [{ code: '501', description: 'Problemas de sistema' }]);
      return jsonResponse(200, { orders: { [ORDER_ID]: { connectionStatus: 'active', command: null } } });
    });
    const supabase = supabaseWithSession();

    await expect(fetchIfoodCancellationReasons(supabase, ORDER_ID, { fetchImpl })).resolves.toEqual({
      ok: true, reasons: [{ code: '501', description: 'Problemas de sistema' }]
    });
    const sync = await fetchIfoodSyncState(supabase, [ORDER_ID, ORDER_ID, 'not-a-uuid'], { fetchImpl });
    expect(fetchImpl.mock.calls[1][0]).toBe(`/api/integrations/ifood/orders/sync-state?ids=${ORDER_ID}`);
    expect(sync).toEqual({ [ORDER_ID]: { connectionStatus: 'active', command: null } });
  });

  it('skips the sync-state request when there are no iFood orders', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchIfoodSyncState(supabaseWithSession(), [], { fetchImpl })).resolves.toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('iFood channel badge', () => {
  it('keeps the text pill and adds a circular iFood logo', () => {
    const badge = readFileSync(new URL('../src/lib/components/orders/OrderSourceBadge.svelte', import.meta.url), 'utf8');
    expect(badge).toContain('source-mark');
    expect(badge).toContain('/ifood-logo.png');
    expect(badge).toContain('border-radius: 999px');
    expect(badge).toContain('class="source-badge"');
    expect(badge).toContain('{badge.label}');
  });
});
