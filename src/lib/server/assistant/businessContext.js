import { addDays, localDateOf, weekdayOf } from '$lib/server/intelligence/tz.js';

function number(value) {
  return Number(value) || 0;
}

function round(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

function averageOfDays(days) {
  if (!days.length) return null;
  const totalReceita = days.reduce((sum, day) => sum + day.receita, 0);
  const totalVendas = days.reduce((sum, day) => sum + day.quantidade, 0);
  return {
    receita: round(totalReceita / days.length),
    quantidade: round(totalVendas / days.length),
    dias_considerados: days.length,
  };
}

/**
 * Groups already-fetched sales by local (America/Sao_Paulo) calendar day so
 * the assistant can answer "how was yesterday vs. the average" without
 * recalculating — the aggregate-only `vendas` block in
 * buildCatalogSalesContext has no daily granularity at all.
 * `todayIso` is only ever "now" in production; tests inject a fixed instant.
 */
export function buildRecentDaysContext({ vendas = [], todayIso = new Date().toISOString() } = {}) {
  const today = localDateOf(todayIso);
  const yesterday = addDays(today, -1);

  const byDate = new Map();
  for (const sale of vendas) {
    if (!sale?.created_at) continue;
    const date = localDateOf(sale.created_at);
    const bucket = byDate.get(date) || { receita: 0, quantidade: 0 };
    bucket.receita = round(bucket.receita + number(sale.valor_total));
    bucket.quantidade += 1;
    byDate.set(date, bucket);
  }

  const yesterdayBucket = byDate.get(yesterday) || { receita: 0, quantidade: 0 };
  const yesterdayWeekday = weekdayOf(yesterday);

  // Exclude today (partial, still accumulating) and yesterday itself (the
  // thing being compared) from both averages.
  const priorDays = [...byDate.entries()]
    .filter(([date]) => date !== yesterday && date < today)
    .map(([date, bucket]) => ({ date, ...bucket }));
  const priorSameWeekdayDays = priorDays.filter((day) => weekdayOf(day.date) === yesterdayWeekday);

  return {
    ontem: { data: yesterday, receita: round(yesterdayBucket.receita), quantidade: yesterdayBucket.quantidade },
    media_mesmo_dia_semana: averageOfDays(priorSameWeekdayDays),
    media_diaria_periodo: averageOfDays(priorDays),
  };
}

const CATEGORY_GROUP_STOP_WORDS = new Set(['com', 'sem', 'para', 'dos', 'das', 'por', 'mais', 'menos']);

function categoryTerms(name) {
  return [...new Set(
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .split(/[^a-z]+/)
      .filter((term) => term.length >= 4 && !CATEGORY_GROUP_STOP_WORDS.has(term))
      .map((term) => term.replace(/s$/, ''))
  )];
}

function buildCategoryGroups(categories, totalSales) {
  const groupsByTerm = new Map();

  for (const category of categories) {
    for (const term of categoryTerms(category.nome)) {
      const group = groupsByTerm.get(term) || [];
      group.push(category);
      groupsByTerm.set(term, group);
    }
  }

  return Array.from(groupsByTerm.entries())
    .filter(([, categoriesForTerm]) => categoriesForTerm.length > 1)
    .map(([termo, categoriesForTerm]) => ({
      termo,
      categorias: categoriesForTerm.map((category) => category.nome).sort((left, right) => left.localeCompare(right, 'pt-BR')),
      unidades_vendidas_30d: categoriesForTerm.reduce((sum, category) => sum + number(category.unidades_vendidas_30d), 0),
      receita_30d: round(categoriesForTerm.reduce((sum, category) => sum + number(category.receita_30d), 0)),
      media_unidades_por_venda: totalSales
        ? round(categoriesForTerm.reduce((sum, category) => sum + number(category.unidades_vendidas_30d), 0) / totalSales)
        : 0,
    }))
    .sort((left, right) => right.receita_30d - left.receita_30d || left.termo.localeCompare(right.termo, 'pt-BR'));
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
  const categoryGroups = buildCategoryGroups(categories, totalSales);

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
    grupos_de_categorias: categoryGroups,
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
