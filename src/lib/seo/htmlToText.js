// Conversor minimalista de HTML (como o usado em src/lib/blog/posts.js,
// content: `<p>...</p>`) para texto plano/markdown-ish, usado no
// llms-full.txt. Não é um parser HTML completo — cobre só as tags que os
// posts do blog usam (p, h2, h3, ul, li, strong, em, br). Sem dependências
// novas, conforme pedido.

/**
 * Converte um trecho de HTML simples em texto plano legível, aproximando
 * headings de markdown ("## ") e listas de "- item".
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  if (!html) return '';

  let text = String(html);

  // Normaliza quebras de linha existentes no template literal.
  text = text.replace(/\r\n/g, '\n');

  // Headings viram linhas markdown.
  text = text.replace(/<h[12][^>]*>/gi, '\n\n## ');
  text = text.replace(/<h3[^>]*>/gi, '\n\n### ');
  text = text.replace(/<\/h[123]>/gi, '\n');

  // Parágrafos e quebras de linha.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Listas: cada <li> vira "- item".
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  // Ênfase: mantém o texto, remove a tag.
  text = text.replace(/<\/?(strong|b|em|i)[^>]*>/gi, '');

  // Remove qualquer outra tag remanescente.
  text = text.replace(/<[^>]+>/g, '');

  // Decodifica entidades HTML comuns.
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' '
  };
  text = text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (match) => entities[match]);

  // Colapsa espaços e linhas em branco excessivas.
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
