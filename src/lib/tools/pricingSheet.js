// Cálculo puro da planilha de precificação (/ferramentas/precificacao).
// Sem estado, sem Supabase: recebe números (reais/percentual) e devolve os
// campos derivados. custo/venda tratam 0 como valor válido; só null,
// undefined, NaN ou string vazia contam como "faltando".

/** Margem desejada padrão (%) quando o produto não define uma. */
export const DEFAULT_MARGEM_DESEJADA = 60;

/** Rótulos de status exibidos na planilha. */
export const STATUS_LABELS = {
  ok: 'Na meta',
  abaixo: 'Abaixo da meta',
  prejuizo: 'Prejuízo',
  incompleto: 'Falta custo ou preço',
};

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const markupFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** @param {unknown} value @returns {number|null} número finito ou null se ausente/inválido. */
function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} value @param {number} decimals @returns {number|null} arredondado, ou null se não finito. */
function roundTo(value, decimals) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Calcula os campos derivados de uma linha da planilha de precificação.
 * @param {{ custo?: number|null, venda?: number|null, margemDesejada?: number|null }} row
 * @returns {{
 *   lucro: number|null,
 *   margem: number|null,
 *   cmv: number|null,
 *   markup: number|null,
 *   sugerido: number|null,
 *   diferenca: number|null,
 *   status: 'ok'|'abaixo'|'prejuizo'|'incompleto',
 *   meta: number,
 * }}
 */
export function computeRow({ custo, venda, margemDesejada } = {}) {
  const custoNum = toNumberOrNull(custo);
  const vendaNum = toNumberOrNull(venda);
  const metaInput = toNumberOrNull(margemDesejada);
  const meta = metaInput === null ? DEFAULT_MARGEM_DESEJADA : metaInput;

  const custoMissing = custoNum === null;
  const vendaMissing = vendaNum === null;
  const vendaInvalida = vendaMissing || vendaNum <= 0;

  const lucro = custoMissing || vendaMissing ? null : roundTo(vendaNum - custoNum, 2);

  const margem = custoMissing || vendaInvalida
    ? null
    : roundTo(((vendaNum - custoNum) / vendaNum) * 100, 1);

  const cmv = custoMissing || vendaInvalida
    ? null
    : roundTo((custoNum / vendaNum) * 100, 1);

  const markup = custoMissing || custoNum <= 0 || vendaMissing
    ? null
    : roundTo(vendaNum / custoNum, 2);

  const sugerido = custoMissing ? null : roundTo(custoNum / (1 - meta / 100), 2);

  const diferenca = sugerido === null || vendaMissing ? null : roundTo(sugerido - vendaNum, 2);

  let status;
  if (custoMissing || vendaInvalida) {
    status = 'incompleto';
  } else if (margem <= 0) {
    status = 'prejuizo';
  } else if (margem < meta) {
    status = 'abaixo';
  } else {
    status = 'ok';
  }

  return { lucro, margem, cmv, markup, sugerido, diferenca, status, meta };
}

/**
 * Resume a planilha: totais, médias (só das linhas completas) e contagens por status.
 * @param {Array<{ custo?: number|null, venda?: number|null, margemDesejada?: number|null }>} rows
 * @returns {{
 *   total: number,
 *   completos: number,
 *   margemMedia: number|null,
 *   cmvMedio: number|null,
 *   abaixoDaMeta: number,
 *   emPrejuizo: number,
 * }}
 */
export function summarize(rows = []) {
  const computed = rows.map((row) => computeRow(row));
  const completas = computed.filter((row) => row.margem !== null);
  const completos = completas.length;

  const margemMedia = completos
    ? roundTo(completas.reduce((sum, row) => sum + row.margem, 0) / completos, 1)
    : null;
  const cmvMedio = completos
    ? roundTo(completas.reduce((sum, row) => sum + row.cmv, 0) / completos, 1)
    : null;

  const abaixoDaMeta = computed.filter((row) => row.status === 'abaixo').length;
  const emPrejuizo = computed.filter((row) => row.status === 'prejuizo').length;

  return { total: rows.length, completos, margemMedia, cmvMedio, abaixoDaMeta, emPrejuizo };
}

/**
 * Converte texto digitado como centavos (ex.: usuário digita "1234") em reais.
 * @param {string} value
 * @returns {number} ex.: "1234" → 12.34, "" → 0
 */
export function parseCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

/**
 * Formata um valor em reais para o texto do campo de dinheiro (sem "R$").
 * @param {number|null} value
 * @returns {string} ex.: 12.34 → "12,34"; 1234.5 → "1.234,50"; null/NaN → ""
 */
export function formatCurrencyInput(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {number|null} value percentual (40 = 40%)
 * @returns {string} ex.: 40 → "40%"; 52.5 → "52,5%"; null → "—"
 */
export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${percentFormatter.format(n)}%`;
}

/**
 * @param {number|null} value múltiplo de markup (ex.: 2.5)
 * @returns {string} ex.: 2.5 → "2,5×"; 2 → "2×"; null → "—"
 */
export function formatMarkup(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${markupFormatter.format(n)}×`;
}
