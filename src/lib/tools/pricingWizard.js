// Entrevista de precificação (wizard) para /ferramentas/precificacao.
// Portado de src/lib/components/tools/PricingCalculator.svelte, mas trocando
// MARKUP-sobre-custo por MARGEM-sobre-venda: o resultado final reusa
// computeRow (pricingSheet.js) para ficar consistente com a planilha.
// Sem estado, sem Supabase: só números in/out.

import { computeRow } from './pricingSheet.js';

/**
 * Nichos com valores default de margem (%), faixa comum e se costumam usar
 * taxa de plataforma (iFood etc.). Convertidos dos antigos `defaultMarkup`
 * (markup sobre custo) para `defaultMargem` (margem sobre venda) via
 * margem = markup / (1 + markup) * 100, arredondado.
 */
export const NICHES = [
  {
    id: 'marmitaria',
    label: 'Marmitaria',
    defaultMargem: 28,
    commonRange: '22% a 35%',
    placeholder: 'Marmita de frango grelhado',
    defaultPlatformFee: true,
    description: 'Boa para quem vende unidade avulsa e também por app.',
  },
  {
    id: 'lanchonete',
    label: 'Lanchonete / Hot-dog',
    defaultMargem: 30,
    commonRange: '25% a 40%',
    placeholder: 'Hot-dog especial',
    defaultPlatformFee: false,
    description: 'Ideal para lanche unitário, combo simples e venda no balcão.',
  },
  {
    id: 'hamburgueria',
    label: 'Hamburgueria',
    defaultMargem: 32,
    commonRange: '28% a 45%',
    placeholder: 'Burger artesanal',
    defaultPlatformFee: true,
    description: 'Funciona bem para combo, smash e delivery por app.',
  },
  {
    id: 'pizzaria',
    label: 'Pizzaria',
    defaultMargem: 30,
    commonRange: '25% a 38%',
    placeholder: 'Pizza média de calabresa',
    defaultPlatformFee: true,
    description: 'Use quando embalagem, entrega e taxa influenciam bastante.',
  },
  {
    id: 'doceria',
    label: 'Açaí / Doceria / Páscoa',
    defaultMargem: 35,
    commonRange: '30% a 50%',
    placeholder: 'Ovo de Páscoa de 350g',
    defaultPlatformFee: false,
    description: 'Serve para doce unitário, kit sazonal e produção por encomenda.',
  },
  {
    id: 'delivery',
    label: 'Delivery puro',
    defaultMargem: 28,
    commonRange: '22% a 35%',
    placeholder: 'Combo delivery',
    defaultPlatformFee: true,
    description: 'Escolha este se a maior parte das vendas passa por app.',
  },
  {
    id: 'mercadinho',
    label: 'Mercadinho / Mercearia',
    defaultMargem: 20,
    commonRange: '15% a 28%',
    placeholder: 'Cesta promocional',
    defaultPlatformFee: false,
    description: 'Melhor para itens simples com giro recorrente.',
  },
  {
    id: 'outro',
    label: 'Outro',
    defaultMargem: 30,
    commonRange: '20% a 40%',
    placeholder: 'Seu produto principal',
    defaultPlatformFee: false,
    description: 'Use quando seu caso não encaixa nos exemplos acima.',
  },
];

/** Unidades de compra/uso de ingrediente, agrupadas por família convertível. */
export const UNIT_OPTIONS = [
  { value: 'g', label: 'g', family: 'weight', factor: 1 },
  { value: 'kg', label: 'kg', family: 'weight', factor: 1000 },
  { value: 'ml', label: 'ml', family: 'volume', factor: 1 },
  { value: 'l', label: 'L', family: 'volume', factor: 1000 },
  { value: 'un', label: 'un', family: 'count', factor: 1 },
];

/** Taxa de plataforma padrão (%) sugerida quando o nicho costuma usar app. */
export const DEFAULT_PLATFORM_FEE = 12;

const nicheMap = NICHES.reduce((acc, niche) => {
  acc[niche.id] = niche;
  return acc;
}, {});

const unitMap = UNIT_OPTIONS.reduce((acc, unit) => {
  acc[unit.value] = unit;
  return acc;
}, {});

/** @param {number} value @param {number} decimals @returns {number|null} */
function roundTo(value, decimals) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** @param {unknown} value @param {number} fallback @returns {number} */
function toNumberSafe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getUnitDefinition(unit) {
  return unitMap[unit] || unitMap.g;
}

/**
 * @param {string} id
 * @returns {typeof NICHES[number]} o nicho, ou 'outro' se o id não existir.
 */
export function getNiche(id) {
  return nicheMap[id] || nicheMap.outro;
}

/**
 * Presets de margem (%) sugeridos para um nicho.
 * @param {string} nicheId
 * @returns {{ competitiva: number, equilibrada: number, premium: number }}
 */
export function marginPresets(nicheId) {
  const niche = getNiche(nicheId);
  return {
    competitiva: Math.max(5, niche.defaultMargem - 8),
    equilibrada: niche.defaultMargem,
    premium: Math.min(80, niche.defaultMargem + 12),
  };
}

/**
 * @param {{ purchaseUnit?: string, usageUnit?: string }} row
 * @returns {boolean} se as unidades de compra e uso são da mesma família (peso/volume/unidade).
 */
export function isIngredientCompatible(row) {
  const purchaseUnit = getUnitDefinition(row?.purchaseUnit);
  const usageUnit = getUnitDefinition(row?.usageUnit);
  return purchaseUnit.family === usageUnit.family;
}

/**
 * Custo de um ingrediente para a quantidade usada na receita, a partir do
 * preço de compra. 0 se as unidades forem incompatíveis ou algum valor <= 0.
 * Sem arredondamento (valor bruto, usado internamente por ingredientsTotal).
 * @param {{ purchaseQuantity?: number, purchaseUnit?: string, purchasePrice?: number, usageQuantity?: number, usageUnit?: string }} row
 * @returns {number}
 */
export function ingredientCost(row) {
  if (!isIngredientCompatible(row)) return 0;

  const purchaseUnit = getUnitDefinition(row?.purchaseUnit);
  const usageUnit = getUnitDefinition(row?.usageUnit);

  const purchaseQuantity = Number(row?.purchaseQuantity || 0) * purchaseUnit.factor;
  const usageQuantity = Number(row?.usageQuantity || 0) * usageUnit.factor;
  const purchasePrice = Number(row?.purchasePrice || 0);

  if (purchaseQuantity <= 0 || usageQuantity <= 0 || purchasePrice <= 0) return 0;

  return purchasePrice * (usageQuantity / purchaseQuantity);
}

/**
 * Soma o custo de uma lista de ingredientes, arredondado a 2 casas.
 * @param {Array<Parameters<typeof ingredientCost>[0]>} rows
 * @returns {number}
 */
export function ingredientsTotal(rows = []) {
  const total = rows.reduce((sum, row) => sum + ingredientCost(row), 0);
  return roundTo(total, 2) ?? 0;
}

/**
 * Resultado final da entrevista de precificação: custo direto (base +
 * embalagem + outros), preço mínimo (ponto de equilíbrio com a taxa) e o
 * preço sugerido/margem/lucro via computeRow da planilha, usando o próprio
 * preço sugerido como "venda" para fechar a conta.
 * @param {{ custoBase?: number, embalagem?: number, outros?: number, taxa?: number, margem?: number }} params
 * @returns {{
 *   custoDireto: number,
 *   precoMinimo: number|null,
 *   lucro: number|null,
 *   margem: number|null,
 *   cmv: number|null,
 *   markup: number|null,
 *   sugerido: number|null,
 *   diferenca: number|null,
 *   status: 'ok'|'abaixo'|'prejuizo'|'incompleto',
 *   meta: number,
 *   taxa: number,
 *   taxaValor: number|null,
 *   valido: boolean,
 * }}
 */
export function wizardResult({ custoBase, embalagem = 0, outros = 0, taxa = 0, margem } = {}) {
  const custoDireto =
    roundTo(toNumberSafe(custoBase) + toNumberSafe(embalagem) + toNumberSafe(outros), 2) ?? 0;

  const { sugerido } = computeRow({ custo: custoDireto, margemDesejada: margem, taxaPlataforma: taxa });

  const final = computeRow({
    custo: custoDireto,
    venda: sugerido,
    margemDesejada: margem,
    taxaPlataforma: taxa,
  });

  const precoMinimo =
    custoDireto > 0 ? roundTo(custoDireto / (1 - toNumberSafe(taxa) / 100), 2) : null;

  const valido = custoDireto > 0 && final.meta + final.taxa < 100;

  return { custoDireto, precoMinimo, ...final, valido };
}
