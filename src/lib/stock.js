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
  return produtoControlaEstoque(produto) && estoqueDisponivel(produto) <= 0;
}

export function somarQuantidadePorEstoque(itens, produtos = []) {
  const produtosMap = new Map(produtos.map((produto) => [produto.id, produto]));
  const requeridos = new Map();

  for (const item of itens || []) {
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
