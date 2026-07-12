/**
 * @file Engine principal do Zelo Intelligence Engine V1.
 *
 * Orquestrador que conecta fetchers → metrics → signals → ranking → persistence.
 *
 * Fluxo:
 *   1. Registra o run (started_at) — sobrevive a timeout do cron
 *   2. Lista empresas habilitadas (flag + assinatura ativa/trial)
 *   3. Para cada empresa:
 *      a. Gate de inatividade (sem venda em INACTIVITY_DAYS → skip)
 *      b. Janela de recompute D-3..D-1 (ou backfill de BACKFILL_DAYS na 1ª execução)
 *      c. Computa + upsert snapshots
 *      d. Detecta sinais → cooldown → ranking → persiste
 *   4. Finaliza o run (contadores + finished_at)
 */

import {
  ENGINE_VERSION,
  RECOMPUTE_WINDOW_DAYS,
  SIGNAL_THRESHOLDS,
  MAX_SIGNALS_PER_DAY,
  INACTIVITY_DAYS,
  BACKFILL_DAYS,
  SNAPSHOT_HISTORY_WEEKS,
  INTELLIGENCE_LLM_ENABLED,
  INTELLIGENCE_LLM_INPUT_COST_PER_MILLION_USD,
  INTELLIGENCE_LLM_OUTPUT_COST_PER_MILLION_USD,
} from './config.js';
import OpenAI from 'openai';
import { generateNarratives } from './narrative.js';
import { dayRangeUtc, dateRange, localDateOf, addDays } from './tz.js';
import { computeDailyMetrics } from './metrics.js';
import { detectSignals } from './signals.js';
import { rankSignals, applyCooldown } from './ranking.js';
import {
  fetchIntelligenceEnabledCompanies,
  hasRecentSales,
  fetchVendas,
  fetchVendasItens,
  fetchVendasPagamentos,
  fetchVendasTaxas,
  fetchCaixaFechamentos,
  fetchProdutosEstoque,
  fetchCaixasAbertos,
  fetchTopDevedores,
  fetchSaldoFiadoTotal,
  upsertSnapshot,
  fetchSnapshots,
  insertSignals,
  fetchLastSignalDates,
  insertIntelligenceRun,
  updateIntelligenceRun,
} from './fetchers.js';

/**
 * Processa todas as empresas habilitadas para uma data-alvo.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} targetDate - 'YYYY-MM-DD' local
 * @returns {Promise<Object>}
 */
export async function runDaily(db, targetDate) {
  const startedAt = new Date().toISOString();

  // Registrar o run ANTES do processamento: se o cron estourar o maxDuration,
  // a execução parcial fica visível (started_at sem finished_at).
  let runId = null;
  try {
    runId = await insertIntelligenceRun(db, {
      started_at: startedAt,
      target_date: targetDate,
      engine_version: ENGINE_VERSION,
    });
  } catch (err) {
    console.error('[intelligence] Erro ao registrar início do run:', err.message);
  }

  const companies = await fetchIntelligenceEnabledCompanies(db);

  const results = {
    companies_scanned: companies.length,
    companies_processed: 0,
    companies_skipped: 0,
    companies_failed: 0,
    signals_created: 0,
    signals_suppressed: 0,
    errors: [],
    llm_calls: 0,
    llm_tokens_in: 0,
    llm_tokens_out: 0,
    llm_cost_usd: 0,
  };

  const openai = INTELLIGENCE_LLM_ENABLED && process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  for (const company of companies) {
    try {
      const result = await runForCompany(db, company.id, targetDate, { openai, perfil: company });
      if (result.status === 'processed') {
        results.companies_processed++;
        results.signals_created += result.signalsCreated;
        results.signals_suppressed += result.signalsSuppressed;
        results.llm_calls += result.llmCalls;
        results.llm_tokens_in += result.llmTokensIn;
        results.llm_tokens_out += result.llmTokensOut;
        results.llm_cost_usd += result.llmCostUsd;
      } else {
        results.companies_skipped++;
      }
    } catch (err) {
      results.companies_failed++;
      results.errors.push({ user_id: company.id, step: 'runForCompany', message: err.message });
      console.error(`[intelligence] Erro na empresa ${company.id}:`, err.message);
    }
  }

  // Finalizar o run
  try {
    if (runId != null) {
      await updateIntelligenceRun(db, runId, {
        finished_at: new Date().toISOString(),
        companies_scanned: results.companies_scanned,
        companies_processed: results.companies_processed,
        companies_skipped: results.companies_skipped,
        companies_failed: results.companies_failed,
        signals_created: results.signals_created,
        signals_suppressed: results.signals_suppressed,
        errors: results.errors,
        llm_calls: results.llm_calls,
        llm_tokens_in: results.llm_tokens_in,
        llm_tokens_out: results.llm_tokens_out,
        llm_cost_usd: Math.round(results.llm_cost_usd * 1_000_000) / 1_000_000,
      });
    }
  } catch (err) {
    console.error('[intelligence] Erro ao finalizar run log:', err.message);
  }

  return results;
}

/**
 * Processa uma empresa para uma data-alvo.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} userId
 * @param {string} targetDate - 'YYYY-MM-DD' local
 * @returns {Promise<{status: string, signalsCreated: number, signalsSuppressed: number}>}
 */
export async function runForCompany(db, userId, targetDate, { openai = null, perfil = {} } = {}) {
  // ── Gate de inatividade: empresa sem venda em INACTIVITY_DAYS é pulada ──
  const inactivityStart = dayRangeUtc(addDays(targetDate, -(INACTIVITY_DAYS - 1))).startIso;
  const active = await hasRecentSales(db, userId, inactivityStart);
  if (!active) {
    return { status: 'skipped_inactive', signalsCreated: 0, signalsSuppressed: 0, llmCalls: 0, llmTokensIn: 0, llmTokensOut: 0, llmCostUsd: 0 };
  }

  // ── Janela: recompute normal ou backfill na primeira execução ───────────
  const existing = await fetchSnapshots(db, userId, 1);
  const isFirstRun = existing.length === 0;
  const windowDays = isFirstRun ? BACKFILL_DAYS : RECOMPUTE_WINDOW_DAYS;

  const recomputeStart = addDays(targetDate, -(windowDays - 1));
  const recomputeDates = dateRange(recomputeStart, targetDate);

  // ── Buscar dados agregados ─────────────────────────────────────────────
  const windowStartUtc = dayRangeUtc(recomputeStart).startIso;
  const windowEndUtc = dayRangeUtc(targetDate).endIso;

  const vendas = await fetchVendas(db, userId, windowStartUtc, windowEndUtc);
  const vendaIds = vendas.map((v) => v.id);

  const [itens, pagamentos, taxas] = await Promise.all([
    fetchVendasItens(db, vendaIds),
    fetchVendasPagamentos(db, vendaIds),
    fetchVendasTaxas(db, vendaIds),
  ]);

  // Agrupar por data local (uma passada por coleção)
  const vendasByDate = new Map();
  const dateByVendaId = new Map();
  for (const v of vendas) {
    const date = localDateOf(v.created_at);
    dateByVendaId.set(v.id, date);
    if (!vendasByDate.has(date)) vendasByDate.set(date, []);
    vendasByDate.get(date).push(v);
  }

  const groupByDate = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const date = dateByVendaId.get(row.id_venda);
      if (!date) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(row);
    }
    return map;
  };
  const itensByDate = groupByDate(itens);
  const pagamentosByDate = groupByDate(pagamentos);
  const taxasByDate = groupByDate(taxas);

  // Dados auxiliares (uma vez só para toda a empresa)
  const [fechamentos, produtosEstoque, caixasAbertos, topDevedores, saldoFiadoTotal] = await Promise.all([
    fetchCaixaFechamentos(db, userId),
    fetchProdutosEstoque(db, userId),
    fetchCaixasAbertos(db, userId),
    fetchTopDevedores(db, userId),
    fetchSaldoFiadoTotal(db, userId),
  ]);

  const nowIso = new Date().toISOString();

  // ── Compute & upsert snapshots ─────────────────────────────────────────
  const metricsByDate = new Map();
  for (const date of recomputeDates) {
    const isTarget = date === targetDate;

    const metrics = computeDailyMetrics({
      vendas: vendasByDate.get(date) || [],
      itens: itensByDate.get(date) || [],
      pagamentos: pagamentosByDate.get(date) || [],
      taxas: taxasByDate.get(date) || [],
      // Saldo de fiado é um estado do MOMENTO do run — só vale para o dia-alvo.
      // Escrevê-lo em dias passados corromperia a série (base do futuro
      // FIADO_BALANCE_GROWTH).
      saldoFiadoTotal: isTarget ? saldoFiadoTotal : null,
    });
    if (isFirstRun && !isTarget) {
      metrics.backfilled = true;
    }
    metricsByDate.set(date, metrics);

    const row = {
      user_id: userId,
      snapshot_date: date,
      metrics,
      receita_bruta: metrics.receita_bruta,
      receita_realizada: metrics.receita_realizada,
      qtd_vendas: metrics.qtd_vendas,
      ticket_medio: metrics.ticket_medio,
      engine_version: ENGINE_VERSION,
      computed_at: nowIso,
    };
    // Coluna omitida em dias não-alvo: o upsert preserva o valor gravado
    // quando aquele dia FOI o alvo (em vez de sobrescrever com o saldo atual).
    if (isTarget) {
      row.fiado_saldo_total = metrics.fiado_saldo_total;
    }

    await upsertSnapshot(db, row);
  }

  // ── Signal detection ───────────────────────────────────────────────────
  const todayMetrics = metricsByDate.get(targetDate);

  // 8 semanas de baseline do mesmo weekday + o snapshot do próprio dia-alvo.
  const history = await fetchSnapshots(db, userId, SNAPSHOT_HISTORY_WEEKS * 7 + 1);

  const ctx = {
    targetDate,
    today: todayMetrics,
    history,
    fechamentos,
    produtosEstoque,
    caixasAbertos,
    topDevedores,
    nowIso,
  };

  const signals = detectSignals(ctx);

  // ── Cooldown ANTES do ranking: sinal em cooldown não consome vaga do cap ──
  const cooldownKeys = [...new Set(signals.map((s) => s.dedupe_key))];
  const lastDates = await fetchLastSignalDates(db, userId, cooldownKeys);

  const cooldowns = new Map();
  for (const s of signals) {
    const cfg = SIGNAL_THRESHOLDS[s.type];
    if (cfg?.cooldown_days != null) {
      cooldowns.set(s.dedupe_key, cfg.cooldown_days);
    }
  }

  const { filtered, suppressedCooldown } = applyCooldown(signals, lastDates, cooldowns, targetDate);
  const { selected, suppressed } = rankSignals(filtered, { maxPerDay: MAX_SIGNALS_PER_DAY });

  // ── Persist ────────────────────────────────────────────────────────────
  let inserted = 0;
  let llmCalls = 0;
  let llmTokensIn = 0;
  let llmTokensOut = 0;
  let llmCostUsd = 0;
  if (selected.length > 0) {
    const { narratives, usage } = await generateNarratives(selected, perfil, { openai });
    if (usage) {
      llmCalls = 1;
      llmTokensIn = usage.prompt_tokens || 0;
      llmTokensOut = usage.completion_tokens || 0;
      llmCostUsd = (llmTokensIn / 1_000_000 * INTELLIGENCE_LLM_INPUT_COST_PER_MILLION_USD)
        + (llmTokensOut / 1_000_000 * INTELLIGENCE_LLM_OUTPUT_COST_PER_MILLION_USD);
      db.from('ai_usage_logs').insert({
        user_id: userId,
        chat_type: 'intelligence',
        model: 'gpt-4.1-mini',
        prompt_tokens: llmTokensIn,
        completion_tokens: llmTokensOut,
        total_tokens: usage.total_tokens || llmTokensIn + llmTokensOut,
        cost_usd: Math.round(llmCostUsd * 1_000_000) / 1_000_000,
      }).then(({ error }) => { if (error) console.warn('[intelligence] ai_usage_logs:', error.message); });
    }
    const signalRecords = selected.map((s, index) => ({
      user_id: userId,
      signal_date: targetDate,
      type: s.type,
      dedupe_key: s.dedupe_key,
      severity: s.severity,
      score: s.score,
      confidence: s.confidence,
      evidence: s.evidence,
      narrative: narratives[index].narrative,
      narrative_source: narratives[index].narrative_source,
      engine_version: ENGINE_VERSION,
      created_at: nowIso,
    }));

    const result = await insertSignals(db, signalRecords);
    inserted = result.inserted;
  }

  return {
    status: 'processed',
    signalsCreated: inserted,
    signalsSuppressed: suppressed + suppressedCooldown,
    llmCalls,
    llmTokensIn,
    llmTokensOut,
    llmCostUsd,
  };
}
