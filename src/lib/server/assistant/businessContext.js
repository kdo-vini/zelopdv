function number(value) {
  return Number(value) || 0;
}

function round(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Produces compact, auditable sales and catalog facts for the assistant.
 * It deliberately groups only by stored product/category relations: names are
 * never used to infer a category such as "salgados" or "bebidas".
 */
export function buildCatalogSalesContext({ vendas = [], itens = [], pagamentos = [], produtos = [], categorias = [] }) {
  const productsById = new Map(produtos.map((product) => [String(product.id), product]));
  const categoryById = new Map(categorias.map((category) => [String(category.id), category]));
  const productCountByCategory = new Map();

  for (const product of produtos) {
    if (product.id_categoria == null) continue;
    const key = String(product.id_categoria);
    productCountByCategory.set(key, (productCountByCategory.get(key) || 0) + 1);
  }

  const productTotals = new Map();
  const categoryTotals = new Map();
  let registeredUnits = 0;

  for (const item of itens) {
    const quantity = number(item.quantidade);
    const unitPrice = number(item.preco_unitario_na_venda);
    const revenue = round(quantity * unitPrice);
    const product = item.id_produto != null ? productsById.get(String(item.id_produto)) : null;
    const name = item.nome_produto_na_venda || product?.nome || 'Item sem nome';
    const productKey = item.id_produto != null ? `id:${item.id_produto}` : `name:${name}`;
    const categoryId = product?.id_categoria != null ? String(product.id_categoria) : null;

    registeredUnits += quantity;
    const productTotal = productTotals.get(productKey) || { nome: name, unidades: 0, receita: 0, categoria_id: categoryId };
    productTotal.unidades += quantity;
    productTotal.receita = round(productTotal.receita + revenue);
    productTotals.set(productKey, productTotal);

    if (categoryId && categoryById.has(categoryId)) {
      const category = categoryById.get(categoryId);
      const categoryTotal = categoryTotals.get(categoryId) || { id: category.id, nome: category.nome, produtos_cadastrados: productCountByCategory.get(categoryId) || 0, unidades_vendidas: 0, receita: 0 };
      categoryTotal.unidades_vendidas += quantity;
      categoryTotal.receita = round(categoryTotal.receita + revenue);
      categoryTotals.set(categoryId, categoryTotal);
    }
  }

  const saleIdsWithPaymentRows = new Set((pagamentos || []).map((payment) => String(payment.id_venda)));
  const paymentTotals = new Map();
  const addPayment = (method, amount) => {
    const key = method || 'outros';
    paymentTotals.set(key, round((paymentTotals.get(key) || 0) + number(amount)));
  };

  for (const payment of pagamentos || []) addPayment(payment.forma_pagamento, payment.valor);
  for (const sale of vendas) {
    if (!saleIdsWithPaymentRows.has(String(sale.id))) addPayment(sale.forma_pagamento, sale.valor_total);
  }

  const totalSales = vendas.length;
  const receitaTotal = round(vendas.reduce((sum, sale) => sum + number(sale.valor_total), 0));
  const categories = categorias
    .map((category) => {
      const total = categoryTotals.get(String(category.id));
      return {
        id: category.id,
        nome: category.nome,
        produtos_cadastrados: productCountByCategory.get(String(category.id)) || 0,
        unidades_vendidas_30d: total?.unidades_vendidas || 0,
        receita_30d: total?.receita || 0,
        media_unidades_por_venda: totalSales && total ? round(total.unidades_vendidas / totalSales) : 0,
      };
    })
    .sort((left, right) => right.receita_30d - left.receita_30d || left.nome.localeCompare(right.nome, 'pt-BR'));

  return {
    vendas: {
      quantidade: totalSales,
      receita_total: receitaTotal.toFixed(2),
      ticket_medio: totalSales ? round(receitaTotal / totalSales).toFixed(2) : null,
      por_metodo_pagamento: Object.fromEntries(paymentTotals),
    },
    itens_vendidos: {
      unidades_registradas: registeredUnits,
      media_itens_por_venda: totalSales ? round(registeredUnits / totalSales) : null,
      top_produtos: Array.from(productTotals.values())
        .sort((left, right) => right.unidades - left.unidades || right.receita - left.receita)
        .slice(0, 10),
    },
    categorias: categories,
    classificacao_categorias: 'As vendas por categoria usam a categoria atual de cada produto. Itens vendidos antes de uma recategorização seguem essa classificação atual.',
    catalogo: {
      produtos_cadastrados: produtos.length,
      categorias_cadastradas: categorias.length,
      produtos_sem_categoria: produtos.filter((product) => product.id_categoria == null).length,
    },
  };
}

export function buildStockContext({ produtos = [], categorias = [] }) {
  const sharedCategoryIds = new Set(
    categorias.filter((category) => category.controlar_estoque_compartilhado).map((category) => String(category.id))
  );
  const shared = categorias
    .filter((category) => category.controlar_estoque_compartilhado)
    .map((category) => ({
      nome: category.nome,
      estoque_atual: number(category.estoque_compartilhado_atual),
      origem: 'categoria_compartilhada',
    }));
  const individual = produtos
    .filter((product) => product.controlar_estoque && !sharedCategoryIds.has(String(product.id_categoria)))
    .map((product) => ({
      nome: product.nome,
      estoque_atual: number(product.estoque_atual),
      origem: 'produto',
    }));

  return [...shared, ...individual]
    .sort((left, right) => left.estoque_atual - right.estoque_atual || left.nome.localeCompare(right.nome, 'pt-BR'))
    .slice(0, 10);
}
