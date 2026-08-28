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
  test('keeps modifiers inside the pending sale payload for replay', () => {
    const modifiers = [{ groupName: 'Confeitos', selectedOptions: [{ optionName: 'Granulado', quantity: 1 }] }];
    const record = prepareVendaOfflineRecord({
      payload: {
        valor_total: 10,
        itens: [{ id_produto: 10, nome_produto_na_venda: 'Guaraná', preco_unitario_na_venda: 10, quantidade: 1, modifiers }]
      },
      createdAt: '2026-07-31T10:00:00.000Z'
    });

    expect(record.payload.itens[0].modifiers).toEqual(modifiers);
  });
  test('preserves an existing client_sale_id in the queued payload', () => {
    const record = prepareVendaOfflineRecord({
      payload: { client_sale_id: 'sale-existing', valor_total: 10 }
    });

    expect(record.payload.client_sale_id).toBe('sale-existing');
  });

  test('preserves Vale-refeição in single and multi-payment replay payloads', () => {
    const single = prepareVendaOfflineRecord({
      payload: { forma_pagamento: 'vale_refeicao', valor_total: 30, pagamentos: [] },
    });
    const multi = prepareVendaOfflineRecord({
      payload: {
        forma_pagamento: 'multiplo',
        valor_total: 100,
        pagamentos: [
          { forma_pagamento: 'vale_refeicao', valor: 60 },
          { forma_pagamento: 'dinheiro', valor: 40 },
        ],
      },
    });

    expect(single.payload.forma_pagamento).toBe('vale_refeicao');
    expect(multi.payload.pagamentos).toEqual([
      { forma_pagamento: 'vale_refeicao', valor: 60 },
      { forma_pagamento: 'dinheiro', valor: 40 },
    ]);
  });

  test('adds a client_sale_id when an offline payload does not have one', () => {
    const record = prepareVendaOfflineRecord({
      payload: { valor_total: 10 }
    });

    expect(record.payload.client_sale_id).toBeTruthy();
  });
});
