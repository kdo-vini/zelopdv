import { describe, expect, test, vi } from 'vitest';
import {
  buildVendaPayload,
  createClientSaleId,
  extractEffectiveQty,
  revertFiadoDebtForVenda
} from '../src/lib/finance/saleOps.js';

describe('buildVendaPayload', () => {
  const baseItens = [
    { id_produto: 1, nome: 'Café', quantidade: 2, preco: 5 },
    { id_produto: 2, nome: 'Pão de queijo', quantidade: 1, preco: 6.5 }
  ];

  test('single cash sale produces flat payload with empty pagamentos array', () => {
    const { payload, settlement } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 20,
      totalFinal: 16.5,
      taxaEntrega: 0,
      tipoPedido: 'retirada',
      idCaixa: 42,
      itens: baseItens
    });

    expect(payload.valor_total).toBe(16.5);
    expect(payload.forma_pagamento).toBe('dinheiro');
    expect(payload.valor_recebido).toBe(20);
    expect(payload.valor_troco).toBe(3.5);
    expect(payload.id_caixa).toBe(42);
    expect(payload.tipo_pedido).toBe('retirada');
    expect(payload.itens).toHaveLength(2);
    expect(payload.pagamentos).toEqual([]);
    expect(payload.fiados).toEqual([]);
    expect(payload.estoque).toEqual([
      { id_produto: 1, quantidade: 2 },
      { id_produto: 2, quantidade: 1 }
    ]);
    expect(settlement.valorTroco).toBe(3.5);
  });

  test('preserves the structured modifier snapshot in each sale item', () => {
    const modifiers = [{
      groupId: 'topping',
      groupName: 'Cobertura',
      kind: 'adicional',
      selectedOptions: [{ optionId: 'condensed', optionName: 'Leite condensado', priceDelta: 2, quantity: 1 }]
    }];
    const { payload } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 12,
      totalFinal: 12,
      itens: [{
        id_produto: 10,
        nome: 'Guaraná da Amazônia',
        quantidade: 1,
        preco: 12,
        modifiers,
        resumoMontagem: 'Cobertura: Leite condensado'
      }],
      idCaixa: 1
    });

    expect(payload.itens[0].modifiers).toEqual(modifiers);
    expect(payload.itens[0].nome_produto_na_venda).toBe('Guaraná da Amazônia (Cobertura: Leite condensado)');
  });

  test('expands stock decrement for modifier options linked to a real catalog product', () => {
    const modifiers = [{
      groupId: 'massa',
      groupName: 'Escolha sua massa',
      kind: 'variacao',
      selectedOptions: [{ optionId: 'penne', optionName: 'Penne', priceDelta: 0, quantity: 1, linkedProductId: 501 }]
    }, {
      groupId: 'adicionais',
      groupName: 'Adicional para sua massa',
      kind: 'adicional',
      selectedOptions: [{ optionId: 'bacon', optionName: 'Bacon', priceDelta: 3, quantity: 2, linkedProductId: 502 }]
    }];
    const { payload } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 20,
      totalFinal: 20,
      itens: [{ id_produto: 843, nome: 'Monte sua Massa', quantidade: 2, preco: 20, modifiers }],
      idCaixa: 1
    });

    expect(payload.estoque).toEqual([
      { id_produto: 843, quantidade: 2 },
      { id_produto: 501, quantidade: 2 },
      { id_produto: 502, quantidade: 4 }
    ]);
  });

  test('multi-pay sale stores cash net of change in pagamentos[]', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'multiplo',
      pagamentos: [
        { forma: 'pix', valor: 60 },
        { forma: 'dinheiro', valor: 50 }
      ],
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1
    });

    expect(payload.forma_pagamento).toBe('multiplo');
    expect(payload.valor_troco).toBe(10);
    expect(payload.pagamentos).toEqual([
      { forma_pagamento: 'pix', valor: 60 },
      { forma_pagamento: 'dinheiro', valor: 40 }
    ]);
  });

  test('single fiado produces one fiados[] entry with full charged total', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'fiado',
      totalFinal: 87.5,
      idCliente: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      itens: baseItens,
      idCaixa: 1
    });

    expect(payload.id_cliente).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(payload.fiados).toEqual([
      { id_pessoa: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', valor: 87.5 }
    ]);
    expect(payload.pagamentos).toEqual([]);
  });

  test('single fiado without client is rejected to avoid orphan debt rows', () => {
    expect(() =>
      buildVendaPayload({
        formaPagamento: 'fiado',
        totalFinal: 87.5,
        itens: baseItens,
        idCaixa: 1
      })
    ).toThrow('Venda no fiado exige um cliente vinculado.');
  });

  test('multi-pay with fiado row routes id_cliente from the fiado pessoaId', () => {
    const pessoaId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const { payload } = buildVendaPayload({
      formaPagamento: 'multiplo',
      pagamentos: [
        { forma: 'pix', valor: 30 },
        { forma: 'fiado', valor: 20, pessoaId }
      ],
      totalFinal: 50,
      itens: baseItens,
      idCaixa: 1
    });

    expect(payload.id_cliente).toBe(pessoaId);
    expect(payload.fiados).toEqual([{ id_pessoa: pessoaId, valor: 20 }]);
  });

  test('multi-pay fiado without pessoaId is rejected to keep venda and fiado consistent', () => {
    expect(() =>
      buildVendaPayload({
        formaPagamento: 'multiplo',
        pagamentos: [
          { forma: 'pix', valor: 30 },
          { forma: 'fiado', valor: 20 }
        ],
        totalFinal: 50,
        itens: baseItens,
        idCaixa: 1
      })
    ).toThrow('Pagamento fiado exige um cliente vinculado.');
  });

  test('items with "56x Produto" naming use the prefix as quantity', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 100,
      totalFinal: 90,
      itens: [
        { id_produto: 7, nome: '3x Coca-cola', quantidade: 1, preco: 30 }
      ],
      idCaixa: 1
    });

    expect(payload.itens[0].quantidade).toBe(3);
    expect(payload.estoque[0]).toEqual({ id_produto: 7, quantidade: 3 });
  });

  test('estoque list excludes items without id_produto (e.g. avulso)', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      totalFinal: 10,
      itens: [
        { id_produto: 1, nome: 'Café', quantidade: 1, preco: 5 },
        { id_produto: null, nome: 'Item Avulso', quantidade: 1, preco: 5 }
      ],
      idCaixa: 1
    });

    expect(payload.itens).toHaveLength(2);
    expect(payload.estoque).toEqual([{ id_produto: 1, quantidade: 1 }]);
  });

  test('createdAt is included only when provided (offline replay path)', () => {
    const { payload: online } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      totalFinal: 10,
      itens: baseItens,
      idCaixa: 1
    });
    expect(online).not.toHaveProperty('created_at');

    const { payload: offline } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      totalFinal: 10,
      itens: baseItens,
      idCaixa: 1,
      createdAt: '2026-05-05T19:00:00.000Z'
    });
    expect(offline.created_at).toBe('2026-05-05T19:00:00.000Z');
  });

  test('client_sale_id is generated by default and can be provided for idempotency', () => {
    const { payload: generated } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      totalFinal: 10,
      itens: baseItens,
      idCaixa: 1
    });
    expect(generated.client_sale_id).toBeTruthy();

    const { payload: explicit } = buildVendaPayload({
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      totalFinal: 10,
      itens: baseItens,
      idCaixa: 1,
      clientSaleId: 'sale-test-123'
    });
    expect(explicit.client_sale_id).toBe('sale-test-123');
  });

  test('createClientSaleId returns a non-empty key', () => {
    expect(createClientSaleId()).toEqual(expect.any(String));
  });

  test('platform sale (e.g. ifood) keeps gross customer total in valor_total', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'ifood',
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1
    });

    expect(payload.forma_pagamento).toBe('ifood');
    expect(payload.valor_total).toBe(100);
    expect(payload.fiados).toEqual([]);
  });

  test('multi-pay with zero-value rows are dropped from pagamentos[]', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'multiplo',
      pagamentos: [
        { forma: 'pix', valor: 50 },
        { forma: 'cartao_debito', valor: 0 }
      ],
      totalFinal: 50,
      itens: baseItens,
      idCaixa: 1
    });

    expect(payload.pagamentos).toEqual([{ forma_pagamento: 'pix', valor: 50 }]);
  });

  test('platform fee with valid taxa_pct is computed and snapshotted', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'ifood',
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1,
      taxasPlataforma: [
        { plataforma_id: 'ifood', plataforma_nome: 'iFood', taxa_pct: 14, valor_bruto: 100 }
      ]
    });

    expect(payload.taxas_plataforma).toEqual([
      {
        plataforma_id: 'ifood',
        plataforma_nome: 'iFood',
        taxa_pct: 14,
        valor_bruto: 100,
        valor_taxa: 14
      }
    ]);
  });

  test('platform fee with taxa_pct = 0 is dropped (no row inserted)', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'rappi',
      totalFinal: 80,
      itens: baseItens,
      idCaixa: 1,
      taxasPlataforma: [
        { plataforma_id: 'rappi', plataforma_nome: 'Rappi', taxa_pct: 0, valor_bruto: 80 }
      ]
    });

    expect(payload.taxas_plataforma).toEqual([]);
  });

  test('multi-pay with platform line emits taxa for the platform portion only', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'multiplo',
      pagamentos: [
        { forma: 'ifood', valor: 60 },
        { forma: 'dinheiro', valor: 40 }
      ],
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1,
      // Caller (modal) is responsible for computing per-row valor_bruto
      taxasPlataforma: [
        { plataforma_id: 'ifood', plataforma_nome: 'iFood', taxa_pct: 14, valor_bruto: 60 }
      ]
    });

    expect(payload.taxas_plataforma).toHaveLength(1);
    expect(payload.taxas_plataforma[0].valor_bruto).toBe(60);
    expect(payload.taxas_plataforma[0].valor_taxa).toBe(8.4);
  });

  test('multi-pay with two platforms emits two taxa rows', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'multiplo',
      pagamentos: [
        { forma: 'ifood', valor: 50 },
        { forma: 'rappi', valor: 50 }
      ],
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1,
      taxasPlataforma: [
        { plataforma_id: 'ifood', plataforma_nome: 'iFood', taxa_pct: 14, valor_bruto: 50 },
        { plataforma_id: 'rappi', plataforma_nome: 'Rappi', taxa_pct: 23, valor_bruto: 50 }
      ]
    });

    expect(payload.taxas_plataforma).toHaveLength(2);
    expect(payload.taxas_plataforma[0].valor_taxa).toBe(7);
    expect(payload.taxas_plataforma[1].valor_taxa).toBe(11.5);
  });

  test('platform fee with missing plataforma_id is dropped', () => {
    const { payload } = buildVendaPayload({
      formaPagamento: 'ifood',
      totalFinal: 100,
      itens: baseItens,
      idCaixa: 1,
      taxasPlataforma: [
        { plataforma_id: '', plataforma_nome: '', taxa_pct: 14, valor_bruto: 100 }
      ]
    });

    expect(payload.taxas_plataforma).toEqual([]);
  });
});

describe('extractEffectiveQty', () => {
  test('uses prefix when nome starts with "Nx "', () => {
    expect(extractEffectiveQty({ id_produto: 1, nome: '5x Pão', quantidade: 1 })).toBe(5);
    expect(extractEffectiveQty({ id_produto: 1, nome: '12x Pão', quantidade: 1 })).toBe(12);
  });

  test('falls back to quantidade when nome has no prefix', () => {
    expect(extractEffectiveQty({ id_produto: 1, nome: 'Pão', quantidade: 3 })).toBe(3);
  });

  test('defaults to 1 when neither nome nor quantidade present', () => {
    expect(extractEffectiveQty({})).toBe(1);
  });

  test('ignores prefix on items without id_produto (avulso text could collide)', () => {
    expect(extractEffectiveQty({ id_produto: null, nome: '5x algo', quantidade: 2 })).toBe(2);
  });
});

describe('revertFiadoDebtForVenda', () => {
  function makeSupabase({ venda, fiadoPagamentos = [], rpcImpl }) {
    const calls = { rpc: [] };
    const queryMaybeSingle = (table, eqs) => {
      if (table === 'vendas' && eqs?.id === venda?.id) {
        return Promise.resolve({ data: venda, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    const supabase = {
      from(table) {
        const ctx = { table, eqs: {} };
        const builder = {
          select() { return builder; },
          eq(k, v) { ctx.eqs[k] = v; return builder; },
          maybeSingle() { return queryMaybeSingle(ctx.table, ctx.eqs); },
          then(resolve) {
            if (ctx.table === 'vendas_pagamentos') {
              return resolve({ data: fiadoPagamentos, error: null });
            }
            return resolve({ data: null, error: null });
          }
        };
        return builder;
      },
      rpc: vi.fn((name, args) => {
        calls.rpc.push({ name, args });
        return rpcImpl ? rpcImpl(name, args) : Promise.resolve({ data: null, error: null });
      }),
      _calls: calls
    };
    return supabase;
  }

  test('reverts full valor_total for single-fiado sale', async () => {
    const supabase = makeSupabase({
      venda: { id: 10, forma_pagamento: 'fiado', valor_total: 75, id_cliente: 'pessoa-1' },
      rpcImpl: () => Promise.resolve({ data: { valor_estornado: 75 }, error: null })
    });

    const result = await revertFiadoDebtForVenda(supabase, 10);

    expect(result.revertedTotal).toBe(75);
    expect(result.lines).toEqual([{ id_pessoa: 'pessoa-1', valor: 75 }]);
    expect(supabase.rpc).toHaveBeenCalledWith('fiado_estornar_venda', {
      p_id_venda: 10
    });
  });

  test('reverts only fiado portion of multi-pay sale', async () => {
    const supabase = makeSupabase({
      venda: { id: 11, forma_pagamento: 'multiplo', valor_total: 100, id_cliente: 'pessoa-2' },
      fiadoPagamentos: [{ forma_pagamento: 'fiado', valor: 30 }],
      rpcImpl: () => Promise.resolve({ data: { valor_estornado: 30 }, error: null })
    });

    const result = await revertFiadoDebtForVenda(supabase, 11);

    expect(result.revertedTotal).toBe(30);
    expect(result.lines).toEqual([{ id_pessoa: 'pessoa-2', valor: 30 }]);
    expect(supabase.rpc).toHaveBeenCalledWith('fiado_estornar_venda', { p_id_venda: 11 });
  });

  test('does nothing for non-fiado sale', async () => {
    const supabase = makeSupabase({
      venda: { id: 12, forma_pagamento: 'dinheiro', valor_total: 40, id_cliente: null }
    });

    const result = await revertFiadoDebtForVenda(supabase, 12);

    expect(result.revertedTotal).toBe(0);
    expect(result.lines).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
