/**
 * Reads a signal through the service role only after binding it to the resolved
 * owner. Keeping the owner predicate in the query prevents cross-tenant signal
 * IDs from becoming contextual chat access.
 */
export async function getSignalContextForOwner(signalId, ownerUserId, client) {
  if (!signalId || typeof signalId !== 'string' || !ownerUserId || !client) return null;

  const { data, error } = await client
    .from('business_signals')
    .select('id, type, severity, confidence, evidence, narrative, signal_date')
    .eq('id', signalId)
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function buildSignalContextPrompt(signal) {
  if (!signal) return '';

  return `
CONTEXTO DO AVISO SELECIONADO
O usuario abriu esta conversa a partir de um aviso do Zelinho. Responda usando
exatamente os numeros presentes em evidence e na narrativa abaixo. Nao invente,
recalcule ou atribua outros numeros a este aviso. Se faltar informacao, diga isso
de forma direta e proponha o proximo passo operacional.
${JSON.stringify({
  type: signal.type,
  severity: signal.severity,
  signal_date: signal.signal_date,
  evidence: signal.evidence || {},
  narrative: signal.narrative || null,
})}`;
}
