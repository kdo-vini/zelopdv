/**
 * @file Ranking e priorização de sinais para o Zelo Intelligence Engine V1.
 *
 * Fluxo:
 * 1. Gate mínimo de confiança (confidence ≥ 0.5).
 * 2. Score = severityWeight × 1000 + magnitudeFactor × confidence.
 *    Severidade é a camada de prioridade primária; magnitude × confidence
 *    só desempata sinais da mesma severidade (nunca ultrapassa a diferença
 *    entre duas camadas), então um sinal "info" com delta grande não pode
 *    roubar a vaga de um sinal "critical" sem evidência de delta.
 * 3. Seleciona top N (MAX_SIGNALS_PER_DAY) do dia.
 * 4. Cooldown: verifica último sinal do mesmo dedupe_key.
 */

import { SEVERITY_WEIGHTS, MAX_SIGNALS_PER_DAY } from './config.js';

/**
 * Fator de magnitude baseado no delta do sinal.
 * Para sinais com delta, usa |delta|/threshold. Sem delta, usa 1.
 * @param {BusinessSignal} signal
 * @returns {number}
 */
function magnitudeFactor(signal) {
  const evidence = signal.evidence || {};
  const delta = evidence.delta_pct;
  const shift = evidence.shift_pp;

  if (delta != null && delta !== 0) {
    // Quanto maior o delta absoluto, maior a magnitude
    return Math.min(3, Math.abs(delta) * 5);
  }

  if (shift != null && shift !== 0) {
    return Math.min(3, Math.abs(shift) * 5);
  }

  // Sinais sem delta (ex.: CAIXA_LEFT_OPEN, TOP_PRODUCT_CONCENTRATION)
  return 1;
}

/**
 * Calcula o score de um sinal.
 * score = severityWeight × 1000 + magnitudeFactor × confidence
 *
 * O termo `magnitudeFactor × confidence` fica no intervalo [0, 3], bem menor
 * que os 1000 pontos que separam cada camada de severidade — então ele nunca
 * pode elevar um sinal para a camada de severidade acima da sua.
 * @param {BusinessSignal} signal
 * @returns {number}
 */
function computeScore(signal) {
  const severityWeight = SEVERITY_WEIGHTS[signal.severity] || 1;
  const magnitude = magnitudeFactor(signal);
  const confidence = signal.confidence || 0;
  return Math.round((severityWeight * 1000 + magnitude * confidence) * 10000) / 10000;
}

/**
 * Filtra sinais por confiança mínima e ordena por score decrescente.
 * Retorna os top N sinais como selecionados; o restante como suprimidos.
 * @param {BusinessSignal[]} signals
 * @param {Object} [options]
 * @param {number} [options.maxPerDay=3]
 * @returns {{ selected: BusinessSignal[], suppressed: number, scores: Object<string, number> }}
 */
export function rankSignals(signals, options = {}) {
  const maxPerDay = options.maxPerDay ?? MAX_SIGNALS_PER_DAY;

  // Gate de confiança mínima
  const scored = signals
    .filter((s) => s.confidence >= 0.5)
    .map((s) => {
      const score = computeScore(s);
      return { ...s, score };
    });

  // Ordenar por score decrescente
  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, maxPerDay);
  const suppressed = scored.length - selected.length;

  // Mapa de scores para referência
  const scores = Object.fromEntries(scored.map((s) => [s.dedupe_key, s.score]));

  return { selected, suppressed, scores };
}

/**
 * Aplica cooldown: remove sinais cujo último sinal do mesmo dedupe_key
 * foi emitido dentro do período de cooldown.
 * @param {BusinessSignal[]} signals
 * @param {Map<string, string>} lastDates - dedupe_key → signal_date ISO
 * @param {Map<string, number>} cooldowns - dedupe_key → cooldown_days
 * @param {string} targetDate - 'YYYY-MM-DD'
 * @returns {{ filtered: BusinessSignal[], suppressedCooldown: number }}
 */
export function applyCooldown(signals, lastDates, cooldowns, targetDate) {
  const filtered = [];
  let suppressedCooldown = 0;

  for (const s of signals) {
    const lastDate = lastDates.get(s.dedupe_key);
    const cooldownDays = s.cooldown_days ?? cooldowns.get(s.dedupe_key) ?? 0;

    if (lastDate && cooldownDays > 0) {
      const last = new Date(lastDate + 'T12:00:00Z');
      const target = new Date(targetDate + 'T12:00:00Z');
      const daysSince = (target.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < cooldownDays) {
        suppressedCooldown++;
        continue;
      }
    }

    filtered.push(s);
  }

  return { filtered, suppressedCooldown };
}
