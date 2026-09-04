// src/lib/printService.js
// API de impressão unificada — Zelo Impressão local primeiro, iframe HTML como fallback.
// Todos os pontos de impressão do app usam exclusivamente as funções deste módulo.

import { sendBytes, isWebUsbSupported, getPairedInfo } from '$lib/printer.js';
import {
  fallbackToBrowserPrint,
  getZeloImpressaoFriendlyMessage,
  sendPrintJob,
  sendRawEscposPrintJob,
  sendTestPrint,
} from '$lib/zeloImpressaoClient.js';
import {
  buildVendaEscPos,
  buildMovCaixaEscPos,
  buildPagamentoFiadoEscPos,
  buildTesteEscPos,
} from '$lib/escpos.js';
import {
  buildReceiptHTML,
  buildMovCaixaHTML,
  buildPagamentoFiadoHTML,
} from '$lib/receipt.js';
import { buildOrderText } from '$lib/orderPrint.js';
import { addToast } from '$lib/stores/ui.js';

/* --------------------------------------------------------------------------
 * Iframe fallback — sem popup, funciona em PWA, sem bloqueio de popup.
 * -------------------------------------------------------------------------- */

function printViaIframe(html) {
  return fallbackToBrowserPrint(html);
}

/* --------------------------------------------------------------------------
 * Helpers internos
 * -------------------------------------------------------------------------- */

function companyStoreIdFrom(payload) {
  const est = payload?.estabelecimento || {};
  return est.id || est.empresa_id || est.user_id || est.owner_id || undefined;
}

async function tryZeloImpressao(bytes, payload, jobType, metadata = {}) {
  try {
    await sendRawEscposPrintJob({
      source: 'zelopdv',
      companyStoreId: companyStoreIdFrom(payload),
      bytes,
      type: jobType,
      metadata,
    });
    return true;
  } catch (e) {
    const outcomeUnknown = e?.code === 'PRINT_OUTCOME_UNKNOWN' || e?.retrySafe === false;
    console.warn(outcomeUnknown ? '[print] Impressão sem confirmação:' : '[print] Falha antes da impressão:', e?.message);
    addToast(
      getZeloImpressaoFriendlyMessage(e),
      'warning',
      7000
    );
    // Treat uncertainty as handled: a second transport could print a duplicate.
    return outcomeUnknown;
  }
}

/* --------------------------------------------------------------------------
 * API pública
 * -------------------------------------------------------------------------- */

/**
 * Imprime cupom de venda.
 * Tenta ESC/POS → se não disponível ou falhar → HTML iframe.
 *
 * @param {{ estabelecimento: import('./escpos.js').EstabelecimentoCupom, venda: import('./escpos.js').VendaCupom, opcoes?: object }} payload
 */
export async function printVenda(payload) {
  const bytes = buildVendaEscPos(payload);
  const ok = await tryZeloImpressao(bytes, payload, 'receipt', {
    numeroVenda: payload?.venda?.numeroVenda || payload?.venda?.idVenda,
    tipoPedido: payload?.venda?.tipoPedido,
  });
  if (!ok) {
    const html = buildReceiptHTML(payload);
    await printViaIframe(html);
  }
}

/**
 * Imprime cupom de movimentação de caixa (sangria / suprimento).
 *
 * @param {{ estabelecimento: object, mov: object }} payload
 */
export async function printMovCaixa(payload) {
  const bytes = buildMovCaixaEscPos(payload);
  const ok = await tryZeloImpressao(bytes, payload, 'receipt', {
    documentType: 'movimentacao_caixa',
    idMov: payload?.mov?.idMov,
  });
  if (!ok) {
    const html = buildMovCaixaHTML(payload);
    await printViaIframe(html);
  }
}

/**
 * Imprime recibo de pagamento de fiado.
 *
 * @param {{ estabelecimento: object, pagamento: { nomePessoa: string, valor: number, saldoAnterior?: number, saldoAtual?: number } }} payload
 */
export async function printPagamentoFiado(payload) {
  const bytes = buildPagamentoFiadoEscPos(payload);
  const ok = await tryZeloImpressao(bytes, payload, 'receipt', {
    documentType: 'pagamento_fiado',
    nomePessoa: payload?.pagamento?.nomePessoa,
  });
  if (!ok) {
    const html = buildPagamentoFiadoHTML(payload);
    await printViaIframe(html);
  }
}

export async function printOrder(order, businessName = 'ZeloPDV', companyStoreId, { automatic = false } = {}) {
  if (automatic && (!order?.canonical || !order?.id || !companyStoreId)) {
    throw Object.assign(new Error('A impressão automática precisa do pedido e da loja confirmados.'), {
      code: 'AUTO_PRINT_IDENTITY_REQUIRED', retrySafe: false,
    });
  }
  const text = buildOrderText(order, businessName);
  return sendPrintJob({
    source: 'zelopdv',
    ...(companyStoreId ? { companyStoreId } : {}),
    intent: automatic
      ? { mode: 'automatic', orderId: String(order.id), purpose: 'order_ticket' }
      : { mode: 'manual' },
    type: 'kitchen_order',
    timestamp: new Date().toISOString(),
    content: { format: 'text', text },
    metadata: {
      orderId: order?.id,
      status: order?.status,
      customerPhone: order?.customerPhone || order?.customer_phone || order?.telefone_cliente,
    },
  });
}

/**
 * Imprime página de teste (usado em /perfil → Integrações).
 * Só tenta ESC/POS — se não estiver pareado, retorna false e o caller avisa o usuário.
 *
 * @param {object} estabelecimento
 * @returns {Promise<boolean>} true = imprimiu via USB, false = sem impressora pareada
 */
export async function printTeste(estabelecimento) {
  const bytes = buildTesteEscPos(estabelecimento);
  try {
    await sendTestPrint();
    return true;
  } catch (e) {
    console.warn('[print] teste via Zelo Impressão falhou:', e?.message);
    if (e?.code === 'PRINT_OUTCOME_UNKNOWN' || e?.retrySafe === false) throw e;
  }

  if (!isWebUsbSupported() || !getPairedInfo()) return false;
  await sendBytes(bytes);
  return true;
}

/** Re-exporta helpers de perfil para os componentes. */
export { isWebUsbSupported, getPairedInfo };
