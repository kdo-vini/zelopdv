export const PAYMENT_METHOD_IDS = Object.freeze({
  DINHEIRO: 'dinheiro',
  CARTAO_DEBITO: 'cartao_debito',
  CARTAO_CREDITO: 'cartao_credito',
  PIX: 'pix',
  VALE_REFEICAO: 'vale_refeicao',
  FIADO: 'fiado',
  CARTAO_LEGACY: 'cartao',
  MULTIPLO: 'multiplo'
});

const BUILT_IN_PAYMENT_METHODS = Object.freeze([
  Object.freeze({
    id: PAYMENT_METHOD_IDS.DINHEIRO,
    label: 'Dinheiro',
    asciiLabel: 'Dinheiro',
    icon: 'dinheiro',
    shortcut: 'D',
    isCash: true,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: true,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.CARTAO_DEBITO,
    label: 'Cartão de débito',
    asciiLabel: 'Cartao de debito',
    icon: 'cartao_debito',
    shortcut: 'B',
    isCash: false,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: false,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.CARTAO_CREDITO,
    label: 'Cartão de crédito',
    asciiLabel: 'Cartao de credito',
    icon: 'cartao_credito',
    shortcut: 'C',
    isCash: false,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: false,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.PIX,
    label: 'Pix',
    asciiLabel: 'Pix',
    icon: 'pix',
    shortcut: 'X',
    isCash: false,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: false,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.VALE_REFEICAO,
    label: 'Vale-Refeição',
    asciiLabel: 'Vale-refeicao',
    icon: 'vale_refeicao',
    shortcut: 'V',
    isCash: false,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: false,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.FIADO,
    label: 'Fiado',
    asciiLabel: 'Fiado',
    icon: 'fiado',
    shortcut: 'F',
    isCash: false,
    isRealizedRevenue: false,
    requiresCustomer: true,
    allowsChange: false,
    selectable: true
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.CARTAO_LEGACY,
    label: 'Cartão',
    asciiLabel: 'Cartao',
    icon: 'cartao',
    shortcut: null,
    isCash: false,
    isRealizedRevenue: true,
    requiresCustomer: false,
    allowsChange: false,
    selectable: false
  }),
  Object.freeze({
    id: PAYMENT_METHOD_IDS.MULTIPLO,
    label: 'Múltiplos pagamentos',
    asciiLabel: 'Multiplos pagamentos',
    icon: 'multiplo',
    shortcut: null,
    isCash: false,
    isRealizedRevenue: false,
    requiresCustomer: false,
    allowsChange: false,
    selectable: false
  })
]);

const paymentMethodsById = new Map(BUILT_IN_PAYMENT_METHODS.map((method) => [method.id, method]));

export const SELECTABLE_PAYMENT_METHODS = Object.freeze(
  BUILT_IN_PAYMENT_METHODS.filter((method) => method.selectable)
);

export const STANDARD_PAYMENT_FORMS = new Set(BUILT_IN_PAYMENT_METHODS.map((method) => method.id));

function normalizeId(id) {
  return typeof id === 'string' ? id.trim() : '';
}

const NATIVE_PAYMENT_ALIASES = Object.freeze({
  dinheiro: 'dinheiro',
  cash: 'dinheiro',
  pix: 'pix',
  'pix online': 'pix',
  debito: 'cartao_debito',
  'cartao debito': 'cartao_debito',
  'cartao de debito': 'cartao_debito',
  credito: 'cartao_credito',
  'cartao credito': 'cartao_credito',
  'cartao de credito': 'cartao_credito',
  cartao: 'cartao',
  'vale refeicao': 'vale_refeicao',
  fiado: 'fiado',
  multiplo: 'multiplo',
  'multiplos pagamentos': 'multiplo',
});

/**
 * Converts native payment labels/aliases to the IDs used by the financial
 * tables. Unknown values are kept intact because they may be configurable
 * platform IDs.
 */
export function normalizePaymentMethodId(id) {
  const normalized = normalizeId(id);
  const comparable = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return NATIVE_PAYMENT_ALIASES[comparable] || normalized;
}

function getPlatform(platforms, id) {
  if (!id) return null;

  if (Array.isArray(platforms)) {
    return platforms.find((platform) => normalizeId(platform?.id) === id) || null;
  }

  if (platforms && typeof platforms === 'object') {
    return platforms[id] || null;
  }

  return null;
}

function humanizePaymentMethod(id) {
  if (!id) return 'Outro';
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

export function getPaymentMethod(id) {
  return paymentMethodsById.get(normalizePaymentMethodId(id)) || null;
}

export function isCashPaymentMethod(id) {
  return getPaymentMethod(id)?.isCash === true;
}

export function isFiadoPaymentMethod(id) {
  return normalizePaymentMethodId(id) === PAYMENT_METHOD_IDS.FIADO;
}

export function isRealizedRevenuePaymentMethod(id) {
  const method = getPaymentMethod(id);
  return method ? method.isRealizedRevenue : !isFiadoPaymentMethod(id);
}

/**
 * Returns a configurable platform only when the ID is not reserved by a
 * native payment method. This keeps financial side effects consistent with
 * the label/UI precedence rule.
 */
export function getPaymentPlatform(id, platforms) {
  const normalizedId = normalizeId(id);
  if (!normalizedId || getPaymentMethod(normalizedId)) return null;
  return getPlatform(platforms, normalizedId);
}

export function formatPaymentMethod(id, { platforms, ascii = false } = {}) {
  const normalizedId = normalizePaymentMethodId(id);
  const nativeMethod = getPaymentMethod(normalizedId);
  if (nativeMethod) return ascii ? nativeMethod.asciiLabel : nativeMethod.label;

  const platform = getPaymentPlatform(normalizedId, platforms);
  const platformLabel = platform?.nome || platform?.name || platform?.label;
  if (typeof platformLabel === 'string' && platformLabel.trim()) return platformLabel.trim();

  return humanizePaymentMethod(normalizedId);
}
