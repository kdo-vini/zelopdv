// "Como você conheceu o Zelo?" — atribuição auto-declarada, pergunta no
// onboarding (não no cadastro, pra não perder conversão — ver GEO_PLAN_2026-09
// seção 3). Complementa `ai_source` (referrer/utm) com o que a pessoa mesma diz:
// boa parte do tráfego de IA não deixa rastro técnico (ChatGPT mobile não manda
// referrer), então a resposta declarada é o único jeito de medir esse canal ali.
//
// Isomorphic e sem dependência de UI — a lógica pura (validação, payload) fica
// aqui pra ser testável sem montar o componente.

export const HEARD_FROM_OPTIONS = [
  { id: 'chatgpt_ia', label: 'ChatGPT ou outra IA' },
  { id: 'google', label: 'Pesquisa no Google' },
  { id: 'instagram_tiktok', label: 'Instagram ou TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'indicacao', label: 'Indicação de alguém' },
  { id: 'ifood', label: 'iFood' },
  { id: 'outro', label: 'Outro' },
];

const HEARD_FROM_IDS = new Set(HEARD_FROM_OPTIONS.map((option) => option.id));

/** @param {string} id */
export function isValidHeardFrom(id) {
  return typeof id === 'string' && HEARD_FROM_IDS.has(id);
}

/**
 * Payload gravado em `user_metadata` via `supabase.auth.updateUser`.
 * @param {string} id
 * @param {string} [now] ISO timestamp; injetável para teste.
 * @returns {{heard_from: string, heard_from_at: string}|null}
 */
export function buildHeardFromPayload(id, now = new Date().toISOString()) {
  if (!isValidHeardFrom(id)) return null;
  return { heard_from: id, heard_from_at: now };
}
