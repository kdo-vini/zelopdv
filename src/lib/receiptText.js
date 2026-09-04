import { maskDocumento } from '$lib/masks.js';
import { formatPaymentMethod } from '$lib/finance/paymentMethods.js';

/**
 * Builds the text used by the sale-success modal for WhatsApp and copy.
 * The shape accepts the sale object kept by the PDV after confirmation.
 */
export function buildReceiptText({ venda = {}, empresa = null } = {}) {
  if (!venda || !venda.itens) return '';

  let text = `*${(empresa?.nome_exibicao || 'COMPROVANTE DE PEDIDO').toUpperCase()}*\n`;

  if (empresa?.documento) text += `CPF/CNPJ: ${maskDocumento(empresa.documento)}\n`;
  if (empresa?.endereco) text += `${empresa.endereco}\n`;

  text += `\n ${new Date().toLocaleString()}\n`;
  text += `------------------------------\n`;

  venda.itens.forEach(item => {
    const totalItem = (item.quantidade * item.preco).toFixed(2);
    text += `${item.quantidade}x ${item.nome}\n`;
    text += `   R$ ${totalItem}\n`;
  });

  text += `------------------------------\n`;
  const desconto = Number(venda.desconto ?? venda.valor_desconto ?? 0);
  if (desconto > 0) text += `Desconto: -R$ ${desconto.toFixed(2)}\n`;
  text += `*TOTAL: R$ ${Number(venda.total || 0).toFixed(2)}*\n`;

  const formaPagamento = venda.formaPagamento ?? venda.forma_pagamento;
  if (venda.pagamentos && venda.pagamentos.length > 0) {
    text += `Pgto: ${venda.pagamentos.map(p => `${formatPaymentMethod(p.forma || p.forma_pagamento)} (R$ ${Number(p.valor || 0).toFixed(2)})`).join(', ')}\n`;
  } else if (formaPagamento) {
    text += `Pgto: ${formatPaymentMethod(formaPagamento)}\n`;
  }

  text += `\n_Obrigado pela preferência!_`;
  text += `\n_ZeloPDV - Sistema de Gestão de Vendas_`;

  return text;
}
