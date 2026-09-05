export function setPizzaPrice(prices, sizeId, value) {
  const next = { ...prices };
  if (value === '' || value == null) delete next[sizeId];
  else {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Informe um preço maior que zero.');
    next[sizeId] = Math.round(price * 100) / 100;
  }
  return next;
}

export function importPizzaFlavor(product, sizeId, id = crypto.randomUUID()) {
  if (!sizeId) throw new Error('Escolha o tamanho correspondente ao preço importado.');
  return { id, name: product.nome, description: product.descricao || '', active: true,
    prices: setPizzaPrice({}, sizeId, product.preco) };
}

export function preservePizzaDraftAfterModeChange(draft, savedConfig, pricingMode) {
  return {
    ...draft,
    revision: savedConfig?.revision || draft.revision,
    pricingMode,
  };
}

export async function archivePizzaProduct(client, product) {
  if (product.tipo_produto !== 'pizza' || !product.pizza_config?.revision) throw new Error('Recarregue a configuração da pizza antes de arquivar.');
  const { data, error } = await client.rpc('save_pizza_config', {
    p_product_id: product.id,
    p_expected_revision: product.pizza_config.revision,
    p_config: { ...product.pizza_config, archived: true }
  });
  if (error) throw error;
  return data;
}
