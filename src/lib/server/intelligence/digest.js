import { templateNarrative } from './narrative.js';

const money = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
}).format(Number(value) || 0).replace(/\u00a0/g, ' ');

/**
 * Returns whether today's digest has not been confirmed as sent yet.
 * Dates are local America/Sao_Paulo ISO dates, not instants.
 */
export function isDigestDue(lastSentDate, todayDate) {
  return !lastSentDate || String(lastSentDate) < String(todayDate);
}

/**
 * Builds the WhatsApp summary from persisted snapshots/signals only.
 * This intentionally never calls an LLM and always retains a useful message
 * when the day did not produce signals.
 */
const LINK_LINE = 'Veja os números: https://zelopdv.com.br/gestao/gerente';
const MAX_LENGTH = 800;

export function buildDailyDigestText(signals = [], snapshot = {}, perfil = {}, { mutedTypes = [] } = {}) {
  const businessName = perfil.nome_exibicao || perfil.razao_social || 'seu negócio';
  const muted = new Set(mutedTypes);
  const visibleSignals = signals.filter((signal) => !muted.has(signal.type)).slice(0, 3);
  const sales = Number(snapshot.qtd_vendas) || 0;
  const ticket = snapshot.ticket_medio == null ? null : money(snapshot.ticket_medio);
  const summary = `Ontem: ${money(snapshot.receita_bruta)} em ${sales} vendas${ticket ? `, ticket médio de ${ticket}` : ''}.`;
  const lines = [`Zelinho Gerente - ${businessName}`, summary];

  if (visibleSignals.length) {
    lines.push('Pontos para acompanhar:');
    for (const signal of visibleSignals) lines.push(`- ${signal.narrative || templateNarrative(signal)}`);
  } else {
    lines.push('Dia tranquilo: não apareceu nenhum aviso novo nos números de ontem.');
  }

  const body = lines.join('\n');
  const withLink = `${body}\n${LINK_LINE}`;
  if (withLink.length <= MAX_LENGTH) return withLink;

  // Truncate the body only, then append the link fresh — appending it to an
  // already-computed slice risked cutting the link itself in half and
  // duplicating a fragment of it right before the full link line.
  const reserved = `...\n${LINK_LINE}`.length;
  const truncatedBody = body.slice(0, MAX_LENGTH - reserved).trimEnd();
  return `${truncatedBody}...\n${LINK_LINE}`;
}

/**
 * Lê as preferências do resumo diário. O campo `hora` foi abandonado: o resumo
 * sai sempre logo após o processamento diário do motor.
 * @param {{ gerente_prefs?: any }} profile
 * @returns {{ enabled: boolean, mutedTypes: string[] }}
 */
export function readDigestPrefs(profile) {
  const prefs = profile?.gerente_prefs && typeof profile.gerente_prefs === 'object' ? profile.gerente_prefs : {};
  const whatsapp = prefs.whatsapp && typeof prefs.whatsapp === 'object' ? prefs.whatsapp : {};
  return {
    enabled: whatsapp.enabled === true,
    mutedTypes: Array.isArray(prefs.muted_types) ? prefs.muted_types : [],
  };
}

/**
 * @param {{ prefs: { enabled: boolean }, lastSentDate: string|null, today: string }} input
 * @returns {boolean}
 */
export function shouldSendDigest({ prefs, lastSentDate, today }) {
  return prefs?.enabled === true && isDigestDue(lastSentDate, today);
}
