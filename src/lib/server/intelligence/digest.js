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

  lines.push('Veja os números: https://zelopdv.com.br/gestao/gerente');
  const text = lines.join('\n');
  return text.length <= 800 ? text : `${text.slice(0, 759).trimEnd()}...\nVeja os números: https://zelopdv.com.br/gestao/gerente`;
}
