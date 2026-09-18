// Parser puro para campos de preço digitados como texto (type="text" +
// inputmode="decimal") no ModalNovoProduto. Aceita vírgula ou ponto como
// separador decimal, no máximo 2 casas. Não sabe se o campo é obrigatório —
// quem chama decide o que fazer com `empty` (obrigatório -> erro; opcional ->
// null).
//
// Contrato de retorno:
// - '' / só espaço / null / undefined -> { ok: false, empty: true, value: null }
// - texto que não é um número válido (vírgula/ponto, sem sinal, até 2 casas)
//   -> { ok: false, empty: false, value: null }
// - número válido -> { ok: true, empty: false, value: <number> }

const PRECO_REGEX = /^\d+(?:[.,]\d{1,2})?$/;

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, empty: boolean, value: number | null }}
 */
export function parsePrecoInput(raw) {
  if (raw === null || raw === undefined) {
    return { ok: false, empty: true, value: null };
  }
  const trimmed = String(raw).trim();
  if (trimmed === '') {
    return { ok: false, empty: true, value: null };
  }
  if (!PRECO_REGEX.test(trimmed)) {
    return { ok: false, empty: false, value: null };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, empty: false, value: null };
  }
  return { ok: true, empty: false, value };
}
