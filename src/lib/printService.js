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
import { enqueueRemotePrintJob } from '$lib/remotePrintQueue.js';
import { supabase } from '$lib/supabaseClient.js';

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

function randomJobId() {
  return globalThis.crypto?.randomUUID?.()
    || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

function bytesToBase64(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  for (let index = 0; index < buffer.length; index += 1) binary += String.fromCharCode(buffer[index]);
  return btoa(binary);
}

async function tryZeloImpressao(bytes, payload, jobType, metadata = {}) {
  const jobId = randomJobId();
  const envelope = {
    jobId,
    source: 'zelopdv',
    ...(companyStoreIdFrom(payload) ? { companyStoreId: companyStoreIdFrom(payload) } : {}),
    type: jobType,
    timestamp: new Date().toISOString(),
    content: { format: 'raw_escpos_base64', base64: bytesToBase64(bytes) },
    metadata,
  };
  try {
    await sendRawEscposPrintJob({
      jobId,
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
    if (!outcomeUnknown && supabase) {
      try {
        const queued = await enqueueRemotePrintJob(supabase, envelope);
        addToast(
          queued.stationOnline
            ? 'Impressão enviada ao computador da loja.'
            : 'Impressão guardada. Ela sairá quando o computador da loja estiver online.',
          queued.stationOnline ? 'success' : 'info',
          6000,
        );
        return true;
      } catch (queueError) {
        console.warn('[print] Falha ao encaminhar para a estação:', queueError?.message);
      }
    }
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
  const envelope = {
    jobId: automatic ? String(order.id) : randomJobId(),
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
  };
  if (automatic) {
    if (!supabase) throw new Error('A fila de impressão não está disponível.');
    const queued = await enqueueRemotePrintJob(supabase, envelope);
    return { ok: true, queued: true, ...queued };
  }
  try {
    return await sendPrintJob(envelope);
  } catch (error) {
    const outcomeUnknown = error?.code === 'PRINT_OUTCOME_UNKNOWN' || error?.retrySafe === false;
    if (outcomeUnknown || !supabase) throw error;
    const queued = await enqueueRemotePrintJob(supabase, envelope);
    addToast(
      queued.stationOnline
        ? 'Comanda enviada ao computador da loja.'
        : 'Comanda guardada até o computador da loja ficar online.',
      queued.stationOnline ? 'success' : 'info',
      6000,
    );
    return { ok: true, queued: true, ...queued };
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
    if (e?.code === 'PRINT_OUTCOME_UNKNOWN' || e?.retrySafe === false) throw e;
  }

  if (!isWebUsbSupported() || !getPairedInfo()) return false;
  await sendBytes(bytes);
  return true;
}

/** Re-exporta helpers de perfil para os componentes. */
export { isWebUsbSupported, getPairedInfo };
