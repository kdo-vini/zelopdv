import { describe, it, expect } from 'vitest';
import { computeDailyMetrics } from '../src/lib/server/intelligence/metrics.js';
import { makeVenda, makeItem, makePagamento } from './helpers/intelligenceFixtures.js';

describe('computeDailyMetrics', () => {
  it('calcula receita bruta e realizada para vendas PIX', () => {
    const vendas = [
      makeVenda({ id: 1, valorTotal: 100, forma: 'pix' }),
      makeVenda({ id: 2, valorTotal: 50, forma: 'pix' }),
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas: [] });
    expect(m.receita_bruta).toBe(150);
    expect(m.receita_realizada).toBe(150);
    expect(m.qtd_vendas).toBe(2);
    expect(m.ticket_medio).toBe(75);
    expect(m.fiado_emitido).toBe(0);
  });

  it('separa fiado da receita realizada, mas não do ticket comercial', () => {
    const vendas = [
      makeVenda({ id: 1, valorTotal: 100, forma: 'fiado' }),
      makeVenda({ id: 2, valorTotal: 200, forma: 'pix' }),
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas: [] });
    expect(m.receita_bruta).toBe(300);
    expect(m.fiado_emitido).toBe(100);
    expect(m.receita_realizada).toBe(200);
    // Ticket comercial = bruto / qtd — venda fiada continua sendo venda
    expect(m.ticket_medio).toBe(150);
  });

  it('regressão: aumento de fiado não reduz o ticket médio', () => {
    // Mesmo comportamento de compra (2 vendas de R$ 100), só muda a forma
    const semFiado = computeDailyMetrics({
      vendas: [
        makeVenda({ id: 1, valorTotal: 100, forma: 'pix' }),
        makeVenda({ id: 2, valorTotal: 100, forma: 'pix' }),
      ],
      itens: [], pagamentos: [], taxas: [],
    });
    const comFiado = computeDailyMetrics({
      vendas: [
        makeVenda({ id: 1, valorTotal: 100, forma: 'pix' }),
        makeVenda({ id: 2, valorTotal: 100, forma: 'fiado' }),
      ],
      itens: [], pagamentos: [], taxas: [],
    });
    expect(semFiado.ticket_medio).toBe(100);
    expect(comFiado.ticket_medio).toBe(100); // era 50 na semântica antiga (bug)
    // A dimensão de caixa continua correta e separada
    expect(comFiado.receita_realizada).toBe(100);
    expect(comFiado.fiado_emitido).toBe(100);
  });

  it('dedup: venda multiplo não soma valor_total duas vezes no mix', () => {
    const vendas = [
      makeVenda({ id: 1, valorTotal: 100, forma: 'multiplo' }),
    ];
    const pagamentos = [
      makePagamento({ idVenda: 1, forma: 'pix', valor: 60 }),
      makePagamento({ idVenda: 1, forma: 'dinheiro', valor: 40 }),
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos, taxas: [] });
    expect(m.receita_bruta).toBe(100);
    expect(m.receita_realizada).toBe(100);
    // Mix deve vir dos pagamentos, não da venda
    expect(m.mix_pagamentos.pix).toBe(60);
    expect(m.mix_pagamentos.dinheiro).toBe(40);
  });

  it('ticket_medio é null quando qtd_vendas = 0', () => {
    const m = computeDailyMetrics({ vendas: [], itens: [], pagamentos: [], taxas: [] });
    expect(m.qtd_vendas).toBe(0);
    expect(m.ticket_medio).toBeNull();
  });

  it('dia 100% fiado tem ticket comercial válido e receita realizada zero', () => {
    const vendas = [makeVenda({ id: 1, valorTotal: 100, forma: 'fiado' })];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas: [] });
    expect(m.receita_realizada).toBe(0);
    expect(m.ticket_medio).toBe(100);
  });

  it('agrega por_produto corretamente', () => {
    const itens = [
      makeItem({ idVenda: 1, idProduto: 10, nome: 'X-Bacon', qtd: 2, preco: 25 }),
      makeItem({ idVenda: 2, idProduto: 10, nome: 'X-Bacon', qtd: 1, preco: 25 }),
      makeItem({ idVenda: 3, idProduto: 11, nome: 'Coca 2L', qtd: 3, preco: 8 }),
    ];
    const m = computeDailyMetrics({ vendas: [], itens, pagamentos: [], taxas: [] });
    const xbacon = m.por_produto.find((p) => p.id_produto === 10);
    expect(xbacon.qtd).toBe(3);
    expect(xbacon.receita).toBe(75);
    const coca = m.por_produto.find((p) => p.id_produto === 11);
    expect(coca.qtd).toBe(3);
    expect(coca.receita).toBe(24);
  });

  it('agrupa itens sem id_produto por nome', () => {
    const itens = [
      makeItem({ idVenda: 1, idProduto: null, nome: 'Avulso', qtd: 1, preco: 10 }),
      makeItem({ idVenda: 2, idProduto: null, nome: 'Avulso', qtd: 2, preco: 10 }),
    ];
    const m = computeDailyMetrics({ vendas: [], itens, pagamentos: [], taxas: [] });
    expect(m.por_produto).toHaveLength(1);
    expect(m.por_produto[0].qtd).toBe(3);
    expect(m.por_produto[0].receita).toBe(30);
  });

  it('por_hora tem 24 posições', () => {
    const m = computeDailyMetrics({ vendas: [], itens: [], pagamentos: [], taxas: [] });
    expect(m.por_hora).toHaveLength(24);
    expect(m.por_hora.every((v) => v === 0)).toBe(true);
  });

  it('por_hora aloca vendas na hora local correta', () => {
    // 15:00 UTC = 12:00 BRT
    const vendas = [
      makeVenda({ id: 1, valorTotal: 100, forma: 'pix', createdAt: '2026-07-09T15:00:00.000Z' }),
      // 02:30 UTC = 23:00 BRT do dia anterior (mas ainda dentro do range de coleta)
      makeVenda({ id: 2, valorTotal: 50, forma: 'pix', createdAt: '2026-07-09T02:30:00.000Z' }),
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas: [] });
    expect(m.por_hora[12]).toBe(100);
    expect(m.por_hora[23]).toBe(50);
  });

  it('descontos taxa_entrega e custos_plataforma', () => {
    const vendas = [
      makeVenda({ id: 1, valorTotal: 100, desconto: 10 }),
      makeVenda({ id: 2, valorTotal: 50, tipoPedido: 'delivery', taxaEntrega: 8 }),
    ];
    const taxas = [
      { plataforma_id: 'ifood', valor_taxa: 5, valor_bruto: 50 },
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas });
    expect(m.descontos).toBe(10);
    expect(m.taxa_entrega).toBe(8);
    expect(m.custos_plataforma).toBe(5);
  });

  it('mix_pagamentos inclui todos os campos normalizados', () => {
    const vendas = [
      makeVenda({ id: 1, valorTotal: 300, forma: 'pix' }),
      makeVenda({ id: 2, valorTotal: 200, forma: 'dinheiro' }),
    ];
    const m = computeDailyMetrics({ vendas, itens: [], pagamentos: [], taxas: [] });
    expect(m.mix_pagamentos.pix).toBe(300);
    expect(m.mix_pagamentos.dinheiro).toBe(200);
    expect(m.mix_pagamentos.fiado).toBe(0);
    expect(m.mix_pagamentos.outros).toBe(0);
  });

  it('fiado_saldo_total respeita null', () => {
    const m1 = computeDailyMetrics({ vendas: [], itens: [], pagamentos: [], taxas: [], saldoFiadoTotal: 500 });
    expect(m1.fiado_saldo_total).toBe(500);
    const m2 = computeDailyMetrics({ vendas: [], itens: [], pagamentos: [], taxas: [], saldoFiadoTotal: null });
    expect(m2.fiado_saldo_total).toBeNull();
  });

  it('zero vendas não produz NaN ou Infinity em campo algum', () => {
    const m = computeDailyMetrics({ vendas: [], itens: [], pagamentos: [], taxas: [] });
    const values = Object.values(m).filter((v) => typeof v === 'number');
    for (const v of values) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // ticket_medio deve ser null, não NaN
    expect(m.ticket_medio).toBeNull();
  });
});
