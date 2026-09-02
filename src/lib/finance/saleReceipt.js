/**
 * Converts persisted sale snapshots into the `venda` shape consumed by
 * `printVenda`.
 *
 * Keeping this mapping independent from the dashboard makes reprints use the
 * same receipt contract as the checkout flow without coupling the printer to
 * Supabase rows.
 */
export function buildSaleReceiptPayload({ venda = {}, itens = [], pagamentos = [] } = {}) {
  const total = Number(venda.valor_total || 0);
  const desconto = Number(venda.valor_desconto || 0);
  const taxaEntrega = Number(venda.taxa_entrega || 0);

  return {
    idVenda: venda.id,
    numeroVenda: venda.numero_venda,
    formaPagamento: venda.forma_pagamento || null,
    total,
    subtotal: total - taxaEntrega + desconto,
    desconto,
    taxaEntrega,
    tipoPedido: venda.tipo_pedido || 'retirada',
    valorRecebido: Number(venda.valor_recebido || 0),
    troco: Number(venda.valor_troco || 0),
    itens: (Array.isArray(itens) ? itens : []).map((item) => ({
      nome: item.nome_produto_na_venda || item.nome || '',
      quantidade: Number(item.quantidade || 1),
      preco_unitario: Number(item.preco_unitario_na_venda ?? item.preco_unitario ?? 0),
      ...(Array.isArray(item.modifiers) && item.modifiers.length ? { modifiers: item.modifiers } : {})
    })),
    pagamentos: (Array.isArray(pagamentos) ? pagamentos : []).map((pagamento) => ({
      forma: pagamento.forma_pagamento || pagamento.forma || '',
      valor: Number(pagamento.valor || 0)
    }))
  };
}

export async function loadSaleReceiptCompanyProfile({ supabase, userId } = {}) {
  if (!supabase || !userId) return {};

  const { data, error } = await supabase
    .from('empresa_perfil')
    .select('id, nome_exibicao, documento, endereco, contato, logo_url, rodape_recibo, largura_bobina')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Receipt] Não foi possível carregar o perfil para impressão:', error.message);
    return {};
  }

  const perfil = data || {};
  const logoUrl = perfil.logo_url || supabase.storage.from('logos').getPublicUrl(`${userId}.png`)?.data?.publicUrl || null;
  return { ...perfil, logoUrl };
}
