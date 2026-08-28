import { STANDARD_PAYMENT_FORMS, formatPaymentMethod } from './paymentMethods.js';

export const PAYMENT_METHOD_VISUALS = Object.freeze({
  vale_refeicao: Object.freeze({
    color: 'bg-lime-500',
    textColor: 'text-lime-600 dark:text-lime-400',
    hex: '#84cc16',
  }),
});

/**
 * Reads a cash-closing payment snapshot while remaining compatible with
 * rows written before `totais_pagamento` existed.
 */
export function readCashClosingPaymentTotals(closing = {}) {
  const raw = closing?.totais_pagamento;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const snapshot = Object.fromEntries(
      Object.entries(raw)
        .map(([id, value]) => [id, money(value)])
        .filter(([id, value]) => id && id !== 'multiplo' && value > 0),
    );
    if (Object.keys(snapshot).length > 0) return snapshot;
  }

  return Object.fromEntries(
    [
      ['dinheiro', closing?.total_dinheiro],
      ['pix', closing?.total_pix],
      ['cartao', closing?.total_cartao],
    ]
      .map(([id, value]) => [id, money(value)])
      .filter(([id, value]) => id && value > 0),
  );
}

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
