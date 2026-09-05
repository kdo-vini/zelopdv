/** Pure pizza contract. Mirrored verbatim in ZeloMenu/src/domain/pizza.js.
 * Prices are whole-pizza BRL values; fractions never consume flavor stock.
 */
const fail = (code, message) => ({ ok: false, code, message });
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100;
const validPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;

export function validatePizzaConfig(config) {
  if (!config || config.version !== 1 || !['highest', 'average'].includes(config.pricingMode)) return fail('pizza_config_invalid', 'Configuração da pizza inválida.');
  if (!Array.isArray(config.sizes) || !config.sizes.length || config.sizes.length > 30 || !Array.isArray(config.flavors) || !config.flavors.length || config.flavors.length > 500) return fail('pizza_config_invalid', 'Cadastre pelo menos um tamanho e um sabor.');
  const sizeIds = new Set();
  for (const size of config.sizes) {
    if (!validId(size?.id) || sizeIds.has(size.id) || !String(size.name || '').trim() || !Number.isInteger(size.maxFlavors) || size.maxFlavors < 1 || size.maxFlavors > 4 || (size.stockProductId != null && (!Number.isSafeInteger(size.stockProductId) || size.stockProductId <= 0))) return fail('pizza_config_invalid', 'Confira nomes, limites e estoque dos tamanhos.');
    sizeIds.add(size.id);
  }
  const flavorIds = new Set();
  for (const flavor of config.flavors) {
    if (!validId(flavor?.id) || flavorIds.has(flavor.id) || !String(flavor.name || '').trim() || !flavor.prices || typeof flavor.prices !== 'object' || Array.isArray(flavor.prices)) return fail('pizza_config_invalid', 'Confira o cadastro dos sabores.');
    flavorIds.add(flavor.id);
    for (const [sizeId, price] of Object.entries(flavor.prices)) {
      if (!sizeIds.has(sizeId) || !validPrice(price)) return fail('pizza_config_invalid', 'Preencha preços positivos com até duas casas decimais; deixe indisponíveis sem preço.');
    }
  }
  return { ok: true };
}

export function buildPizzaSignature(selection) {
  if (!selection) return 'plain';
  const ids = selection.flavorIds ?? selection.flavors?.map((flavor) => flavor.id) ?? [];
  return JSON.stringify([selection.revision, selection.sizeId, [...ids].sort()]);
}

export function pizzaSelectionFromSnapshot(pizza) {
  return pizza ? { revision: pizza.revision, sizeId: pizza.sizeId, flavorIds: pizza.flavors.map((flavor) => flavor.id) } : null;
}

export function pizzaModifiers(pizza) {
  if (!pizza) return [];
  const fraction = { 1: '', 2: '½ ', 3: '⅓ ', 4: '¼ ' };
  return [
    { groupId: '__pizza_size', groupName: 'Tamanho', kind: 'variacao', selectedOptions: [{ optionId: pizza.sizeId, optionName: pizza.sizeName, priceDelta: 0, quantity: 1 }] },
    { groupId: '__pizza_flavors', groupName: 'Sabores', kind: 'variacao', selectedOptions: pizza.flavors.map((flavor) => ({ optionId: flavor.id, optionName: `${fraction[flavor.denominator] || ''}${flavor.name}`, priceDelta: 0, quantity: 1 })) }
  ];
}

export function resolvePizza(config, selection) {
  const validation = validatePizzaConfig(config);
  if (!validation.ok) return validation;
  if (config.archived) return fail('pizza_unavailable', 'Esta pizza não está mais disponível.');
  if (!validId(config.revision) || selection?.revision !== config.revision) return fail('pizza_revision_changed', 'A configuração desta pizza mudou. Atualize a montagem.');
  const size = config.sizes.find((candidate) => candidate.id === selection?.sizeId && candidate.active !== false);
  if (!size) return fail('pizza_size_unavailable', 'Escolha um tamanho disponível.');
  const ids = selection?.flavorIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > size.maxFlavors || new Set(ids).size !== ids.length) return fail('pizza_flavors_invalid', `Escolha de 1 a ${size.maxFlavors} sabores diferentes.`);
  const flavors = [];
  for (const id of [...ids].sort()) {
    const flavor = config.flavors.find((candidate) => candidate.id === id && candidate.active !== false);
    const price = flavor?.prices?.[size.id];
    if (!flavor || !validPrice(price)) return fail('pizza_flavor_unavailable', 'Um sabor não está disponível neste tamanho. Revise sua pizza.');
    flavors.push({ id: flavor.id, name: flavor.name, numerator: 1, denominator: ids.length, price });
  }
  const cents = flavors.map((flavor) => Math.round(flavor.price * 100));
  const baseUnitPrice = (config.pricingMode === 'highest' ? Math.max(...cents) : Math.round(cents.reduce((a, b) => a + b, 0) / cents.length)) / 100;
  const pizza = { version: 1, revision: config.revision, sizeId: size.id, sizeName: size.name, flavors, pricingMode: config.pricingMode, baseUnitPrice, stockProductId: size.stockProductId ?? null };
  return { ok: true, pizza, baseUnitPrice, modifiers: pizzaModifiers(pizza) };
}

export function pizzaStartingPrice(config, groups = []) {
  if (!config || config.archived) return null;
  const prices = [];
  for (const size of config.sizes || []) {
    if (size.active === false) continue;
    for (const flavor of config.flavors || []) {
      const price = flavor.prices?.[size.id];
      if (flavor.active !== false && validPrice(price)) prices.push(price);
    }
  }
  if (!prices.length) return null;
  let requiredExtras = 0;
  for (const group of groups || []) {
    if (group.active === false) continue;
    if (group.pricingMode === 'substituir') return null;
    const minDistinct = Number(group.minSelections || 0);
    const minUnits = group.allowsQuantity ? Number(group.minTotalQuantity || 0) : 0;
    const perOption = group.allowsQuantity ? Number(group.maxPerOption ?? Math.max(1, minUnits)) : 1;
    const distinct = Math.max(minDistinct, Math.ceil(minUnits / perOption));
    const units = Math.max(distinct, minUnits);
    if (!units) continue;
    const options = (group.options || []).filter((option) => option.active !== false && option.linkedProduct?.available !== false)
      .map((option) => Math.round(Number(option.linkedProduct ? option.linkedProduct.price : option.priceDelta || 0) * 100)).sort((a, b) => a - b);
    if (distinct > options.length || distinct > Number(group.maxSelections ?? options.length) || (group.allowsQuantity && group.maxTotalQuantity != null && units > Number(group.maxTotalQuantity))) return null;
    let remaining = units - distinct;
    for (const price of options.slice(0, distinct)) {
      const extraUnits = Math.min(remaining, perOption - 1);
      requiredExtras += price * (1 + extraUnits);
      remaining -= extraUnits;
    }
  }
  return Math.min(...prices) + requiredExtras / 100;
}

export function pizzaStockRequirements({ productId, quantity, pizza = null, modifiers = [] }) {
  const quantities = new Map();
  const add = (id, qty) => { if (id) quantities.set(Number(id), (quantities.get(Number(id)) || 0) + qty); };
  add(pizza?.stockProductId ?? productId, quantity);
  for (const group of modifiers || []) for (const option of group?.selectedOptions || []) {
    if (option.linkedProductId) add(option.linkedProductId, quantity * Math.max(1, Math.round(Number(option.quantity) || 1)));
  }
  return [...quantities].map(([id_produto, quantidade]) => ({ id_produto, quantidade }));
}
