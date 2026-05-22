// src/lib/printService.js
// API de impressão unificada — Zelo Impressão local primeiro, iframe HTML como fallback.
// Todos os pontos de impressão do app usam exclusivamente as funções deste módulo.

import { sendBytes, isWebUsbSupported, getPairedInfo } from '$lib/printer.js';
import {
  fallbackToBrowserPrint,
  getZeloImpressaoFriendlyMessage,
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
    console.warn('[print] Zelo Impressão indisponível, caindo no navegador:', e?.message);
    addToast(
      getZeloImpressaoFriendlyMessage(e),
      'warning',
      7000
    );
    return false;
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
  }

  if (!isWebUsbSupported() || !getPairedInfo()) return false;
  await sendBytes(bytes);
  return true;
}

/** Re-exporta helpers de perfil para os componentes. */
export { isWebUsbSupported, getPairedInfo };
