/**
 * @file Fixtures compartilhadas para testes do Intelligence Engine.
 * Todas as datas são literais fixas — sem Date.now().
 */

/**
 * Cria uma venda fixture.
 * @param {Object} overrides
 * @returns {Object}
 */
export function makeVenda(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    id_usuario: overrides.idUsuario ?? 'u1',
    valor_total: overrides.valorTotal ?? 50,
    forma_pagamento: overrides.forma ?? 'pix',
    created_at: overrides.createdAt ?? '2026-07-09T15:00:00.000Z',
    valor_desconto: overrides.desconto ?? 0,
    tipo_pedido: overrides.tipoPedido ?? null,
    taxa_entrega: overrides.taxaEntrega ?? 0,
    ...overrides,
  };
}

/**
 * Cria um item de venda fixture.
 * @param {Object} overrides
 * @returns {Object}
 */
export function makeItem(overrides = {}) {
  return {
    id_venda: overrides.idVenda ?? 1,
    id_produto: overrides.idProduto ?? 10,
    nome_produto_na_venda: overrides.nome ?? 'X-Bacon',
    quantidade: overrides.qtd ?? 1,
    preco_unitario_na_venda: overrides.preco ?? 25,
    ...overrides,
  };
}

/**
 * Cria um pagamento fixture.
 * @param {Object} overrides
 * @returns {Object}
 */
export function makePagamento(overrides = {}) {
  return {
    id_venda: overrides.idVenda ?? 1,
    forma_pagamento: overrides.forma ?? 'pix',
    valor: overrides.valor ?? 50,
    ...overrides,
  };
}

/**
 * Cria um snapshot fixture para o histórico de detectores.
 * Usa weekdayFixture para gerar datas consistentes com o dia da semana.
 * @param {Object} overrides
 * @returns {Object}
 */
export function makeSnapshot(overrides = {}) {
  const date = overrides.date ?? '2026-07-09';
  const receita = overrides.receitaBruta ?? 1000;
  const qtd = overrides.qtd ?? 40;
  const ticket = qtd > 0 ? receita / qtd : null;
  return {
    user_id: overrides.userId ?? 'u1',
    snapshot_date: date,
    receita_bruta: receita,
    receita_realizada: receita,
    qtd_vendas: qtd,
    ticket_medio: ticket,
    fiado_saldo_total: overrides.fiadoSaldo ?? null,
    metrics: {
      receita_bruta: receita,
      receita_realizada: receita,
      qtd_vendas: qtd,
      ticket_medio: ticket,
      fiado_emitido: overrides.fiadoEmitido ?? 0,
      fiado_saldo_total: overrides.fiadoSaldo ?? null,
      descontos: 0,
      taxa_entrega: 0,
      custos_plataforma: 0,
      mix_pagamentos: { pix: receita, dinheiro: 0, cartao: 0, fiado: 0, outros: 0 },
      por_produto: [],
      por_hora: new Array(24).fill(0),
      backfilled: overrides.backfilled ?? false,
    },
    engine_version: 'v1.0.0',
    computed_at: '2026-07-09T04:00:00.000Z',
  };
}

/**
 * Cria um fechamento de caixa fixture.
 * @param {Object} overrides
 * @returns {Object}
 */
export function makeFechamento(overrides = {}) {
  return {
    data_fechamento: overrides.date ?? '2026-07-09',
    diferenca: overrides.diferenca ?? 0,
    total_geral: overrides.totalGeral ?? 1500,
    ...overrides,
  };
}

/**
 * Cria um produto fixture (para estoque).
 * @param {Object} overrides
 * @returns {Object}
 */
export function makeProduto(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    nome: overrides.nome ?? 'Coca 2L',
    estoque_atual: overrides.estoque ?? 10,
    controlar_estoque: overrides.controlarEstoque ?? true,
    ...overrides,
  };
}

/**
 * Retorna métricas zeradas (para dia sem vendas).
 * @returns {Object}
 */
export function zeroMetrics() {
  return {
    receita_bruta: 0,
    receita_realizada: 0,
    qtd_vendas: 0,
    ticket_medio: null,
    fiado_emitido: 0,
    fiado_saldo_total: null,
    descontos: 0,
    taxa_entrega: 0,
    custos_plataforma: 0,
    mix_pagamentos: { pix: 0, dinheiro: 0, cartao: 0, fiado: 0, outros: 0 },
    por_produto: [],
    por_hora: new Array(24).fill(0),
    backfilled: false,
  };
}
