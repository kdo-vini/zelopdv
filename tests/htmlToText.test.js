import { describe, expect, it } from 'vitest';
import { htmlToText } from '../src/lib/seo/htmlToText.js';

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
  });

  it('converts headings to markdown-ish lines', () => {
    const out = htmlToText('<h2>Título</h2><p>Corpo</p>');
    expect(out).toContain('## Título');
    expect(out).toContain('Corpo');
  });

  it('converts lists to "- item" lines', () => {
    const out = htmlToText('<ul><li>Um</li><li>Dois</li></ul>');
    expect(out).toContain('- Um');
    expect(out).toContain('- Dois');
  });

  it('strips strong/em tags but keeps their text', () => {
    const out = htmlToText('<p>Isso é <strong>importante</strong> e <em>claro</em>.</p>');
    expect(out).toBe('Isso é importante e claro.');
  });

  it('decodes common HTML entities', () => {
    const out = htmlToText('<p>Pix &amp; dinheiro &lt;na hora&gt;</p>');
    expect(out).toBe('Pix & dinheiro <na hora>');
  });

  it('collapses excessive blank lines', () => {
    const out = htmlToText('<p>A</p>\n\n\n\n<p>B</p>');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('flattens simple tables and keeps link URLs', () => {
    const out = htmlToText(`
      <table>
        <tr><th>Item</th><th>Valor</th></tr>
        <tr><td>Pedido</td><td>R$ 50,00</td></tr>
      </table>
      <p>Fonte: <a href="https://blog-parceiros.ifood.com.br/taxas-ifood/">Blog do iFood</a></p>
    `);
    expect(out).toContain('Item | Valor');
    expect(out).toContain('Pedido | R$ 50,00');
    expect(out).toContain('Blog do iFood (https://blog-parceiros.ifood.com.br/taxas-ifood/)');
  });
});
