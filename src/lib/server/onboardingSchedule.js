// Decide quais disparos da sequência de onboarding saem hoje para uma assinatura.
//
// Separado do handler do cron porque `+server.js` só pode exportar métodos HTTP, e
// esta é a parte com regra de verdade — a que precisa de teste.

const DIA_MS = 24 * 60 * 60 * 1000;

// Um disparo de onboarding só faz sentido perto do dia planejado. Sem esse teto, uma
// mudança em EMAIL_DAYS/WHATSAPP_DAYS faria o cron "recuperar" todos os dias novos de
// uma vez e despejar a sequência inteira na caixa de quem já está no meio do trial.
export const MAX_CATCHUP_DAYS = 3;

/**
 * Dias ancorados no FIM do trial, e não no início.
 *
 * O dia 13 afirma "encerra amanhã". Num trial de 14 dias o dia 13 É a véspera, então
 * tanto faz o âncora. Mas as contas criadas antes de 2026-07-27 têm 30 dias gravados em
 * `current_period_end`, e trial estendido pelo admin dura ainda mais: ancorado no
 * início, o aviso sairia com até duas semanas de antecedência, afirmando algo falso e
 * empurrando pra cobrança quem ainda tem meio trial pela frente.
 *
 * Ancorado no fim, a mensagem sai na véspera de verdade, seja lá quando ela for.
 */
export const END_ANCHORED_DAYS = new Set([13]);

/**
 * Dias corridos desde a criação da assinatura, ou null se a data for inválida.
 * @param {{ created_at?: string }} trial
 */
export function diasDesdeInicio(trial, now = new Date()) {
  if (!trial?.created_at) return null;
  const inicio = new Date(trial.created_at);
  if (Number.isNaN(inicio.getTime())) return null;
  return Math.floor((now.getTime() - inicio.getTime()) / DIA_MS);
}

/**
 * Dias restantes de trial, ou null se não der pra calcular. Considera extensão manual,
 * que é o que de fato estende o acesso.
 * @param {{ current_period_end?: string, manually_extended_until?: string }} trial
 */
export function diasRestantes(trial, now = new Date()) {
  const fimBruto = trial?.manually_extended_until || trial?.current_period_end;
  if (!fimBruto) return null;
  const fim = new Date(fimBruto);
  if (Number.isNaN(fim.getTime())) return null;
  return Math.max(0, Math.ceil((fim.getTime() - now.getTime()) / DIA_MS));
}

/**
 * Este dia da sequência deve disparar hoje?
 * @param {number} day
 * @param {{ daysSince: number|null, daysLeft: number|null }} agenda
 */
export function deveDisparar(day, { daysSince, daysLeft } = {}) {
  if (END_ANCHORED_DAYS.has(day)) {
    return daysLeft !== null && daysLeft !== undefined && daysLeft <= 1;
  }
  if (daysSince === null || daysSince === undefined) return false;
  if (daysSince < day) return false;
  return daysSince <= day + MAX_CATCHUP_DAYS;
}
