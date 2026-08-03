const EPSILON = 0.000001;

export class PaymentAllocationError extends Error {
  constructor(message, code = 'invalid_allocation') {
    super(message);
    this.name = 'PaymentAllocationError';
    this.code = code;
  }
}

function numberOrThrow(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new PaymentAllocationError(`${field} deve ser um número finito.`);
  }
  return number;
}

function positiveQuantity(value, field) {
  const quantity = numberOrThrow(value, field);
  if (quantity <= 0) {
    throw new PaymentAllocationError(`${field} deve ser maior que zero.`);
  }
  return quantity;
}

function nonNegativeMoney(value, field) {
  const money = numberOrThrow(value, field);
  if (money < -EPSILON) {
    throw new PaymentAllocationError(`${field} não pode ser negativo.`);
  }
  return Math.max(0, money);
}

function roundMoney(value) {
  return Math.round((value + EPSILON) * 100) / 100;
}

function itemIdOf(item) {
  return item?.id ?? item?.id_comanda_item ?? item?.itemId;
}

function quantityOf(item) {
  return item?.quantidade ?? item?.quantity;
}

function unitPriceOf(item) {
  return item?.preco_unitario ?? item?.unitPrice ?? item?.preco_unitario_na_venda;
}

function allocationItemIdOf(allocation) {
  return allocation?.id_comanda_item ?? allocation?.itemId ?? allocation?.item_id;
}

function allocationQuantityOf(allocation) {
  return allocation?.quantidade ?? allocation?.quantity;
}

function normalizeItems(items) {
  const byId = new Map();
  for (const [index, item] of (items || []).entries()) {
    const id = itemIdOf(item);
    if (id === undefined || id === null || id === '') {
      throw new PaymentAllocationError(`Item na posição ${index} não possui id.`);
    }
    const key = String(id);
    if (byId.has(key)) {
      throw new PaymentAllocationError(`Item ${id} foi informado mais de uma vez.`, 'duplicate_item');
    }
    const quantidade = positiveQuantity(quantityOf(item), `Quantidade do item ${id}`);
    const precoUnitario = nonNegativeMoney(unitPriceOf(item), `Preço unitário do item ${id}`);
    byId.set(key, { id, quantidade, precoUnitario });
  }
  return byId;
}

function quantitiesByItem(allocations, label, { allowDuplicates = false } = {}) {
  const quantities = new Map();
  for (const [index, allocation] of (allocations || []).entries()) {
    const id = allocationItemIdOf(allocation);
    if (id === undefined || id === null || id === '') {
      throw new PaymentAllocationError(`Alocação na posição ${index} não possui id_comanda_item.`);
    }
    const key = String(id);
    const quantidade = positiveQuantity(
      allocationQuantityOf(allocation),
      `Quantidade da alocação do item ${id}`,
    );
    if (quantities.has(key) && !allowDuplicates) {
      throw new PaymentAllocationError(
        `O item ${id} aparece mais de uma vez nas ${label}. Some as quantidades antes de alocar.`,
        'duplicate_allocation',
      );
    }
    const previous = quantities.get(key);
    quantities.set(key, {
      id,
      quantidade: (previous?.quantidade || 0) + quantidade,
    });
  }
  return quantities;
}

/**
 * Validates a new item allocation against the item quantities and prior allocations.
 * Empty allocations are valid and represent a general payment with no item attribution.
 */
export function validateItemAllocations({ items = [], allocations = [], existingAllocations = [] } = {}) {
  const itemMap = normalizeItems(items);
  const requested = quantitiesByItem(allocations, 'novas alocações');
  const existing = quantitiesByItem(existingAllocations, 'alocações existentes', { allowDuplicates: true });
  const result = [];
  let subtotal = 0;

  for (const [key, allocation] of existing) {
    const item = itemMap.get(key);
    if (!item) {
      throw new PaymentAllocationError(
        `O item ${allocation.id} não pertence à comanda.`,
        'item_not_found',
      );
    }
    if (allocation.quantidade > item.quantidade + EPSILON) {
      throw new PaymentAllocationError(
        `A quantidade já alocada para o item ${allocation.id} excede a quantidade da comanda.`,
        'quantity_exceeded',
      );
    }
  }

  for (const [key, allocation] of requested) {
    const item = itemMap.get(key);
    if (!item) {
      throw new PaymentAllocationError(
        `O item ${allocation.id} não pertence à comanda.`,
        'item_not_found',
      );
    }

    const alreadyAllocated = existing.get(key)?.quantidade || 0;
    const totalRequested = alreadyAllocated + allocation.quantidade;
    if (totalRequested > item.quantidade + EPSILON) {
      throw new PaymentAllocationError(
        `A quantidade alocada para o item ${allocation.id} excede a quantidade da comanda.`,
        'quantity_exceeded',
      );
    }

    const valor = roundMoney(allocation.quantidade * item.precoUnitario);
    result.push({
      id_comanda_item: item.id,
      quantidade: allocation.quantidade,
      preco_unitario: item.precoUnitario,
      valor,
    });
    subtotal += valor;
  }

  return {
    allocations: result,
    subtotal: roundMoney(subtotal),
    quantitiesByItem: Object.fromEntries(
      [...existing.entries(), ...requested.entries()].map(([key, entry]) => [
        key,
        (existing.get(key)?.quantidade || 0) + (requested.get(key)?.quantidade || 0),
      ]),
    ),
  };
}

/**
 * Calculates the subtotal from normalized allocation rows. The item list is used
 * as the price source; a row's persisted valor is deliberately not trusted.
 */
export function calculateAllocatedSubtotal(allocations = [], items = []) {
  return validateItemAllocations({ items, allocations }).subtotal;
}

/**
 * Builds rows for comanda_pagamento_itens. Passing no allocations intentionally
 * returns no child rows, preserving the existing general-payment flow.
 */
export function allocatePaymentItems({
  paymentId = null,
  userId = null,
  items = [],
  allocations = [],
  existingAllocations = [],
} = {}) {
  const validated = validateItemAllocations({ items, allocations, existingAllocations });
  return {
    ...validated,
    rows: validated.allocations.map((allocation) => ({
      id_pagamento: paymentId,
      id_comanda_item: allocation.id_comanda_item,
      id_usuario: userId,
      quantidade: allocation.quantidade,
      preco_unitario: allocation.preco_unitario,
      valor: allocation.valor,
    })),
  };
}
