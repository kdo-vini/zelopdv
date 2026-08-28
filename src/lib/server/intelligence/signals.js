/**
 * @file Detectores de sinais determinísticos do Zelo Intelligence Engine V1.
 *
 * Cada detector é uma função pura `(ctx) → BusinessSignal|BusinessSignal[]|null`.
 * Thresholds e parâmetros vêm exclusivamente de config.js — zero magic numbers.
 *
 * Contrato:
 * - Se a amostra mínima não for atingida, retorna null (não emite sinal).
 * - Evidence contém números suficientes para auditar a decisão.
 * - Nenhum dado bruto (vendas, itens) — apenas agregações de DailyMetrics.
 */

import { addDays, weekdayOf } from './tz.js';
import {
  SIGNAL_THRESHOLDS,
  CLOSED_DAY_HEURISTIC_RATIO,
  ENGINE_VERSION,
} from './config.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Confiança baseada em tamanho de amostra e estabilidade (coeficiente de variação).
 * @param {number} n - tamanho real da baseline
 * @param {number} nAlvo - tamanho desejado da baseline
 * @param {number[]} values - valores da baseline (para CV)
 * @returns {number} 0..1
 */
function baselineConfidence(n, nAlvo, values) {
  if (n <= 0 || values.length === 0) return 0;
  const sampleFactor = Math.min(1, n / nAlvo);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return sampleFactor * 0.5; // CV infinito, penaliza
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / Math.abs(mean);
  const stabilityFactor = 1 - Math.min(0.5, cv);
  return sampleFactor * stabilityFactor;
}

/**
 * Verifica se um dia é provavelmente fechado com base no histórico.
 * @param {number[]} weekdayRevenues - receitas das ocorrências do mesmo weekday
 * @returns {boolean} true se ≥CLOSED_DAY_HEURISTIC_RATIO das ocorrências têm 0 receita
 */
function isLikelyClosedDay(weekdayRevenues) {
  if (weekdayRevenues.length === 0) return false;
  const zeroCount = weekdayRevenues.filter((r) => r === 0).length;
  return zeroCount / weekdayRevenues.length >= CLOSED_DAY_HEURISTIC_RATIO;
}

/**
 * Obtém receitas do mesmo weekday do histórico (excluindo targetDate).
 */
function getWeekdayRevenues(history, targetDate, field = 'receita_bruta') {
  const targetWeekday = weekdayOf(targetDate);
  return history
    .filter((s) => {
      if (s.snapshot_date === targetDate) return false;
      return weekdayOf(s.snapshot_date) === targetWeekday;
    })
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    .map((s) => Number(s[field]) || 0);
}

/**
 * Cria o objeto evidence base (campos comuns a todos os sinais).
 */
function baseEvidence(ctx) {
  return {
    computed_at: ctx.nowIso,
    engine_version: ENGINE_VERSION,
  };
}

/**
 * Registro de detectores. Cada entrada tem nome e função.
 * @type {Array<{name: string, detect: function}>}
 */
const DETECTORS = [];

// ── S1: REVENUE_BELOW_WEEKDAY_AVG ───────────────────────────────────────────

DETECTORS.push({
  name: 'REVENUE_BELOW_WEEKDAY_AVG',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.REVENUE_BELOW_WEEKDAY_AVG;
    const revenues = getWeekdayRevenues(ctx.history, ctx.targetDate);
    const revenuesWithSales = revenues.filter((r) => r > 0);

    // Amostra mínima
    if (revenuesWithSales.length < cfg.min_sample) return null;

    // Heurística de dia fechado
    if (isLikelyClosedDay(revenues)) return null;

    // Baseline
    const recent = revenuesWithSales.slice(0, cfg.n_alvo);
    const baselineAvg = recent.reduce((s, v) => s + v, 0) / recent.length;

    const revenueToday = ctx.today?.receita_bruta ?? 0;
    const delta = baselineAvg > 0 ? (revenueToday - baselineAvg) / baselineAvg : 0;

    if (delta > cfg.delta_threshold) return null;

    const confidence = baselineConfidence(recent.length, cfg.n_alvo, recent);
    if (confidence < 0.5) return null;

    const severity = delta <= cfg.delta_critical ? cfg.severity_critical : cfg.severity;

    return {
      type: 'REVENUE_BELOW_WEEKDAY_AVG',
      dedupe_key: 'REVENUE_BELOW_WEEKDAY_AVG',
      severity,
      confidence: roundConfidence(confidence),
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        revenue_today: revenueToday,
        weekday: weekdayOf(ctx.targetDate),
        baseline_avg: roundMoney(baselineAvg),
        baseline_values: recent.map(roundMoney),
        delta_pct: roundDelta(delta),
        n_baseline: recent.length,
        window: {
          start: ctx.history.length > 0 ? ctx.history[ctx.history.length - 1].snapshot_date : ctx.targetDate,
          end: ctx.targetDate,
          days: ctx.history.length,
        },
        sample_size: recent.length,
        baseline_kind: 'same_weekday_avg',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S2: REVENUE_ABOVE_WEEKDAY_AVG ───────────────────────────────────────────

DETECTORS.push({
  name: 'REVENUE_ABOVE_WEEKDAY_AVG',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.REVENUE_ABOVE_WEEKDAY_AVG;
    const revenues = getWeekdayRevenues(ctx.history, ctx.targetDate);
    const revenuesWithSales = revenues.filter((r) => r > 0);

    if (revenuesWithSales.length < cfg.min_sample) return null;
    if (isLikelyClosedDay(revenues)) return null;

    const recent = revenuesWithSales.slice(0, cfg.n_alvo);
    const baselineAvg = recent.reduce((s, v) => s + v, 0) / recent.length;

    const revenueToday = ctx.today?.receita_bruta ?? 0;
    const delta = baselineAvg > 0 ? (revenueToday - baselineAvg) / baselineAvg : 0;

    if (delta < cfg.delta_threshold) return null;

    const confidence = baselineConfidence(recent.length, cfg.n_alvo, recent);
    if (confidence < 0.5) return null;

    // É recorde?
    const isRecord = revenueToday >= Math.max(...recent);

    return {
      type: 'REVENUE_ABOVE_WEEKDAY_AVG',
      dedupe_key: 'REVENUE_ABOVE_WEEKDAY_AVG',
      severity: cfg.severity,
      confidence: roundConfidence(confidence),
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        revenue_today: revenueToday,
        weekday: weekdayOf(ctx.targetDate),
        baseline_avg: roundMoney(baselineAvg),
        baseline_values: recent.map(roundMoney),
        delta_pct: roundDelta(delta),
        n_baseline: recent.length,
        is_record: isRecord,
        window: {
          start: ctx.history.length > 0 ? ctx.history[ctx.history.length - 1].snapshot_date : ctx.targetDate,
          end: ctx.targetDate,
          days: ctx.history.length,
        },
        sample_size: recent.length,
        baseline_kind: 'same_weekday_avg',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S3: AVG_TICKET_DOWN ────────────────────────────────────────────────────

DETECTORS.push({
  name: 'AVG_TICKET_DOWN',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.AVG_TICKET_DOWN;

    // Piso de vendas no dia
    const qtdToday = ctx.today?.qtd_vendas ?? 0;
    if (qtdToday < cfg.min_qtd_dia) return null;

    // Baseline de ticket
    const tickets = ctx.history
      .filter((s) => s.snapshot_date !== ctx.targetDate && weekdayOf(s.snapshot_date) === weekdayOf(ctx.targetDate))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
      .map((s) => s.ticket_medio)
      .filter((t) => t != null && t > 0);

    if (tickets.length < cfg.min_sample) return null;

    const recentTickets = tickets.slice(0, cfg.n_alvo);
    const ticketBaseline = recentTickets.reduce((s, v) => s + v, 0) / recentTickets.length;

    // Baseline de qtd
    const qtds = ctx.history
      .filter((s) => s.snapshot_date !== ctx.targetDate && weekdayOf(s.snapshot_date) === weekdayOf(ctx.targetDate))
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
      .slice(0, cfg.n_alvo)
      .map((s) => s.qtd_vendas);

    const qtdBaseline = qtds.length > 0 ? qtds.reduce((s, v) => s + v, 0) / qtds.length : 0;

    const ticketToday = ctx.today?.ticket_medio ?? 0;
    if (ticketToday <= 0) return null;

    const deltaTicket = (ticketToday - ticketBaseline) / ticketBaseline;
    const deltaQtd = qtdBaseline > 0 ? (qtdToday - qtdBaseline) / qtdBaseline : 0;

    // Ticket caiu E volume estável
    if (deltaTicket > cfg.delta_ticket_threshold) return null;
    if (Math.abs(deltaQtd) >= cfg.delta_qtd_max) return null;

    const confidence = baselineConfidence(recentTickets.length, cfg.n_alvo, recentTickets);
    if (confidence < 0.5) return null;

    return {
      type: 'AVG_TICKET_DOWN',
      dedupe_key: 'AVG_TICKET_DOWN',
      severity: cfg.severity,
      confidence: roundConfidence(confidence),
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        ticket_today: roundMoney(ticketToday),
        ticket_baseline: roundMoney(ticketBaseline),
        delta_ticket_pct: roundDelta(deltaTicket),
        qtd_today: qtdToday,
        qtd_baseline: Math.round(qtdBaseline),
        delta_qtd_pct: roundDelta(deltaQtd),
        window: {
          start: ctx.history.length > 0 ? ctx.history[ctx.history.length - 1].snapshot_date : ctx.targetDate,
          end: ctx.targetDate,
          days: ctx.history.length,
        },
        sample_size: recentTickets.length,
        baseline_kind: 'same_weekday_avg',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S4: PRODUCT_SALES_DROP ─────────────────────────────────────────────────

DETECTORS.push({
  name: 'PRODUCT_SALES_DROP',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.PRODUCT_SALES_DROP;

    // Construir blocos de 7 dias. O bloco atual = D-7..D-1 (targetDate incluso)
    // Blocos anteriores = 4 blocos consecutivos de 7 dias antes disso.
    // Precisamos de todos os snapshots dos últimos ~35 dias para cobrir 5 blocos.
    const allSnapshots = [...(ctx.history || [])]
      .filter((s) => s.snapshot_date <= ctx.targetDate)
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));

    // Separar em blocos de 7 dias
    const targetDay = new Date(ctx.targetDate + 'T12:00:00Z');
    const blocks = [];
    for (let b = 0; b < 5; b++) {
      const end = new Date(targetDay.getTime() - b * 7 * 24 * 60 * 60 * 1000);
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
      const blockSnapshots = allSnapshots.filter((s) => {
        const d = new Date(s.snapshot_date + 'T12:00:00Z');
        return d >= start && d <= end;
      });
      blocks.push(blockSnapshots);
    }

    // Bloco atual (índice 0) e baseline (índices 1-4)
    const currentBlock = blocks[0];
    const baselineBlocks = blocks.slice(1, 5);

    if (currentBlock.length === 0) return null;

    // Agregar por_produto em cada bloco
    function aggregateProductQty(block) {
      const map = new Map();
      for (const snap of block) {
        const produtos = snap.metrics?.por_produto || [];
        for (const p of produtos) {
          const key = p.id_produto != null ? `id:${p.id_produto}` : `nome:${p.nome}`;
          const existing = map.get(key) || { id_produto: p.id_produto, nome: p.nome, qtd: 0, receita: 0 };
          existing.qtd += p.qtd;
          existing.receita += p.receita;
          map.set(key, existing);
        }
      }
      return map;
    }

    // Determinar elegibilidade: top 10 receita nos últimos 28 dias
    const last28Snapshots = allSnapshots.filter((s) => {
      const diff = (targetDay.getTime() - new Date(s.snapshot_date + 'T12:00:00Z').getTime()) / (24 * 60 * 60 * 1000);
      return diff <= 28;
    });

    const revenue28d = new Map();
    const daysWithSale28d = new Map();
    for (const snap of last28Snapshots) {
      const produtos = snap.metrics?.por_produto || [];
      const hasSale = produtos.some((p) => p.qtd > 0);
      for (const p of produtos) {
        const key = p.id_produto != null ? `id:${p.id_produto}` : `nome:${p.nome}`;
        revenue28d.set(key, (revenue28d.get(key) || 0) + p.receita);
        if (p.qtd > 0 && hasSale) {
          daysWithSale28d.set(key, (daysWithSale28d.get(key) || 0) + 1);
        }
      }
    }

    const topProducts = [...revenue28d.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, cfg.top_n_revenue)
      .map(([key]) => key);

    const currentAgg = aggregateProductQty(currentBlock);
    const baselineAggs = baselineBlocks.map(aggregateProductQty);

    const results = [];

    for (const key of topProducts) {
      // Verificar dias com venda
      const daysWithSale = daysWithSale28d.get(key) || 0;
      if (daysWithSale < cfg.min_days_with_sale_28d) continue;

      // Qtd no bloco atual
      const current = currentAgg.get(key);
      if (!current || current.qtd <= 0) continue;

      // Média de qtd nos blocos baseline
      const baselineQtys = baselineAggs
        .map((bagg) => {
          const entry = bagg.get(key);
          return entry ? entry.qtd : 0;
        });
      const baselineAvg = baselineQtys.reduce((s, v) => s + v, 0) / baselineQtys.length;

      if (baselineAvg <= 0) continue;

      const delta = (current.qtd - baselineAvg) / baselineAvg;

      if (delta > cfg.delta_threshold) continue;

      const confidence = baselineConfidence(
        baselineQtys.filter((q) => q > 0).length,
        cfg.n_blocks,
        baselineQtys.filter((q) => q > 0)
      );
      if (confidence < 0.5) continue;

      results.push({
        type: 'PRODUCT_SALES_DROP',
        dedupe_key: `PRODUCT_SALES_DROP:${key.replace(/^id:/, '')}`,
        severity: cfg.severity,
        confidence: roundConfidence(confidence),
        score: 0,
        evidence: {
          ...baseEvidence(ctx),
          id_produto: current.id_produto,
          nome_produto: current.nome,
          qty_last7: Math.round(current.qtd),
          baseline_avg_7d: roundMoney(baselineAvg),
          delta_pct: roundDelta(delta),
          revenue_share_28d: revenue28d.get(key) / Math.max(1, [...revenue28d.values()].reduce((s, v) => s + v, 0)),
          blocks: baselineQtys.map(Math.round),
          window: { start: addDays(ctx.targetDate, -34), end: ctx.targetDate, days: 35 },
          sample_size: baselineQtys.filter((q) => q > 0).length,
          baseline_kind: 'prev_4_blocks_7d',
        },
        cooldown_days: cfg.cooldown_days,
      });
    }

    return results.length > 0 ? results : null;
  },
});

// ── S5: TOP_PRODUCT_CONCENTRATION ──────────────────────────────────────────

DETECTORS.push({
  name: 'TOP_PRODUCT_CONCENTRATION',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.TOP_PRODUCT_CONCENTRATION;

    // Agregar 30 dias de por_produto
    const recentSnapshots = (ctx.history || []).filter((s) => {
      const diff = daysBetween(s.snapshot_date, ctx.targetDate);
      return diff >= 0 && diff <= 29; // 30 dias corridos incluindo o dia-alvo
    });

    const productRevenue = new Map();
    const productNames = new Map();
    let totalRevenue30d = 0;
    let totalVendas30d = 0;

    for (const snap of recentSnapshots) {
      totalVendas30d += snap.qtd_vendas || 0;
      const produtos = snap.metrics?.por_produto || [];
      for (const p of produtos) {
        const key = p.id_produto != null ? `id:${p.id_produto}` : `nome:${p.nome}`;
        productRevenue.set(key, (productRevenue.get(key) || 0) + p.receita);
        if (!productNames.has(key)) {
          productNames.set(key, p.nome);
        }
      }
    }

    // Soma da receita (inclui dias sem venda com 0)
    for (const { receita_bruta: rb } of recentSnapshots) {
      totalRevenue30d += rb || 0;
    }

    if (totalVendas30d < cfg.min_vendas_30d) return null;
    if (totalRevenue30d <= 0) return null;

    // Encontrar o top produto
    const topProduct = [...productRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!topProduct) return null;

    const share = topProduct[1] / totalRevenue30d;
    if (share <= cfg.share_threshold) return null;

    const key = topProduct[0];
    const idProduto = key.startsWith('id:') ? Number(key.replace('id:', '')) : null;

    return {
      type: 'TOP_PRODUCT_CONCENTRATION',
      dedupe_key: `TOP_PRODUCT_CONCENTRATION:${key.replace(/^id:/, '')}`,
      severity: cfg.severity,
      confidence: cfg.confidence_fixed,
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        id_produto: idProduto,
        nome_produto: productNames.get(key) || '',
        share_pct: roundDelta(share),
        revenue_product_30d: roundMoney(topProduct[1]),
        revenue_total_30d: roundMoney(totalRevenue30d),
        qtd_vendas_30d: totalVendas30d,
        window: { start: addDays(ctx.targetDate, -29), end: ctx.targetDate, days: 30 },
        sample_size: totalVendas30d,
        baseline_kind: 'absolute',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S6: PAYMENT_MIX_SHIFT ──────────────────────────────────────────────────

DETECTORS.push({
  name: 'PAYMENT_MIX_SHIFT',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.PAYMENT_MIX_SHIFT;
    const daysSince = (date) => daysBetween(date, ctx.targetDate);

    // Janela recente: últimos 7 dias (D-7 a D-1)
    const recent = (ctx.history || []).filter((s) => {
      const d = daysSince(s.snapshot_date);
      return d >= 0 && d <= 7;
    });
    // Janela anterior: D-35 a D-8
    const previous = (ctx.history || []).filter((s) => {
      const d = daysSince(s.snapshot_date);
      return d >= 8 && d <= 35;
    });

    const nRecent = recent.reduce((s, snap) => s + (snap.qtd_vendas || 0), 0);
    const nPrevious = previous.reduce((s, snap) => s + (snap.qtd_vendas || 0), 0);

    if (nRecent < cfg.min_vendas_per_window || nPrevious < cfg.min_vendas_per_window) return null;

    // Agregar mix das duas janelas
    function aggregateMix(snapshots) {
      const mix = { pix: 0, dinheiro: 0, cartao: 0, vale_refeicao: 0, fiado: 0, outros: 0 };
      for (const snap of snapshots) {
        const m = snap.metrics?.mix_pagamentos || {};
        mix.pix += m.pix || 0;
        mix.dinheiro += m.dinheiro || 0;
        mix.cartao += m.cartao || 0;
        mix.vale_refeicao += m.vale_refeicao || 0;
        mix.fiado += m.fiado || 0;
        mix.outros += m.outros || 0;
      }
      return mix;
    }

    const recentMix = aggregateMix(recent);
    const prevMix = aggregateMix(previous);

    const recentTotal = Object.values(recentMix).reduce((s, v) => s + v, 0);
    const prevTotal = Object.values(prevMix).reduce((s, v) => s + v, 0);

    if (recentTotal <= 0 || prevTotal <= 0) return null;

    // Calcular shift para cada forma
    const shifts = [];
    for (const forma of ['pix', 'dinheiro', 'cartao', 'vale_refeicao', 'fiado']) {
      const shareRecent = recentMix[forma] / recentTotal;
      const sharePrev = prevMix[forma] / prevTotal;
      const shift = shareRecent - sharePrev;
      if (Math.abs(shift) >= cfg.shift_threshold) {
        shifts.push({ forma, shift, share_recent: shareRecent, share_previous: sharePrev });
      }
    }

    if (shifts.length === 0) return null;

    // Emitir o maior shift
    shifts.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
    const top = shifts[0];

    return {
      type: 'PAYMENT_MIX_SHIFT',
      dedupe_key: `PAYMENT_MIX_SHIFT:${top.forma}`,
      severity: cfg.severity,
      confidence: roundConfidence(nRecent >= cfg.nAlvo ? 1 : nRecent / (cfg.nAlvo || 30)),
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        forma: top.forma,
        share_recent: roundDelta(top.share_recent),
        share_previous: roundDelta(top.share_previous),
        shift_pp: roundDelta(top.shift),
        n_recent: nRecent,
        n_previous: nPrevious,
        window: { start: addDays(ctx.targetDate, -34), end: ctx.targetDate, days: 35 },
        sample_size: nRecent,
        baseline_kind: 'prev_28d_share',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S7: FIADO_ISSUED_SHARE_HIGH ────────────────────────────────────────────

DETECTORS.push({
  name: 'FIADO_ISSUED_SHARE_HIGH',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.FIADO_ISSUED_SHARE_HIGH;

    // Últimos 30 dias de snapshots
    const recentSnapshots = (ctx.history || []).filter((s) => {
      const diff = daysBetween(s.snapshot_date, ctx.targetDate);
      return diff >= 0 && diff <= 29; // 30 dias corridos incluindo o dia-alvo
    });

    let totalVendas30d = 0;
    let totalReceita30d = 0;
    let totalFiado30d = 0;

    for (const snap of recentSnapshots) {
      totalVendas30d += snap.qtd_vendas || 0;
      totalReceita30d += snap.receita_bruta || 0;
      totalFiado30d += (snap.metrics?.fiado_emitido || 0);
    }

    if (totalVendas30d < cfg.min_vendas_30d) return null;
    if (totalFiado30d < cfg.min_fiado_30d) return null;
    if (totalReceita30d <= 0) return null;

    const share = totalFiado30d / totalReceita30d;
    if (share < cfg.share_threshold) return null;

    const severity = share >= cfg.share_critical ? cfg.severity_critical : cfg.severity;

    return {
      type: 'FIADO_ISSUED_SHARE_HIGH',
      dedupe_key: 'FIADO_ISSUED_SHARE_HIGH',
      severity,
      confidence: cfg.confidence_fixed,
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        fiado_issued_30d: roundMoney(totalFiado30d),
        revenue_30d: roundMoney(totalReceita30d),
        share_pct: roundDelta(share),
        saldo_fiado_total_atual: ctx.today?.fiado_saldo_total ?? null,
        top_devedores: (ctx.topDevedores || []).slice(0, 3),
        window: { start: addDays(ctx.targetDate, -29), end: ctx.targetDate, days: 30 },
        sample_size: totalVendas30d,
        baseline_kind: 'absolute_benchmark',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S8: CASH_DIFFERENCE_RECURRING ──────────────────────────────────────────

DETECTORS.push({
  name: 'CASH_DIFFERENCE_RECURRING',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.CASH_DIFFERENCE_RECURRING;
    const fechamentos = (ctx.fechamentos || [])
      .sort((a, b) => new Date(b.data_fechamento) - new Date(a.data_fechamento))
      .slice(0, cfg.n_fechamentos_check);

    if (fechamentos.length < cfg.min_fechamentos) return null;

    const diffs = fechamentos.filter((f) => Math.abs(Number(f.diferenca) || 0) > cfg.diff_min_value);
    const nDiff = diffs.length;

    if (nDiff < cfg.n_diff_threshold) return null;

    const sumDiff = diffs.reduce((s, f) => s + Math.abs(Number(f.diferenca) || 0), 0);
    const confidence = Math.min(1, fechamentos.length / cfg.n_fechamentos_check);

    return {
      type: 'CASH_DIFFERENCE_RECURRING',
      dedupe_key: 'CASH_DIFFERENCE_RECURRING',
      severity: cfg.severity,
      confidence: roundConfidence(confidence),
      score: 0,
      evidence: {
        ...baseEvidence(ctx),
        n_closures_checked: fechamentos.length,
        n_with_difference: nDiff,
        sum_differences: roundMoney(sumDiff),
        avg_difference: roundMoney(sumDiff / Math.max(1, nDiff)),
        worst: diffs
          .map((f) => ({ date: f.data_fechamento, diferenca: f.diferenca }))
          .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))[0] || null,
        last_dates: fechamentos.map((f) => f.data_fechamento),
        window: { start: addDays(ctx.targetDate, -29), end: ctx.targetDate, days: 30 },
        sample_size: fechamentos.length,
        baseline_kind: 'absolute_count',
      },
      cooldown_days: cfg.cooldown_days,
    };
  },
});

// ── S9: STOCK_COVERAGE_LOW ─────────────────────────────────────────────────
// Cobertura de estoque ao ritmo médio recente. NÃO é previsão de ruptura:
// não há componente weekday nem forecast temporal — o fato suportado é
// "o estoque atual representa ~N dias do ritmo médio recente de vendas".
// Nenhuma camada futura (narrativa/UI) deve traduzir isso como "acaba amanhã".

DETECTORS.push({
  name: 'STOCK_COVERAGE_LOW',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.STOCK_COVERAGE_LOW;
    const produtos = (ctx.produtosEstoque || []).filter((p) => p.controlar_estoque);

    if (produtos.length === 0) return null;

    // Consumo dos últimos 14 dias corridos (D-0..D-13, targetDate incluso),
    // casando com o divisor fixo de 14 abaixo.
    const recentSnapshots = (ctx.history || []).filter((s) => {
      const diff = daysBetween(s.snapshot_date, ctx.targetDate);
      return diff >= 0 && diff <= 13;
    });
    recentSnapshots.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));

    // Mapa de consumo por produto
    const consumption = new Map();
    const daysWithSale = new Map();

    for (const snap of recentSnapshots) {
      const produtosNoDia = snap.metrics?.por_produto || [];
      const hasVenda = (snap.qtd_vendas || 0) > 0;
      for (const p of produtosNoDia) {
        if (p.id_produto == null) continue;
        const key = p.id_produto;
        consumption.set(key, (consumption.get(key) || 0) + p.qtd);
        if (p.qtd > 0 && hasVenda) {
          daysWithSale.set(key, (daysWithSale.get(key) || 0) + 1);
        }
      }
    }

    const results = [];

    for (const prod of produtos) {
      const id = prod.id;
      const qtd = consumption.get(id) || 0;
      const dias = daysWithSale.get(id) || 0;

      if (dias < cfg.min_dias_com_venda_14d) continue;

      // Ritmo médio por dia corrido (não por dia com venda) — semântica de
      // "cobertura ao ritmo médio recente", coerente com o nome do sinal.
      const consumoDiario = qtd / 14;
      if (consumoDiario < cfg.consumo_minimo) continue;

      const estoque = Number(prod.estoque_atual) || 0;
      if (estoque <= 0) continue;

      const coverage = estoque / consumoDiario;
      if (coverage > cfg.coverage_days_threshold) continue;

      // Confiança baseada em consistência do consumo
      const dailyConsumptions = recentSnapshots.map((snap) => {
        const prods = snap.metrics?.por_produto || [];
        const found = prods.find((p) => p.id_produto === id);
        return found ? found.qtd : 0;
      });

      const confidence = baselineConfidence(
        dias,
        cfg.n_alvo,
        dailyConsumptions
      );
      if (confidence < 0.5) continue;

      results.push({
        type: 'STOCK_COVERAGE_LOW',
        dedupe_key: `STOCK_COVERAGE_LOW:${id}`,
        severity: cfg.severity,
        confidence: roundConfidence(confidence),
        score: 0,
        evidence: {
          ...baseEvidence(ctx),
          id_produto: id,
          nome_produto: prod.nome || '',
          estoque_atual: estoque,
          consumo_diario_medio: roundMoney(consumoDiario),
          coverage_days: roundMoney(coverage),
          dias_com_venda_14d: dias,
          window: { start: addDays(ctx.targetDate, -13), end: ctx.targetDate, days: 14 },
          sample_size: dias,
          baseline_kind: 'self_consumption_14d',
        },
        cooldown_days: cfg.cooldown_days,
      });
    }

    return results.length > 0 ? results : null;
  },
});

// ── S10: STOCK_ZERO_WITH_DEMAND ────────────────────────────────────────────

DETECTORS.push({
  name: 'STOCK_ZERO_WITH_DEMAND',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.STOCK_ZERO_WITH_DEMAND;
    const produtos = (ctx.produtosEstoque || []).filter((p) => p.controlar_estoque);

    if (produtos.length === 0) return null;

    // Consumo 7 dias
    const recentSnapshots = (ctx.history || []).filter((s) => {
      const diff = daysBetween(s.snapshot_date, ctx.targetDate);
      return diff >= 0 && diff <= 6; // 7 dias corridos incluindo o dia-alvo (divisor 7)
    });

    const consumption = new Map();
    const daysWithSale = new Map();

    for (const snap of recentSnapshots) {
      const produtosNoDia = snap.metrics?.por_produto || [];
      for (const p of produtosNoDia) {
        if (p.id_produto == null) continue;
        const key = p.id_produto;
        consumption.set(key, (consumption.get(key) || 0) + p.qtd);
        if (p.qtd > 0) {
          daysWithSale.set(key, (daysWithSale.get(key) || 0) + 1);
        }
      }
    }

    const results = [];

    for (const prod of produtos) {
      const id = prod.id;
      const estoque = Number(prod.estoque_atual) || 0;
      if (estoque > 0) continue;

      const dias = daysWithSale.get(id) || 0;
      if (dias < cfg.min_dias_com_venda_7d) continue;

      const qtdTotal = consumption.get(id) || 0;
      const consumoDiario = qtdTotal / 7;
      if (consumoDiario < cfg.consumo_minimo) continue;

      results.push({
        type: 'STOCK_ZERO_WITH_DEMAND',
        dedupe_key: `STOCK_ZERO_WITH_DEMAND:${id}`,
        severity: cfg.severity,
        confidence: cfg.confidence_fixed,
        score: 0,
        evidence: {
          ...baseEvidence(ctx),
          id_produto: id,
          nome_produto: prod.nome || '',
          estoque_atual: estoque,
          consumo_diario_medio_7d: roundMoney(consumoDiario),
          dias_com_venda_7d: dias,
          window: { start: addDays(ctx.targetDate, -6), end: ctx.targetDate, days: 7 },
          sample_size: dias,
          baseline_kind: 'self_consumption_7d',
        },
        cooldown_days: cfg.cooldown_days,
      });
    }

    return results.length > 0 ? results : null;
  },
});

// ── S11: CAIXA_LEFT_OPEN ───────────────────────────────────────────────────

DETECTORS.push({
  name: 'CAIXA_LEFT_OPEN',
  detect(ctx) {
    const cfg = SIGNAL_THRESHOLDS.CAIXA_LEFT_OPEN;
    const caixas = (ctx.caixasAbertos || []).filter((c) => c.data_abertura);

    if (caixas.length === 0) return null;

    const now = new Date(ctx.nowIso);
    const results = [];

    for (const caixa of caixas) {
      const abertura = new Date(caixa.data_abertura);
      if (Number.isNaN(abertura.getTime())) continue;

      const horasAberto = (now.getTime() - abertura.getTime()) / (1000 * 60 * 60);
      if (horasAberto < cfg.horas_aberto_threshold) continue;

      results.push({
        type: 'CAIXA_LEFT_OPEN',
        dedupe_key: `CAIXA_LEFT_OPEN:${caixa.id}`,
        severity: cfg.severity,
        confidence: cfg.confidence_fixed,
        score: 0,
        evidence: {
          ...baseEvidence(ctx),
          id_caixa: caixa.id,
          data_abertura: caixa.data_abertura,
          horas_aberto: roundMoney(horasAberto),
          valor_inicial: caixa.valor_inicial ?? null,
          window: { start: ctx.targetDate, end: ctx.targetDate, days: 1 },
          sample_size: 1,
          baseline_kind: 'absolute',
        },
        cooldown_days: cfg.cooldown_days,
      });
    }

    return results.length > 0 ? results : null;
  },
});

// ── Função principal ────────────────────────────────────────────────────────

/**
 * Executa todos os detectores de sinais em um DetectorContext.
 * Aplica regras de supressão entre sinais (ex.: S10 suprime S4).
 * @param {DetectorContext} ctx
 * @returns {BusinessSignal[]}
 */
export function detectSignals(ctx) {
  const allSignals = [];

  for (const detector of DETECTORS) {
    try {
      const result = detector.detect(ctx);
      if (result) {
        if (Array.isArray(result)) {
          allSignals.push(...result);
        } else {
          allSignals.push(result);
        }
      }
    } catch (err) {
      // Detector individual não deve quebrar o batch
      console.error(`[signals] Erro no detector ${detector.name}:`, err.message);
    }
  }

  // Supressão: S10 (STOCK_ZERO_WITH_DEMAND) suprime S4 (PRODUCT_SALES_DROP) do mesmo produto
  const suppressedByS10 = new Set();
  for (const s of allSignals) {
    if (s.type === 'STOCK_ZERO_WITH_DEMAND') {
      suppressedByS10.add(s.dedupe_key.replace('STOCK_ZERO_WITH_DEMAND:', ''));
    }
  }

  const filtered = allSignals.filter((s) => {
    if (s.type === 'PRODUCT_SALES_DROP') {
      const productId = s.dedupe_key.replace('PRODUCT_SALES_DROP:', '');
      if (suppressedByS10.has(productId)) return false;
    }
    return true;
  });

  return filtered;
}

// ── Helpers de formatação ────────────────────────────────────────────────────

function roundMoney(v) {
  return Math.round(Number(v) * 100) / 100;
}

function roundDelta(v) {
  return Math.round(Number(v) * 10000) / 10000;
}

function roundConfidence(v) {
  return Math.round(Math.min(1, Math.max(0, Number(v))) * 1000) / 1000;
}

function daysBetween(date1, date2) {
  const d1 = new Date(date1 + 'T12:00:00Z');
  const d2 = new Date(date2 + 'T12:00:00Z');
  return Math.round((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
}
