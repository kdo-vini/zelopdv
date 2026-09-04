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
    expect(hDeb).toMatch(/Cartão de débito/i);
    expect(hCred).toMatch(/Cartão de crédito/i);
  });

  it('labels Vale-refeição with the customer-facing name', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: { idVenda: 4, formaPagamento: 'vale_refeicao', total: 10, itens: [] }
    });

    expect(html).toContain('Vale-Refeição');
    expect(html).not.toContain('vale_refeicao');
  });

  it('renders the payment method when the persisted sale uses snake_case', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: { idVenda: 11, forma_pagamento: 'vale_refeicao', total: 10, itens: [] }
    });

    expect(html).toContain('Vale-Refeição');
    expect(html).not.toContain('vale_refeicao');
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
    expect(html).toMatch(/TOTAL<\/span><span>R\$\s*16/);
  });

  it('renders the granted discount before the final total', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: { subtotal: 100, desconto: 10, total: 90, itens: [] },
    });

    expect(html).toContain('Desconto');
    expect(html).toMatch(/Desconto<\/span><span class="val">−\s*R\$/);
  });

  it('renders the complete ZeloMenu assembly in separate detail blocks', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: {
        idVenda: 10,
        formaPagamento: 'pix',
        total: 8,
        itens: [{
          nome: 'Guarana da Amazonia',
          quantidade: 1,
          preco_unitario: 8,
          modifierGroups: [
            { groupName: 'Tamanho', optionNames: ['Guarana 300ml'] },
            { groupName: 'Abacate', optionNames: ['Com abacate'] },
          ],
        }],
      },
    });

    expect(html).toContain('Tamanho: Guarana 300ml');
    expect(html).toContain('Abacate: Com abacate');
    expect(html.match(/class="item-detail"/g)).toHaveLength(2);
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

  it('uses high-contrast thermal print styles for browser fallback', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja', largura_bobina: '58mm' },
      venda: {
        idVenda: 10,
        formaPagamento: 'multiplo',
        total: 25,
        itens: [],
        pagamentos: [{ forma: 'fiado', valor: 25, pessoaNome: 'Cliente Teste' }]
      }
    });

    expect(html).toContain('@page { size: 58mm auto; margin: 0; }');
    expect(html).toContain('color: #000 !important');
    expect(html).toContain('font-weight: 900');
    expect(html).not.toContain('color:#888');
  });

  it('prints explicit couvert and service fee for a mesa without calling either delivery', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: {
        numeroVenda: 24,
        tipoPedido: 'mesa',
        mesaNumero: 6,
        formaPagamento: null,
        subtotal: 100,
        couvert: 10,
        taxaServicoPct: 10,
        taxaServico: 11,
        total: 121,
        // A mesa must never render this legacy delivery field.
        taxaEntrega: 99,
        itens: [],
      },
      opcoes: { titulo: 'PRÉ-CONTA — MESA 6', naoFiscal: true },
    });

    expect(html).toContain('PRÉ-CONTA — MESA 6');
    expect(html).toContain('Couvert');
    expect(html).toContain('Taxa de serviço (10%)');
    expect(html).toContain('R$ 10,00');
    expect(html).toContain('R$ 11,00');
    expect(html).not.toContain('Taxa de entrega');
  });

  it('prints the final mesa receipt with persisted service-fee fields', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: {
        numeroVenda: 25,
        tipoPedido: 'mesa',
        mesaNumero: 6,
        formaPagamento: 'pix',
        subtotal: 50,
        couvert: 5,
        desconto: 2,
        taxa_pct: 10,
        taxa_valor: 5.3,
        total: 58.3,
        itens: [],
      },
      opcoes: { titulo: 'RECIBO — MESA 6' },
    });

    expect(html).toContain('RECIBO — MESA 6');
    expect(html).toContain('Couvert');
    expect(html).toContain('Taxa de serviço (10%)');
    expect(html).toContain('TOTAL</span><span>R$ 58,30');
    expect(html).not.toContain('Taxa de entrega');
  });

  it('keeps delivery tax as delivery tax', () => {
    const html = buildReceiptHTML({
      estabelecimento: { nome_exibicao: 'Loja' },
      venda: {
        numeroVenda: 26,
        tipoPedido: 'delivery',
        formaPagamento: 'pix',
        subtotal: 40,
        taxaEntrega: 8,
        total: 48,
        itens: [],
      },
    });

    expect(html).toContain('Taxa de entrega');
    expect(html).not.toContain('Couvert');
    expect(html).not.toContain('Taxa de serviço');
  });
});
