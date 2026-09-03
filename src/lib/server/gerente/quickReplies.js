/**
 * @file Respostas rápidas sugeridas pelo modelo. O prompt pede que, ao fazer
 * uma pergunta com respostas curtas previsíveis, o modelo termine a mensagem
 * com uma linha `[[opcoes: A | B | C]]`. Aqui essa linha é extraída e removida
 * do texto que o dono vê.
 */

const MARKER = /\s*\[\[\s*op(?:c|ç)(?:o|õ)es\s*:\s*([^\]]*)\]\]\s*$/i;
const MAX_OPTIONS = 5;
const MAX_LABEL = 40;

/**
 * @param {string} reply
 * @returns {{ reply: string, options: string[] }}
 */
export function extractQuickReplies(reply) {
  const text = typeof reply === 'string' ? reply : '';
  const match = text.match(MARKER);
  if (!match) return { reply: text.trim(), options: [] };
  const seen = new Set();
  const options = [];
  for (const raw of match[1].split('|')) {
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL);
    const key = label.toLocaleLowerCase('pt-BR');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    options.push(label);
    if (options.length >= MAX_OPTIONS) break;
  }
  return { reply: text.slice(0, match.index).trim(), options };
}

/**
 * Para o WhatsApp não existem pills: as opções viram uma lista numerada.
 * @param {string} reply
 * @param {string[]} options
 */
export function appendOptionsAsText(reply, options) {
  if (!Array.isArray(options) || options.length === 0) return reply;
  return `${reply}\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
}
