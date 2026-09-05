import { produtoSemEstoque } from '$lib/stock';

/**
 * Adapter JavaScript do contrato de grupos do ZeloMenu para o PDV.
 *
 * A forma dos dados e as regras abaixo acompanham
 * zelomenu/src/domain/zelomenuModifiers.ts. O PDV usa este módulo para
 * montar o item, enquanto o ZeloMenu continua sendo a fonte do catálogo.
 */

export function sortModifierGroups(groups = []) {
  return [...groups]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    .map((group) => ({
      ...group,
      options: [...(group.options || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    }));
}

export function buildModifierGroups({ groups = [], options = [], links = [], products = [] } = {}) {
  const productById = new Map((products || []).map((product) => [Number(product.id), product]));
  const linkByOptionId = new Map((links || []).map((link) => [String(link.id_opcao ?? link.optionId), link]));
  const optionsByGroupId = new Map();

  for (const rawOption of options || []) {
    const optionId = String(rawOption.id ?? '').trim();
    const groupId = String(rawOption.id_grupo ?? rawOption.groupId ?? '').trim();
    const name = String(rawOption.nome ?? rawOption.name ?? '').trim();
    if (!optionId || !groupId || !name) continue;

    const link = linkByOptionId.get(optionId);
    const linkedProduct = link
      ? productById.get(Number(link.id_produto ?? link.productId))
      : null;
    const linkedProductId = Number((link?.id_produto ?? link?.productId) || 0);
    const linkedPrice = link?.price_override ?? link?.priceOverride;
    const option = {
      id: optionId,
      name,
      priceDelta: roundCurrency(rawOption.price_delta ?? rawOption.priceDelta ?? 0),
      active: rawOption.ativo !== false && rawOption.active !== false,
      order: Number(rawOption.ordem ?? rawOption.order ?? 0),
      ...(link ? {
        linkedProduct: {
          productId: linkedProductId,
          name: linkedProduct?.nome || linkedProduct?.name || '',
          price: roundCurrency(linkedPrice ?? linkedProduct?.preco ?? linkedProduct?.price ?? 0),
          available: !!linkedProduct && !produtoSemEstoque(linkedProduct)
        }
      } : {})
    };

    const current = optionsByGroupId.get(groupId) || [];
    current.push(option);
    optionsByGroupId.set(groupId, current);
  }

  const normalized = [];
  for (const rawGroup of groups || []) {
    const id = String(rawGroup.id ?? '').trim();
    const productId = Number(rawGroup.id_produto ?? rawGroup.productId ?? 0);
    const name = String(rawGroup.nome ?? rawGroup.name ?? '').trim();
    if (!id || !productId || !name) continue;
    normalized.push({
      id,
      productId,
      name,
      kind: rawGroup.tipo === 'variacao' || rawGroup.kind === 'variacao' ? 'variacao' : 'adicional',
      pricingMode: rawGroup.modo_preco === 'substituir' || rawGroup.pricingMode === 'substituir' ? 'substituir' : 'somar',
      minSelections: Math.max(0, Math.trunc(Number(rawGroup.min_selecoes ?? rawGroup.minSelections ?? 0))),
      maxSelections: rawGroup.max_selecoes == null && rawGroup.maxSelections == null
        ? null
        : Math.max(1, Math.trunc(Number(rawGroup.max_selecoes ?? rawGroup.maxSelections))),
      allowsQuantity: rawGroup.permite_quantidade === true || rawGroup.allowsQuantity === true,
      minTotalQuantity: Number(rawGroup.minimo_total_quantidade ?? rawGroup.minTotalQuantity ?? 0),
      maxTotalQuantity: rawGroup.maximo_total_quantidade ?? rawGroup.maxTotalQuantity ?? null,
      maxPerOption: rawGroup.maximo_por_opcao == null && rawGroup.maxPerOption == null
        ? null
        : Math.max(1, Math.trunc(Number(rawGroup.maximo_por_opcao ?? rawGroup.maxPerOption))),
      active: rawGroup.ativo !== false && rawGroup.active !== false,
      order: Number(rawGroup.ordem ?? rawGroup.order ?? 0),
      options: optionsByGroupId.get(id) || []
    });
  }

  return sortModifierGroups(normalized);
}

/**
 * O catálogo visível do PDV pode excluir produtos-componentes por
 * `ocultar_no_pdv`, mas esses produtos ainda precisam estar disponíveis para
 * resolver nome, preço e estoque das opções vinculadas. Mantém o catálogo
 * visível como fonte principal e acrescenta apenas os vínculos ausentes.
 */
export function mergeModifierLinkedProducts(products = [], linkedProducts = []) {
  const byId = new Map((products || []).map((product) => [Number(product?.id), product]));
  for (const product of linkedProducts || []) {
    const id = Number(product?.id);
    if (id && !byId.has(id)) byId.set(id, product);
  }
  return [...byId.values()];
}

export function hasActiveModifierGroups(groups) {
  return Array.isArray(groups) && groups.some((group) => group?.active !== false);
}

export function shouldResetModifierSelections({ open = false, wasOpen = false, productKey = '', lastProductKey = '' } = {}) {
  return Boolean(open) && (!wasOpen || productKey !== lastProductKey);
}

export function normalizeModifierSelections(selections) {
  return (Array.isArray(selections) ? selections : [])
    .map((selection) => ({
      groupId: String(selection?.groupId ?? '').trim(),
      optionSelections: (Array.isArray(selection?.optionSelections) ? selection.optionSelections : [])
        .map((option) => ({ optionId: String(option?.optionId ?? '').trim(), quantity: Math.floor(Number(option?.quantity)) }))
        .filter((option) => option.optionId && Number.isFinite(option.quantity) && option.quantity > 0)
    }))
    .filter((selection) => selection.groupId);
}

export function buildModifierSignature(selectedOptions) {
  const normalized = normalizeModifierSelections(selectedOptions);
  if (!normalized.length) return 'plain';
  return normalized
    .map((group) => `${group.groupId}:${[...group.optionSelections]
      .sort((a, b) => a.optionId.localeCompare(b.optionId))
      .map((option) => `${option.optionId}:${option.quantity}`)
      .join(',')}`)
    .sort()
    .join('|') || 'plain';
}

export function buildCartItemKey(productId, selectedOptions) {
  return `${productId}::${buildModifierSignature(selectedOptions)}`;
}

export function resolveModifierSelections(groups, selections, basePrice) {
  for (const selection of selections || []) for (const option of selection?.optionSelections || []) {
    const group = (groups || []).find((candidate) => candidate.id === selection.groupId);
    if (!Number.isSafeInteger(option.quantity) || option.quantity < 1 || (group && !group.allowsQuantity && option.quantity !== 1)) return { ok: false, code: 'option_quantity_invalid', message: 'A quantidade escolhida para um complemento é inválida.' };
  }
  const activeGroups = sortModifierGroups((groups || []).filter((group) => group.active !== false));
  const normalizedSelections = normalizeModifierSelections(selections);
  const activeGroupIds = new Set(activeGroups.map((group) => group.id));

  for (const selection of normalizedSelections) {
    if (!activeGroupIds.has(selection.groupId)) {
      return { ok: false, code: 'group_missing', message: 'Um grupo de complementos desse item não está mais disponível.' };
    }
  }

  const selectedGroups = [];
  let baseOverride = null;
  let addDeltaTotal = 0;

  for (const group of activeGroups) {
    const input = normalizedSelections.find((selection) => selection.groupId === group.id);
    const activeOptions = (group.options || []).filter((option) => option.active !== false && option.linkedProduct?.available !== false);
    const selectedOptions = [];

    for (const rawSelection of input?.optionSelections || []) {
      const option = activeOptions.find((candidate) => candidate.id === rawSelection.optionId);
      if (!option) {
        return { ok: false, code: 'option_missing', message: `Uma opção de ${group.name} não está mais disponível.` };
      }
      if (group.allowsQuantity && group.maxPerOption != null && rawSelection.quantity > group.maxPerOption) {
        return { ok: false, code: 'option_quantity_exceeded', message: `Você pode escolher no máximo ${group.maxPerOption} de ${option.name}.` };
      }
      selectedOptions.push({
        optionId: option.id,
        optionName: option.linkedProduct ? option.linkedProduct.name : option.name,
        priceDelta: resolveOptionPrice(option),
        quantity: rawSelection.quantity,
        ...(option.linkedProduct ? { linkedProductId: option.linkedProduct.productId } : {})
      });
    }

    // Snapshot order must not depend on the order the operator clicked options:
    // the RPC that merges comanda lines compares `modifiers` with strict jsonb
    // equality, so an unstable order would create duplicate lines for the same
    // combination instead of incrementing quantity.
    selectedOptions.sort((a, b) => a.optionId.localeCompare(b.optionId));

    const totalQuantity = selectedOptions.reduce((sum, option) => sum + option.quantity, 0);
    if (group.allowsQuantity && totalQuantity < Number(group.minTotalQuantity || 0)) return { ok: false, code: 'group_quantity_required', message: `Escolha pelo menos ${group.minTotalQuantity} unidades no total em ${group.name}.` };
    if (group.allowsQuantity && group.maxTotalQuantity != null && totalQuantity > Number(group.maxTotalQuantity)) return { ok: false, code: 'group_quantity_exceeded', message: `Escolha no máximo ${group.maxTotalQuantity} unidades no total em ${group.name}.` };

    if (selectedOptions.length < Number(group.minSelections || 0)) {
      return { ok: false, code: 'group_required', message: `Escolha ${group.minSelections} ${Number(group.minSelections) === 1 ? 'opção' : 'opções'} em ${group.name}.` };
    }
    if (group.maxSelections != null && selectedOptions.length > group.maxSelections) {
      return { ok: false, code: 'selection_bounds', message: `Você pode escolher no máximo ${group.maxSelections} ${group.maxSelections === 1 ? 'opção' : 'opções'} em ${group.name}.` };
    }

    if (selectedOptions.length) {
      if (group.pricingMode === 'substituir') {
        baseOverride = selectedOptions[0].priceDelta;
      } else {
        addDeltaTotal += selectedOptions.reduce((total, option) => total + option.priceDelta * option.quantity, 0);
      }
      selectedGroups.push({ groupId: group.id, groupName: group.name, kind: group.kind, selectedOptions });
    }
  }

  const finalUnitPrice = roundCurrency((baseOverride ?? Number(basePrice || 0)) + addDeltaTotal);
  return {
    ok: true,
    selectedGroups,
    deltaTotal: roundCurrency(finalUnitPrice - Number(basePrice || 0)),
    finalUnitPrice
  };
}

export function formatSelectedModifierGroups(selectedGroups) {
  if (!Array.isArray(selectedGroups) || !selectedGroups.length) return '';
  return selectedGroups.map((group) => {
    const options = (group.selectedOptions || [])
      .map((option) => Number(option.quantity || 1) > 1 ? `${option.quantity}x ${option.optionName}` : option.optionName)
      .join(', ');
    return `${group.groupName}: ${options}`;
  }).join(' • ');
}

function resolveOptionPrice(option) {
  return roundCurrency(option?.linkedProduct ? option.linkedProduct.price : option?.priceDelta || 0);
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
