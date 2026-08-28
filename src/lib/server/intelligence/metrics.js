/**
 * @file Módulo puro de métricas diárias.
 * Recebe arrays de dados brutos (vendas, itens, pagamentos, taxas) e
 * retorna um objeto DailyMetrics. Não faz I/O — testável sem mock.
 *
 * Reusa funções de src/lib/finance/caixa.js (código isomórfico já testado).
 */

import { money, calculatePaymentSummary, calculatePlatformFees } from '$lib/finance/caixa.js';
import { getHourInTimezone } from './tz.js';

/**
 * @param {Array} vendas
 * @param {Array} pagamentos
 * @returns {number} total de fiado emitido
 */
function calcFiadoEmitido(vendas, pagamentos) {
  // Vendas puras com forma fiado
  let total = vendas
    .filter((v) => v.forma_pagamento === 'fiado')
    .reduce((s, v) => s + money(v.valor_total), 0);
  // Linhas fiado de vendas multiplo
  total += pagamentos
    .filter((p) => (p.forma_pagamento || p.forma) === 'fiado')
    .reduce((s, p) => s + money(p.valor || 0), 0);
  return money(total);
}

/**
 * @param {Array} itens
 * @returns {Array<{id_produto: number|null, nome: string, qtd: number, receita: number}>}
 */
function aggregateByProduct(itens) {
  const map = new Map();
  for (const item of itens || []) {
    const idProduto = item.id_produto ?? null;
    const nome = item.nome_produto_na_venda || '(sem nome)';
    const qtd = Number(item.quantidade) || 0;
    const preco = money(item.preco_unitario_na_venda || 0);
    const receitaItem = money(qtd * preco);

    // Usa id_produto como chave primária; fallback para nome se id for null
    const key = idProduto != null ? `id:${idProduto}` : `nome:${nome}`;
    const existing = map.get(key);
    if (existing) {
      existing.qtd = money(existing.qtd + qtd);
      existing.receita = money(existing.receita + receitaItem);
      // Mantém o primeiro nome encontrado para chaves por id
    } else {
      map.set(key, {
        id_produto: idProduto,
        nome,
        qtd: money(qtd),
        receita: money(receitaItem),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.receita - a.receita);
}

/**
 * @param {Array} vendas
 * @returns {number[]} 24 posições, R$ por hora local (America/Sao_Paulo)
 */
function aggregateByHour(vendas) {
  const horas = new Array(24).fill(0);
  for (const v of vendas || []) {
    if (!v.created_at) continue;
    const hour = getHourInTimezone(v.created_at);
    const valor = money(v.valor_total || 0);
    horas[hour] = money(horas[hour] + valor);
  }
  return horas;
}

/**
 * @param {Object} params
 * @param {Array} params.vendas - vendas do período
 * @param {Array} params.itens - vendas_itens do período
 * @param {Array} params.pagamentos - vendas_pagamentos do período
 * @param {Array} params.taxas - vendas_taxas_plataforma do período
 * @param {number|null} params.saldoFiadoTotal - Σ pessoas.saldo_fiado no momento do cálculo
 * @returns {DailyMetrics}
 */
export function computeDailyMetrics({ vendas, itens, pagamentos, taxas, saldoFiadoTotal }) {
  vendas = vendas || [];
  itens = itens || [];
  pagamentos = pagamentos || [];
  taxas = taxas || [];

  // Receita bruta = Σ valor_total (inclui fiado)
  const receita_bruta = money(vendas.reduce((s, v) => s + money(v.valor_total || 0), 0));

  // Fiado emitido
  const fiado_emitido = calcFiadoEmitido(vendas, pagamentos);

  // Receita realizada = bruto - fiado emitido
  const receita_realizada = money(receita_bruta - fiado_emitido);

  // Quantidade de vendas (cupons)
  const qtd_vendas = vendas.length;

  // Ticket médio COMERCIAL: valor médio por venda, independente da forma de
  // pagamento. Venda fiada é venda — usar receita_realizada aqui faria um
  // aumento de fiado parecer queda de ticket (contaminaria AVG_TICKET_DOWN).
  // receita_realizada mede caixa (quanto entrou), não comportamento de compra.
  // Nota: /relatorios exibe um "ticket médio" baseado em receita sem fiado
  // (visão de caixa); a divergência é intencional e documentada no plano.
  const ticket_medio = qtd_vendas > 0 ? money(receita_bruta / qtd_vendas) : null;

  // Descontos
  const descontos = money(vendas.reduce((s, v) => s + money(v.valor_desconto || 0), 0));

  // Taxa de entrega (só delivery)
  const taxa_entrega = money(
    vendas
      .filter((v) => v.tipo_pedido === 'delivery')
      .reduce((s, v) => s + money(v.taxa_entrega || 0), 0)
  );

  // Custos de plataforma (iFood etc.)
  const custos_plataforma = money(calculatePlatformFees(taxas).total);

  // Mix de pagamentos usando a função já testada do caixa.js
  const paymentSummary = calculatePaymentSummary(vendas, pagamentos);

  // Mapa normalizado de formas de pagamento
  const mix_pagamentos = {
    pix: paymentSummary.pix,
    dinheiro: paymentSummary.dinheiro,
    cartao: paymentSummary.totalCartao,
    vale_refeicao: paymentSummary.valeRefeicao,
    fiado: paymentSummary.fiado,
    outros: money(
      receita_bruta
      - paymentSummary.pix
      - paymentSummary.dinheiro
      - paymentSummary.totalCartao
      - paymentSummary.valeRefeicao
      - paymentSummary.fiado
    ),
  };

  // Agregação por produto
  const por_produto = aggregateByProduct(itens);

  // Curva horária (24h, America/Sao_Paulo)
  const por_hora = aggregateByHour(vendas);

  return {
    receita_bruta,
    receita_realizada,
    qtd_vendas,
    ticket_medio,
    fiado_emitido,
    fiado_saldo_total: saldoFiadoTotal != null ? money(saldoFiadoTotal) : null,
    descontos,
    taxa_entrega,
    custos_plataforma,
    mix_pagamentos,
    por_produto,
    por_hora,
    backfilled: false,
  };
}
