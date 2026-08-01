import { calculateSaleSettlement, money } from './caixa.js';

/**
 * Reverte o débito fiado vinculado a uma venda antes de excluí-la.
 * Lê forma_pagamento, valor_total, id_cliente e (se múltiplo) pagamentos fiado,
 * e chama o RPC auditável `fiado_estornar_venda`, que cria um evento compensatório
 * no razão e atualiza o saldo em uma única transação.
 *
 * Idempotência: a venda já existe no banco; o RPC apenas ajusta o saldo.
 * Falhas no estorno são repassadas ao chamador para abortar o delete.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|number} vendaId
 * @returns {Promise<{revertedTotal: number, lines: Array<{id_pessoa: string, valor: number}>}>}
 */
export async function revertFiadoDebtForVenda(supabase, vendaId) {
  if (!supabase || vendaId == null) {
    return { revertedTotal: 0, lines: [] };
  }

  const { data: venda, error: vendaErr } = await supabase
    .from('vendas')
    .select('id, forma_pagamento, valor_total, id_cliente')
    .eq('id', vendaId)
    .maybeSingle();
  if (vendaErr) throw vendaErr;
  if (!venda) return { revertedTotal: 0, lines: [] };

  if (!venda.id_cliente || !['fiado', 'multiplo'].includes(venda.forma_pagamento)) {
    return { revertedTotal: 0, lines: [] };
  }

  const { data, error: rpcErr } = await supabase.rpc('fiado_estornar_venda', {
    p_id_venda: vendaId
  });
  if (rpcErr) throw rpcErr;

  const revertedTotal = money(data?.valor_estornado || 0);
  return {
    revertedTotal,
    lines: revertedTotal > 0 ? [{ id_pessoa: venda.id_cliente, valor: revertedTotal }] : []
  };
}

export function createClientSaleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
 * @param {string} [input.clientSaleId] - client-generated idempotency key.
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

  if (!isMulti && input.formaPagamento === 'fiado' && !idCliente) {
    throw new Error('Venda no fiado exige um cliente vinculado.');
  }
  if (isMulti) {
    const fiadoRow = (input.pagamentos || []).find(
      (p) => (p?.forma_pagamento || p?.forma) === 'fiado'
    );
    const fiadoValor = money(fiadoRow?.valor || 0);
    if (fiadoValor > 0 && !idCliente) {
      throw new Error('Pagamento fiado exige um cliente vinculado.');
    }
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
  const itens = (input.itens || []).map((i) => {
    const modifiers = Array.isArray(i.modifiers) && i.modifiers.length ? i.modifiers : null;
    const nomeProdutoNaVenda = i.resumoMontagem && i.nome
      ? `${i.nome} (${i.resumoMontagem})`
      : i.nome;
    return {
      id_produto: i.id_produto ?? null,
      quantidade: extractEffectiveQty(i),
      nome_produto_na_venda: nomeProdutoNaVenda,
      preco_unitario_na_venda: money(i.preco),
      ...(modifiers ? { modifiers } : {})
    };
  });

  // Stock decrement list — server filters by controlar_estoque internally.
  // Also expands each item's modifier options that are linked to a real
  // catalog product (e.g. massa, calda, proteína), mirroring the same
  // expansion `comanda_modifier_stock_requirements` does for Mesas/comandas.
  const estoque = [];
  for (const i of input.itens || []) {
    const itemQty = extractEffectiveQty(i);
    if (i.id_produto) {
      estoque.push({ id_produto: i.id_produto, quantidade: itemQty });
    }
    for (const group of Array.isArray(i.modifiers) ? i.modifiers : []) {
      for (const option of group?.selectedOptions || []) {
        if (!option?.linkedProductId) continue;
        const optionQty = Math.max(1, Math.round(Number(option.quantity) || 1));
        estoque.push({ id_produto: option.linkedProductId, quantidade: optionQty * itemQty });
      }
    }
  }

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
    client_sale_id: input.clientSaleId || createClientSaleId(),
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
    taxas_plataforma: taxasPlataforma,
    ...(input.operadorId ? { operador_id: input.operadorId } : {})
  };

  if (input.createdAt) {
    payload.created_at = input.createdAt;
  }

  return { payload, settlement };
}
