import { STANDARD_PAYMENT_FORMS, formatPaymentMethod } from './paymentMethods.js';

const REPORT_PAYMENT_METHODS = Object.freeze([
  ['dinheiro', 'dinheiro', 'Dinheiro'],
  ['pix', 'pix', 'Pix'],
  ['cartao_debito', 'cartaoDebito', 'Cartão (Débito)'],
  ['cartao_credito', 'cartaoCredito', 'Cartão (Crédito)'],
  ['cartao', 'cartaoLegacy', 'Cartão (legado)'],
  ['vale_refeicao', 'valeRefeicao', 'Vale-refeição'],
  ['fiado', 'fiado', 'Fiado'],
]);

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

/**
 * Normalizes payment totals into a presentation/export contract shared by
 * cash-closing and period reports. The input comes from calculatePaymentSummary
 * so sales with payment rows are already deduplicated.
 */
export function buildPaymentPresentation(summary = {}, { platforms = [] } = {}) {
  const totalsByForm = summary?.totalsByForm || {};
  const items = REPORT_PAYMENT_METHODS
    .map(([id, key, fallbackLabel]) => ({
      id,
      label: formatPaymentMethod(id, { platforms }) || fallbackLabel,
      value: money(summary?.[key] ?? totalsByForm[id]),
    }))
    .filter((item) => item.value > 0);

  const extras = Object.entries(totalsByForm)
    .filter(([id, value]) => !STANDARD_PAYMENT_FORMS.has(id) && money(value) > 0)
    .map(([id, value]) => ({
      id,
      label: formatPaymentMethod(id, { platforms }),
      value: money(value),
    }));

  return {
    items,
    extras,
    pagamentos: {
      dinheiro: money(summary?.dinheiro),
      pix: money(summary?.pix),
      debito: money(summary?.cartaoDebito),
      credito: money(summary?.cartaoCredito),
      cartaoLegado: money(summary?.cartaoLegacy),
      valeRefeicao: money(summary?.valeRefeicao),
      fiado: money(summary?.fiado),
      extras,
    },
  };
}
