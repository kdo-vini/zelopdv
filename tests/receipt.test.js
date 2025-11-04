import { describe, it, expect } from 'vitest';
import { buildReceiptHTML } from '../src/lib/receipt.js';

describe('receipt builder', () => {
  it('omits meta when optional fields are missing', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Minha Loja', largura_bobina: '80mm' },
      venda: { idVenda: 1, formaPagamento: 'dinheiro', total: 10, itens: [] }
    });
    expect(html).toContain('Minha Loja');
    // should not render meta div since no meta fields
    expect(html).not.toContain('<div class="meta">');
  });

  it('includes only provided meta fields', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja', endereco: 'Rua A, 123', documento: '12.345.678/0001-90' },
      venda: { idVenda: 5, formaPagamento: 'pix', total: 20, itens: [] }
    });
    expect(html).toContain('Rua A, 123');
    expect(html).toContain('CNPJ/CPF: 12.345.678/0001-90');
    // Not provided
    expect(html).not.toContain('telefone');
  });

  it('includes logo when provided', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja', logoUrl: 'https://example.com/logo.png' },
      venda: { idVenda: 7, formaPagamento: 'cartao', total: 30, itens: [] }
    });
    expect(html).toContain('img class="logo"');
    expect(html).toContain('https://example.com/logo.png');
  });

  it('labels debit and credit card forms distinctly', () => {
    const hDeb = buildReceiptHTML({ estabelecimento: { nome_exibicao: 'Loja' }, venda: { idVenda: 2, formaPagamento: 'cartao_debito', total: 10, itens: [] } });
    const hCred = buildReceiptHTML({ estabelecimento: { nome_exibicao: 'Loja' }, venda: { idVenda: 3, formaPagamento: 'cartao_credito', total: 10, itens: [] } });
    expect(hDeb).toMatch(/Cartão \(débito\)/i);
    expect(hCred).toMatch(/Cartão \(crédito\)/i);
  });

  it('renders items with correct totals', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: { idVenda: 9, formaPagamento: 'dinheiro', total: 16.5, itens: [
        { nome_produto_na_venda: 'Café', quantidade: 2, preco_unitario_na_venda: 5 },
        { nome_produto_na_venda: 'Pão de queijo', quantidade: 1, preco_unitario_na_venda: 6.5 }
      ] }
    });
    expect(html).toContain('Café');
    expect(html).toContain('Pão de queijo');
    // Subtotals R$ 10,00 and R$ 6,50, and total R$ 16,50
    expect(html).toMatch(/R\$\s*10/);
    expect(html).toMatch(/R\$\s*6/);
    expect(html).toMatch(/Total<\/span><strong>R\$\s*16/);
  });

  // debug overlay removed per request; ensure no DEBUG text leaks
  it('does not include debug overlay even if options.debug is passed', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: { idVenda: 1, formaPagamento: 'pix', total: 0, itens: [] },
      options: { debug: true }
    });
    expect(html).not.toContain('DEBUG:');
    expect(html).not.toContain('<pre');
  });
});
