/**
 * @file Configuração centralizada do Zelo Intelligence Engine V1.
 * Todos os thresholds, cooldowns, amostras mínimas e flags vivem aqui.
 * Nenhum magic number nos detectores ou módulos de métricas.
 *
 * Convenções:
 * - Percentuais em fração (0.15 = 15%)
 * - Valores monetários em reais
 * - Dias em inteiros
 */

export const ENGINE_VERSION = 'v1.0.0';

/** Fuso canônico do engine */
export const ENGINE_TIMEZONE = 'America/Sao_Paulo';

/**
 * Thresholds e parâmetros por sinal.
 * Cada entrada usa o mesmo nome do tipo do sinal (type).
 * Campos herdados globalmente usam os defaults abaixo.
 */
export const SIGNAL_THRESHOLDS = {
  REVENUE_BELOW_WEEKDAY_AVG: {
    delta_threshold: -0.15,
    delta_critical: -0.30,
    min_sample: 4,
    n_alvo: 8,
    cooldown_days: 3,
    severity: 'attention',
    severity_critical: 'critical',
  },
  REVENUE_ABOVE_WEEKDAY_AVG: {
    delta_threshold: 0.20,
    min_sample: 4,
    n_alvo: 8,
    cooldown_days: 3,
    severity: 'info',
  },
  AVG_TICKET_DOWN: {
    delta_ticket_threshold: -0.10,
    delta_qtd_max: 0.10,
    min_sample: 4,
    min_qtd_dia: 10,
    n_alvo: 8,
    cooldown_days: 3,
    severity: 'attention',
  },
  PRODUCT_SALES_DROP: {
    delta_threshold: -0.30,
    n_blocks: 4,
    top_n_revenue: 10,
    min_days_with_sale_28d: 8,
    lookback_days: 28,
    block_size_days: 7,
    cooldown_days: 7,
    severity: 'attention',
  },
  TOP_PRODUCT_CONCENTRATION: {
    share_threshold: 0.50,
    min_vendas_30d: 50,
    confidence_fixed: 0.9,
    cooldown_days: 30,
    severity: 'info',
  },
  PAYMENT_MIX_SHIFT: {
    shift_threshold: 0.10,
    min_vendas_per_window: 30,
    cooldown_days: 14,
    severity: 'info',
  },
  FIADO_ISSUED_SHARE_HIGH: {
    share_threshold: 0.15,
    share_critical: 0.30,
    min_vendas_30d: 20,
    min_fiado_30d: 100,
    confidence_fixed: 0.9,
    cooldown_days: 7,
    severity: 'attention',
    severity_critical: 'critical',
  },
  CASH_DIFFERENCE_RECURRING: {
    n_diff_threshold: 4,
    diff_min_value: 5,
    min_fechamentos: 5,
    n_fechamentos_check: 10,
    cooldown_days: 7,
    severity: 'critical',
  },
  // Cobertura de estoque ao ritmo médio recente (NÃO é previsão de ruptura:
  // sem componente weekday, sem forecast — apenas estoque / consumo médio).
  STOCK_COVERAGE_LOW: {
    coverage_days_threshold: 2,
    min_dias_com_venda_14d: 7,
    consumo_minimo: 1,
    n_alvo: 10,
    cooldown_days: 3,
    severity: 'attention',
  },
  STOCK_ZERO_WITH_DEMAND: {
    min_dias_com_venda_7d: 3,
    consumo_minimo: 1,
    confidence_fixed: 0.9,
    cooldown_days: 3,
    severity: 'critical',
  },
  CAIXA_LEFT_OPEN: {
    horas_aberto_threshold: 16,
    confidence_fixed: 1.0,
    cooldown_days: 1,
    severity: 'attention',
  },
};

/** Pesos para score de ranking */
export const SEVERITY_WEIGHTS = {
  info: 1,
  attention: 2,
  critical: 3,
};

/** Flags globais */
export const CLOSED_DAY_HEURISTIC_RATIO = 0.5;
export const MAX_SIGNALS_PER_DAY = 3;
export const RECOMPUTE_WINDOW_DAYS = 3;
export const INACTIVITY_DAYS = 7;
export const BACKFILL_DAYS = 56;
export const SNAPSHOT_HISTORY_WEEKS = 8;

// Narrative generation is strictly optional. Templates remain the default.
export const INTELLIGENCE_LLM_ENABLED = process.env.INTELLIGENCE_LLM_ENABLED === 'true';
export const INTELLIGENCE_LLM_MODEL = 'gpt-4.1-mini';
export const INTELLIGENCE_LLM_MAX_TOKENS = 400;
export const INTELLIGENCE_LLM_INPUT_COST_PER_MILLION_USD = 0.40;
export const INTELLIGENCE_LLM_OUTPUT_COST_PER_MILLION_USD = 1.60;

/**
 * @typedef {Object} DailyMetrics — corpo de business_daily_snapshots.metrics
 * @property {number} receita_bruta - Σ valor_total (valor comercial vendido, inclui fiado)
 * @property {number} receita_realizada - bruto − fiado emitido (dimensão de caixa)
 * @property {number} qtd_vendas
 * @property {number|null} ticket_medio - receita_bruta / qtd_vendas (ticket COMERCIAL;
 *   fiado não reduz ticket — comportamento de compra ≠ forma de recebimento)
 * @property {number} fiado_emitido
 * @property {number|null} fiado_saldo_total
 * @property {number} descontos
 * @property {number} taxa_entrega
 * @property {number} custos_plataforma
 * @property {Object<string, number>} mix_pagamentos
 * @property {Array<{id_produto: number|null, nome: string, qtd: number, receita: number}>} por_produto
 * @property {number[]} por_hora — 24 posições, R$ por hora local
 * @property {boolean} backfilled
 */

/**
 * @typedef {Object} SnapshotRow — linha de business_daily_snapshots (I/O)
 * @property {string} user_id
 * @property {string} snapshot_date
 * @property {DailyMetrics} metrics
 * @property {number} receita_bruta
 * @property {number} receita_realizada
 * @property {number} qtd_vendas
 * @property {number|null} ticket_medio
 * @property {number|null} fiado_saldo_total
 * @property {string} engine_version
 */

/**
 * @typedef {Object} BusinessSignal — saída dos detectores
 * @property {string} type
 * @property {string} dedupe_key
 * @property {'info'|'attention'|'critical'} severity
 * @property {number} confidence — 0..1
 * @property {number} score — preenchido por ranking.js
 * @property {Object} evidence
 * @property {string} signal_date
 * @property {number|null} cooldown_days
 */

/**
 * @typedef {Object} DetectorContext — entrada única dos detectores
 * @property {string} targetDate — D-1 local ('YYYY-MM-DD')
 * @property {DailyMetrics} today — métricas do targetDate
 * @property {SnapshotRow[]} history — até 56 snapshots anteriores
 * @property {Array<{data_fechamento: string, diferenca: number, total_geral: number}>} fechamentos
 * @property {Array<{id: number, nome: string, estoque_atual: number, controlar_estoque: boolean}>} produtosEstoque
 * @property {Array<{id: number, data_abertura: string}>} caixasAbertos
 * @property {Array<{nome: string, saldo_fiado: number}>} topDevedores
 * @property {string} nowIso
 */

/**
 * @typedef {Object} CompanyRunResult
 * @property {string} userId
 * @property {'processed'|'skipped_flag'|'skipped_inactive'|'failed'} status
 * @property {number} signalsCreated
 * @property {number} signalsSuppressed
 * @property {{step: string, message: string}|null} error
 */
