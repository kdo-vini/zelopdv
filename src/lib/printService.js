// src/lib/printService.js
// API de impressão unificada — ESC/POS via WebUSB primeiro, iframe HTML como fallback.
// Todos os pontos de impressão do app usam exclusivamente as funções deste módulo.

import { sendBytes, isWebUsbSupported, getPairedInfo } from '$lib/printer.js';
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
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    const cleanup = () =>
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
        resolve();
      }, 500);

    try { iframe.contentWindow.addEventListener('afterprint', cleanup); } catch {}
    setTimeout(cleanup, 15000); // segurança

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    } catch (e) {
      console.warn('[print] iframe write falhou:', e?.message);
      cleanup();
    }
  });
}

/* --------------------------------------------------------------------------
 * Helpers internos
 * -------------------------------------------------------------------------- */

async function tryEscPos(bytes) {
  if (!isWebUsbSupported() || !getPairedInfo()) return false;
  try {
    await sendBytes(bytes);
    return true;
  } catch (e) {
    console.warn('[print] ESC/POS falhou, caindo no iframe:', e?.message);
    addToast(
      'A impressao USB direta falhou. Abrindo a impressao pelo Windows agora. Se aparecer aviso de sobreposicao/interferencia, use esta opcao.',
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
  const ok = await tryEscPos(bytes);
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
  const ok = await tryEscPos(bytes);
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
  const ok = await tryEscPos(bytes);
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
  if (!isWebUsbSupported() || !getPairedInfo()) return false;
  await sendBytes(bytes);
  return true;
}

/** Re-exporta helpers de perfil para os componentes. */
export { isWebUsbSupported, getPairedInfo };
