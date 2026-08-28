import { STANDARD_PAYMENT_FORMS as paymentMethodForms } from './paymentMethods.js';

export const STANDARD_PAYMENT_FORMS = paymentMethodForms;

/**
 * Retorna o preço do produto para a tabela ativa.
 * null em preco_2/preco_3 significa "usar preço principal como fallback".
 * @param {{ preco: number, preco_2?: number|null, preco_3?: number|null }} produto
 * @param {1|2|3} tabela
 */
export function getPrecoTabela(produto, tabela) {
  if (tabela === 2 && produto.preco_2 != null) return produto.preco_2;
  if (tabela === 3 && produto.preco_3 != null) return produto.preco_3;
  return produto.preco;
}
export function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function paymentForma(payment) {
  return payment?.forma_pagamento || payment?.forma || '';
}

export function paymentValue(payment) {
  return money(payment?.valor);
}

export function calculateSaleSettlement({ formaPagamento, valorRecebido = 0, pagamentos = [], totalFinal = 0 }) {
  const total = money(totalFinal);

  if (formaPagamento === 'multiplo') {
    const cashReceived = money(
      pagamentos
        .filter((p) => paymentForma(p) === 'dinheiro')
        .reduce((sum, p) => sum + paymentValue(p), 0)
    );
    const nonCashTotal = money(
      pagamentos
        .filter((p) => paymentForma(p) !== 'dinheiro')
        .reduce((sum, p) => sum + paymentValue(p), 0)
    );
    const requiredCash = money(Math.max(0, total - nonCashTotal));
    const change = money(Math.max(0, cashReceived - requiredCash));
    let changeToApply = change;

    const paymentRows = pagamentos.map((p) => {
      const forma = paymentForma(p);
      const value = paymentValue(p);
      if (forma !== 'dinheiro') return { ...p, forma, valor: value };

      const netValue = money(Math.max(0, value - changeToApply));
      changeToApply = money(Math.max(0, changeToApply - value));
      return { ...p, forma, valor: netValue };
    });

    return {
      formaPagamento: 'multiplo',
      valorRecebido: cashReceived > 0 ? cashReceived : null,
      valorTroco: change,
      cashRecebido: cashReceived,
      paymentRows
    };
  }

  const received = formaPagamento === 'dinheiro' ? money(valorRecebido) : null;
  const change = formaPagamento === 'dinheiro' ? money(Math.max(0, money(valorRecebido) - total)) : 0;

  return {
    formaPagamento,
    valorRecebido: received,
    valorTroco: change,
    cashRecebido: formaPagamento === 'dinheiro' ? money(valorRecebido) : 0,
    paymentRows: []
  };
}

export function validatePaymentCoverage({ formaPagamento, valorRecebido = 0, pagamentos = [], totalFinal = 0 }) {
  const total = money(totalFinal);

  if (formaPagamento !== 'multiplo') {
    if (!formaPagamento) return 'Selecione a forma de pagamento.';
    if (formaPagamento === 'dinheiro' && money(valorRecebido) < total) {
      return 'Valor recebido insuficiente para cobrir o total.';
    }
    return '';
  }

  const totalPayments = money(pagamentos.reduce((sum, p) => sum + paymentValue(p), 0));
  const nonCashTotal = money(
    pagamentos
      .filter((p) => paymentForma(p) !== 'dinheiro')
      .reduce((sum, p) => sum + paymentValue(p), 0)
  );

  if (totalPayments <= 0) return 'Adicione ao menos um pagamento.';
  if (totalPayments < total) return 'A soma dos pagamentos e insuficiente para o total.';
  if (nonCashTotal > total) return 'Pagamentos nao-dinheiro nao podem exceder o total da comanda.';

  return '';
}

export function calculatePaymentSummary(vendas = [], pagamentos = []) {
  const totalsByForm = {};
  const saleIdsWithPaymentRows = new Set(
    (pagamentos || [])
      .map((payment) => payment?.id_venda)
      .filter(Boolean)
  );

  for (const venda of vendas || []) {
    if (venda?.forma_pagamento === 'multiplo') continue;
    if (saleIdsWithPaymentRows.has(venda?.id)) continue;
    const forma = venda?.forma_pagamento || 'outro';
    totalsByForm[forma] = money((totalsByForm[forma] || 0) + money(venda?.valor_total));
  }

  for (const payment of pagamentos || []) {
    const forma = paymentForma(payment) || 'outro';
    totalsByForm[forma] = money((totalsByForm[forma] || 0) + paymentValue(payment));
  }

  const cashTotal = money(
    (vendas || [])
      .filter((v) => v?.forma_pagamento === 'dinheiro' && !saleIdsWithPaymentRows.has(v?.id))
      .reduce((sum, v) => {
        const received = money(v?.valor_recebido || v?.valor_total);
        return sum + Math.max(0, received - money(v?.valor_troco));
      }, 0)
    + (pagamentos || [])
      .filter((p) => paymentForma(p) === 'dinheiro')
      .reduce((sum, p) => sum + paymentValue(p), 0)
  );

  totalsByForm.dinheiro = cashTotal;

  const fiadoTotal = money(totalsByForm.fiado || 0);
  const totalBruto = money((vendas || []).reduce((sum, venda) => sum + money(venda?.valor_total), 0));
  // Fiado é dívida (a receber), não receita realizada — não entra em totais do caixa.
  const totalGeral = money(totalBruto - fiadoTotal);

  return {
    totalsByForm,
    dinheiro: cashTotal,
    pix: money(totalsByForm.pix),
    cartaoDebito: money(totalsByForm.cartao_debito),
    cartaoCredito: money(totalsByForm.cartao_credito),
    cartaoLegacy: money(totalsByForm.cartao),
    valeRefeicao: money(totalsByForm.vale_refeicao),
    fiado: fiadoTotal,
    totalCartao: money((totalsByForm.cartao_debito || 0) + (totalsByForm.cartao_credito || 0) + (totalsByForm.cartao || 0)),
    totalGeral,
    totalBruto
  };
}

/**
 * Creates the immutable payment-breakdown snapshot stored with a cash closing.
 * `multiplo` marks a sale with payment rows and is not a financial method itself.
 *
 * @param {Record<string, number>} totalsByForm
 * @returns {Record<string, number>}
 */
export function buildPaymentTotalsSnapshot(totalsByForm = {}) {
  const snapshot = {};

  for (const [forma, total] of Object.entries(totalsByForm || {})) {
    const normalizedForma = typeof forma === 'string' ? forma.trim() : '';
    const normalizedTotal = money(total);
    if (!normalizedForma || normalizedForma === 'multiplo' || normalizedTotal <= 0) continue;
    snapshot[normalizedForma] = normalizedTotal;
  }

  return snapshot;
}

export function calculateMovementSummary(movs = []) {
  return {
    sangria: money((movs || []).filter((m) => m?.tipo === 'sangria').reduce((sum, m) => sum + money(m?.valor), 0)),
    suprimento: money((movs || []).filter((m) => m?.tipo === 'suprimento').reduce((sum, m) => sum + money(m?.valor), 0))
  };
}

export function calculateExpectedDrawer({ valorInicial = 0, dinheiroLiquido = 0, sangria = 0, suprimento = 0 }) {
  return money(money(valorInicial) + money(dinheiroLiquido) - money(sangria) + money(suprimento));
}

export function calculateRevenue({ totalGeral = 0, despesas = 0, custosPlataforma = 0 }) {
  return money(money(totalGeral) - money(despesas) - money(custosPlataforma));
}

export function calculateRestaurantRevenue({ totalGeral = 0, taxaEntrega = 0, despesas = 0, custosPlataforma = 0 }) {
  return money(money(totalGeral) - money(taxaEntrega) - money(despesas) - money(custosPlataforma));
}

/**
 * Aggregate platform fees from vendas_taxas_plataforma rows.
 * Returns total + per-platform breakdown sorted desc by total.
 *
 * @param {Array} taxas - rows from `vendas_taxas_plataforma`:
 *   [{ plataforma_id, plataforma_nome, valor_taxa, valor_bruto, taxa_pct }]
 * @returns {{ total: number, byPlatform: Array<{id, nome, total, brutoTotal, qtdVendas}> }}
 */
export function calculatePlatformFees(taxas = []) {
  const map = new Map();
  let total = 0;

  for (const row of taxas || []) {
    const id = row?.plataforma_id || 'desconhecida';
    const nome = row?.plataforma_nome || id.replace(/_/g, ' ');
    const valorTaxa = money(row?.valor_taxa || 0);
    const valorBruto = money(row?.valor_bruto || 0);
    if (valorTaxa <= 0) continue;

    total = money(total + valorTaxa);
    const existing = map.get(id) || { id, nome, total: 0, brutoTotal: 0, qtdVendas: 0 };
    existing.total = money(existing.total + valorTaxa);
    existing.brutoTotal = money(existing.brutoTotal + valorBruto);
    existing.qtdVendas += 1;
    map.set(id, existing);
  }

  const byPlatform = Array.from(map.values()).sort((a, b) => b.total - a.total);

  return { total, byPlatform };
}
