/**
 * Narrative layer for deterministic intelligence signals. Templates are the
 * product default; the LLM is an optional, best-effort copy refinement.
 */

import { INTELLIGENCE_LLM_ENABLED, INTELLIGENCE_LLM_MAX_TOKENS, INTELLIGENCE_LLM_MODEL } from './config.js';

const money = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
}).format(Number(value) || 0);
const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const qty = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
const clean = (value, fallback = 'este produto') => String(value || fallback).trim();

/** @param {{type: string, evidence: Record<string, any>}} signal */
export function templateNarrative(signal) {
  const e = signal.evidence || {};
  switch (signal.type) {
    case 'REVENUE_BELOW_WEEKDAY_AVG':
      return `As vendas somaram ${money(e.revenue_today)}, ${pct(Math.abs(e.delta_pct))} abaixo da média das últimas ${qty(e.n_baseline)} ${e.weekday || 'datas equivalentes'} (${money(e.baseline_avg)}).`;
    case 'REVENUE_ABOVE_WEEKDAY_AVG':
      return `As vendas somaram ${money(e.revenue_today)}, ${pct(e.delta_pct)} acima da média das últimas ${qty(e.n_baseline)} ${e.weekday || 'datas equivalentes'} (${money(e.baseline_avg)}).`;
    case 'AVG_TICKET_DOWN':
      return `O ticket médio ficou em ${money(e.ticket_today)}, ${pct(Math.abs(e.delta_ticket_pct))} abaixo da referência de ${money(e.ticket_baseline)}, com ${qty(e.qtd_today)} vendas.`;
    case 'PRODUCT_SALES_DROP':
      return `${clean(e.nome_produto)} vendeu ${qty(e.qty_last7)} unidades nos últimos 7 dias, ${pct(Math.abs(e.delta_pct))} abaixo da média anterior de ${qty(e.baseline_avg_7d)} unidades por semana.`;
    case 'TOP_PRODUCT_CONCENTRATION':
      return `${clean(e.nome_produto)} concentrou ${pct(e.share_pct)} das vendas dos últimos 30 dias: ${money(e.revenue_product_30d)} de ${money(e.revenue_total_30d)}.`;
    case 'PAYMENT_MIX_SHIFT':
      return `${clean(e.forma, 'Essa forma de pagamento')} passou de ${pct(e.share_previous)} para ${pct(e.share_recent)} das vendas recentes, uma mudança de ${pct(Math.abs(e.shift_pp))}.`;
    case 'FIADO_ISSUED_SHARE_HIGH':
      return `Nos últimos 30 dias, ${money(e.fiado_issued_30d)} foram vendidos no fiado (${pct(e.share_pct)} de ${money(e.revenue_30d)}).`;
    case 'CASH_DIFFERENCE_RECURRING':
      return `Houve diferença em ${qty(e.n_with_difference)} de ${qty(e.n_closures_checked)} fechamentos analisados, somando ${money(e.sum_differences)} em diferenças.`;
    case 'STOCK_COVERAGE_LOW':
      return `${clean(e.nome_produto)} tem ${qty(e.estoque_atual)} unidades em estoque, cobertura aproximada de ${Number(e.coverage_days || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias no ritmo médio recente de ${Number(e.consumo_diario_medio || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unidades por dia.`;
    case 'STOCK_ZERO_WITH_DEMAND':
      return `${clean(e.nome_produto)} está com estoque zerado e teve saída em ${qty(e.dias_com_venda_7d)} dos últimos 7 dias, no ritmo médio de ${Number(e.consumo_diario_medio_7d || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unidades por dia.`;
    case 'CAIXA_LEFT_OPEN':
      return `Há um caixa aberto há cerca de ${Number(e.horas_aberto || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} horas desde ${clean(e.data_abertura, 'a abertura registrada')}.`;
    default:
      return 'Há um ponto para acompanhar nos números recentes do negócio.';
  }
}

function parseNarratives(narratives, signals) {
  if (!Array.isArray(narratives) || narratives.length !== signals.length || narratives.some((item) => typeof item !== 'string' || !item.trim() || /lucro|margem|vai acabar/i.test(item))) {
    throw new Error('Resposta de narrativa inválida');
  }
  return narratives.map((narrative) => narrative.trim());
}

/**
 * Generates a single, optional LLM response for a company's selected signals.
 * A malformed response or provider failure deliberately becomes templates.
 */
export async function generateNarratives(signals, perfil = {}, { openai, enabled = INTELLIGENCE_LLM_ENABLED } = {}) {
  const fallback = signals.map((signal) => ({ narrative: templateNarrative(signal), narrative_source: 'template' }));
  if (!enabled || !openai || signals.length === 0) return { narratives: fallback, usage: null };

  try {
    const businessName = perfil.nome_exibicao || perfil.razao_social || 'o negócio';
    const completion = await openai.chat.completions.create({
      model: INTELLIGENCE_LLM_MODEL,
      temperature: 0.3,
      max_tokens: INTELLIGENCE_LLM_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você é Zelinho, sócio cuidadoso de pequenos negócios. Use somente números presentes em evidence. Escreva 1 ou 2 frases por sinal, em português do Brasil, sem exclamações em sinais negativos. Nunca use as palavras lucro, margem ou a frase vai acabar. Responda JSON com a chave narratives, um array de strings na mesma ordem dos sinais.' },
        { role: 'user', content: JSON.stringify({ business_name: businessName, signals: signals.map(({ type, severity, evidence }) => ({ type, severity, evidence })) }) },
      ],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const narratives = parseNarratives(parsed.narratives, signals).map((narrative) => ({ narrative, narrative_source: 'llm' }));
    return { narratives, usage: completion.usage || null };
  } catch (error) {
    console.warn('[intelligence] Narrativa LLM indisponível; usando template:', error.message);
    return { narratives: fallback, usage: null };
  }
}
