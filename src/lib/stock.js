import { pizzaStockRequirements } from './pizza.js';

export function categoriaCompartilhaEstoque(produto) {
  return !!produto?.categorias?.controlar_estoque_compartilhado;
}

export function produtoControlaEstoque(produto) {
  return categoriaCompartilhaEstoque(produto) || !!produto?.controlar_estoque;
}

export function estoqueDisponivel(produto) {
  if (categoriaCompartilhaEstoque(produto)) {
    return Number(produto?.categorias?.estoque_compartilhado_atual || 0);
  }
  return Number(produto?.estoque_atual || 0);
}

export function produtoSemEstoque(produto) {
  if (produto?.tipo_produto === 'pizza') {
    if (!produto.pizza_config || produto.pizza_config.archived) return true;
    return !produto.pizza_config.sizes?.some((size) => size.active !== false
      && produto.pizza_config.flavors?.some((flavor) => flavor.active !== false && Number(flavor.prices?.[size.id]) > 0)
      && (size.stockProductId
        ? (produto.pizzaStockProducts || []).some((stock) => stock.id === size.stockProductId && !produtoSemEstoque(stock))
        : !(produtoControlaEstoque(produto) && estoqueDisponivel(produto) <= 0)));
  }
  return produtoControlaEstoque(produto) && estoqueDisponivel(produto) <= 0;
}

export function somarQuantidadePorEstoque(itens, produtos = []) {
  const produtosMap = new Map(produtos.map((produto) => [produto.id, produto]));
  const requeridos = new Map();

  const expandedItems = (itens || []).flatMap((item) => item.pizza
    ? pizzaStockRequirements({ productId: item.id_produto ?? item.id, quantity: Number(item.quantidade || 0), pizza: item.pizza, modifiers: item.modifiers }).map((requirement) => ({ ...item, id_produto: requirement.id_produto, quantidade: requirement.quantidade }))
    : [item]);
  for (const item of expandedItems) {
    const idProduto = item?.id_produto ?? item?.id;
    if (!idProduto) continue;

    const produto = produtosMap.get(idProduto) || item;
    if (!produtoControlaEstoque(produto)) continue;

    const key = categoriaCompartilhaEstoque(produto)
      ? `cat:${produto.categorias?.id ?? produto.id_categoria}`
      : `prod:${idProduto}`;

    const nome = categoriaCompartilhaEstoque(produto)
      ? produto.categorias?.nome || 'Categoria'
      : produto.nome || item.nome || 'Produto';

    const quantidade = Number(item?.quantidade || 0);
    const atual = requeridos.get(key) || {
      key,
      nome,
      disponivel: estoqueDisponivel(produto),
      quantidade: 0
    };
    atual.quantidade += quantidade;
    requeridos.set(key, atual);
  }

  return [...requeridos.values()];
}
