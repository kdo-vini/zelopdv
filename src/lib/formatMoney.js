// Formatação de dinheiro em pt-BR para EXIBIÇÃO na UI. Não usar para valores
// enviados a payload/cálculo nem para chaves técnicas (ex.: buildCartItemKey).

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimalFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Intl insere um espaço não separável (U+00A0) entre "R$" e o número; troca
// por espaço normal para não surpreender comparação de texto/CSS.
const NBSP = / /g;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** @param {unknown} value @returns {string} ex.: "R$ 1.234,56" */
export function formatMoney(value) {
  return currencyFormatter.format(toFiniteNumber(value)).replace(NBSP, ' ');
}

/** @param {unknown} value @returns {string} ex.: "1.234,56" (sem "R$") */
export function formatMoneyNumber(value) {
  return decimalFormatter.format(toFiniteNumber(value)).replace(NBSP, ' ');
}
