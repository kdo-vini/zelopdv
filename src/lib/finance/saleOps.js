import { calculateSaleSettlement, money } from './caixa.js';

/**
 * Extract effective quantity from a comanda item.
 * Supports the "56x Produto" naming convention used in /app.
 */
export function extractEffectiveQty(item) {
  if (item?.id_produto && typeof item?.nome === 'string') {
    const m = item.nome.match(/^(\d+)x\s/i);
    if (m) return parseInt(m[1], 10);
  }
  return Number(item?.quantidade || 1);
}

/**
 * Build a complete venda payload ready for the criar_venda_completa RPC.
 *
 * Centralizes the shape so online flow (/app, /pedidos) and offline replay
 * produce identical payloads. The RPC handles atomic insert of:
 *   - vendas row
 *   - vendas_itens rows
 *   - vendas_pagamentos rows (multi-pay, cash already net of change)
 *   - produtos.estoque_atual decrements (for items where controlar_estoque)
 *   - pessoas.saldo_fiado increments (for fiado payments)
 *
 * @param {Object} input
 * @param {string} input.formaPagamento - 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'fiado' | 'multiplo' | platform id
 * @param {number} [input.valorRecebido=0] - cash received (single-pay only)
 * @param {Array} [input.pagamentos=[]] - multi-pay rows: [{ forma, valor, pessoaId? }]
 * @param {number} input.totalFinal - customer-charged total (post discount, with delivery)
 * @param {number} [input.valorDesconto=0]
 * @param {string|null} [input.descontoTipo=null] - 'valor' | 'percentual' | null
 * @param {number} [input.taxaEntrega=0]
 * @param {string} [input.tipoPedido='retirada'] - 'retirada' | 'delivery' | 'mesa'
 * @param {number|null} [input.idCaixa=null] - integer FK to caixas.id (server may fall back if closed)
 * @param {string|null} [input.idCliente=null] - UUID for single-pay fiado client
 * @param {Array} [input.itens=[]] - [{ id_produto, quantidade, nome, preco }]
 * @param {Array} [input.taxasPlataforma=[]] - [{ plataforma_id, plataforma_nome, taxa_pct, valor_bruto }]
 *   For each platform line in the sale, the modal computes the gross
 *   amount charged on that platform and the configured/overridden
 *   commission rate. The fee `valor_taxa = valor_bruto * taxa_pct / 100`
 *   is computed here so persistence is consistent across callsites.
 *   Lines with `taxa_pct === 0` are dropped.
 * @param {string} [input.createdAt] - ISO timestamp (set only for offline replay to preserve original sale time)
 * @returns {{ payload: Object, settlement: Object }} payload for the RPC + settlement (for receipts/UI)
 */
export function buildVendaPayload(input) {
  const settlement = calculateSaleSettlement({
    formaPagamento: input.formaPagamento,
    valorRecebido: input.valorRecebido,
    pagamentos: input.pagamentos || [],
    totalFinal: input.totalFinal
  });

  const totalCobrado = money(input.totalFinal);
  const isMulti = settlement.formaPagamento === 'multiplo';

  // Resolve cliente: single fiado uses idCliente directly; multi-fiado uses the fiado row pessoaId.
  let idCliente = input.idCliente || null;
  if (isMulti) {
    const fiadoRow = (input.pagamentos || []).find(
      (p) => (p?.forma_pagamento || p?.forma) === 'fiado'
    );
    if (fiadoRow?.pessoaId) idCliente = fiadoRow.pessoaId;
  }

  // Multi-pay rows for vendas_pagamentos (cash already net of change)
  const pagamentosOut = isMulti
    ? settlement.paymentRows
        .map((p) => ({
          forma_pagamento: p.forma,
          valor: money(p.valor)
        }))
        .filter((p) => p.valor > 0)
    : [];

  // Items
  const itens = (input.itens || []).map((i) => ({
    id_produto: i.id_produto ?? null,
    quantidade: extractEffectiveQty(i),
    nome_produto_na_venda: i.nome,
    preco_unitario_na_venda: money(i.preco)
  }));

  // Stock decrement list — server filters by controlar_estoque internally
  const estoque = (input.itens || [])
    .filter((i) => i.id_produto)
    .map((i) => ({
      id_produto: i.id_produto,
      quantidade: extractEffectiveQty(i)
    }));

  // Fiado debits
  const fiados = [];
  if (!isMulti && input.formaPagamento === 'fiado' && idCliente) {
    fiados.push({ id_pessoa: idCliente, valor: totalCobrado });
  } else if (isMulti) {
    const fiadoRow = (input.pagamentos || []).find(
      (p) => (p?.forma_pagamento || p?.forma) === 'fiado'
    );
    const fiadoValor = money(fiadoRow?.valor || 0);
    if (fiadoRow?.pessoaId && fiadoValor > 0) {
      fiados.push({ id_pessoa: fiadoRow.pessoaId, valor: fiadoValor });
    }
  }

  // Platform fees — snapshot taxa_pct so historical reports stay stable
  const taxasPlataforma = (input.taxasPlataforma || [])
    .map((t) => {
      const taxaPct = Number(t?.taxa_pct || 0);
      const valorBruto = money(t?.valor_bruto || 0);
      const valorTaxa = money((valorBruto * taxaPct) / 100);
      return {
        plataforma_id: t?.plataforma_id || '',
        plataforma_nome: t?.plataforma_nome || t?.plataforma_id || '',
        taxa_pct: taxaPct,
        valor_bruto: valorBruto,
        valor_taxa: valorTaxa
      };
    })
    .filter((t) => t.plataforma_id && t.valor_taxa > 0);

  const payload = {
    valor_total: totalCobrado,
    forma_pagamento: settlement.formaPagamento,
    valor_recebido: settlement.valorRecebido,
    valor_troco: settlement.valorTroco,
    valor_desconto: money(input.valorDesconto || 0),
    desconto_tipo: input.descontoTipo || null,
    tipo_pedido: input.tipoPedido || 'retirada',
    taxa_entrega: money(input.taxaEntrega || 0),
    id_caixa: input.idCaixa ?? null,
    id_cliente: idCliente,
    itens,
    pagamentos: pagamentosOut,
    estoque,
    fiados,
    taxas_plataforma: taxasPlataforma
  };

  if (input.createdAt) {
    payload.created_at = input.createdAt;
  }

  return { payload, settlement };
}
