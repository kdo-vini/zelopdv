import { describe, it, expect } from 'vitest';
import {
  buildVendaEscPos,
  buildMovCaixaEscPos,
  buildPagamentoFiadoEscPos,
  buildTesteEscPos,
  _internal,
} from '../src/lib/escpos.js';

/**
 * Decodifica bytes ESC/POS como Latin-1 para inspecionar texto ASCII.
 * Comandos ESC/POS aparecem como bytes < 0x20 e são ignorados em buscas textuais.
 */
function bytesToText(bytes) {
  return Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
}

describe('escpos builder', () => {
  describe('_internal.fmtBRL', () => {
    it('substitui espaço não-separável do Intl por espaço normal', () => {
      const out = _internal.fmtBRL(10);
      expect(out).not.toContain(' ');
      expect(out).toMatch(/R\$\s10,00$/);
    });

    it('formata valores fracionários corretamente', () => {
      expect(_internal.fmtBRL(0)).toMatch(/R\$\s0,00/);
      expect(_internal.fmtBRL(1234.5)).toMatch(/R\$\s1\.234,50/);
    });
  });

  describe('buildVendaEscPos', () => {
    const baseEst = { nome_exibicao: 'Loja Teste', largura_bobina: '80mm' };
    const baseVenda = {
      numeroVenda: 42,
      formaPagamento: 'dinheiro',
      total: 10,
      valorRecebido: 20,
      troco: 10,
      itens: [{ nome: 'Café', quantidade: 1, preco_unitario: 10 }],
    };

    it('produz Uint8Array com header e item', () => {
      const out = buildVendaEscPos({ estabelecimento: baseEst, venda: baseVenda });
      expect(out).toBeInstanceOf(Uint8Array);
      const text = bytesToText(out);
      expect(text).toContain('LOJA TESTE');
      // "Café" — em CP850 'é' vira 0x82, então só checamos prefixo ASCII.
      expect(text).toContain('Caf');
      expect(text).toContain('#42');
    });

    it('não emite "?" no lugar do espaço de R$', () => {
      const out = buildVendaEscPos({ estabelecimento: baseEst, venda: baseVenda });
      const text = bytesToText(out);
      // R$ deve vir seguido de espaço, nunca de ?
      expect(text).not.toMatch(/R\$\?/);
      expect(text).toMatch(/R\$ 10,00/);
    });

    it('quebra nome longo em múltiplas linhas no header (double-width)', () => {
      const longName = 'Casa dos Salgados Especiais';
      const out = buildVendaEscPos({
        estabelecimento: { ...baseEst, nome_exibicao: longName },
        venda: baseVenda,
      });
      const text = bytesToText(out);
      // O nome inteiro nunca aparece em uma única linha física porque foi quebrado.
      expect(text).toContain('CASA DOS');
      expect(text).toContain('SALGADOS');
    });

    it('quebra endereço longo dentro da largura', () => {
      const endereco = 'Rua Sebastião Pereira da Silva Sauro, 12345, Bairro Centro';
      const out = buildVendaEscPos({
        estabelecimento: { ...baseEst, endereco },
        venda: baseVenda,
      });
      const text = bytesToText(out);
      // Não deve aparecer a string inteira em uma única linha (que excederia 32 chars).
      const lines = text.split('\n').map((l) => l.replace(/[^\x20-\x7e]/g, ''));
      const hasOverlong = lines.some((l) => l.includes(endereco));
      expect(hasOverlong).toBe(false);
    });

    it('renderiza observação por item indentada', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          itens: [{ nome: 'X-Burger', quantidade: 1, preco_unitario: 25, observacao: 'sem cebola, ponto da carne ao ponto' }],
        },
      });
      const text = bytesToText(out);
      expect(text).toContain('X-Burger');
      expect(text).toContain('sem cebola');
    });

    it('renderiza a montagem completa do ZeloMenu em linhas separadas', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          itens: [{
            nome: 'Guarana da Amazonia',
            quantidade: 1,
            preco_unitario: 8,
            modifiers: [
              { groupName: 'Tamanho', selectedOptions: [{ optionName: 'Guarana 300ml' }] },
              { groupName: 'Abacate', selectedOptions: [{ optionName: 'Com abacate' }] },
              { groupName: 'Coberturas ou confeitos incluidos (ate 2)', selectedOptions: [
                { optionName: 'Amendoim' },
                { optionName: 'Amendoim' },
              ] },
            ],
          }],
        },
      });
      const text = bytesToText(out);

      expect(text).toContain('1x Guarana da');
      expect(text).toContain('Amazonia');
      expect(text).toContain('  Tamanho: Guarana 300ml');
      expect(text).toContain('  Abacate: Com abacate');
      expect(text).toContain('  Coberturas ou');
      expect(text).toContain('Amendoim,');
      expect(text.match(/Amendoim/g)).toHaveLength(2);
      expect(text.indexOf('1x Guarana da')).toBeLessThan(text.indexOf('  Tamanho: Guarana 300ml'));
      expect(text.indexOf('  Tamanho: Guarana 300ml')).toBeLessThan(text.indexOf('  Abacate: Com abacate'));
    });

    it('mostra preço unitário quando qtd > 1', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          itens: [{ nome: 'Coca', quantidade: 3, preco_unitario: 5 }],
        },
      });
      const text = bytesToText(out);
      expect(text).toMatch(/R\$ 5,00 cada/);
    });

    it('renderiza pagamento múltiplo com cada forma listada', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          formaPagamento: 'multiplo',
          pagamentos: [
            { forma: 'dinheiro', valor: 5 },
            { forma: 'pix', valor: 5 },
          ],
        },
      });
      const text = bytesToText(out);
      expect(text).toContain('Pagamento (multiplo)');
      expect(text).toContain('Dinheiro');
      expect(text).toContain('Pix');
    });

    it('imprime Vale Refeicao sem acentos no cupom térmico', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: { ...baseVenda, formaPagamento: 'vale_refeicao' },
      });

      expect(bytesToText(out)).toContain('Vale-refeicao');
    });

    it('imprime o método da venda persistida quando a forma usa snake_case', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: { ...baseVenda, formaPagamento: undefined, forma_pagamento: 'vale_refeicao' },
      });

      expect(bytesToText(out)).toContain('Vale-refeicao');
    });

    it('honra opcoes.titulo (ex: PRÉ-CONTA / RECIBO MESA)', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: { ...baseVenda, formaPagamento: null, mesaNumero: 4 },
        opcoes: { titulo: 'PRE-CONTA - MESA 4', naoFiscal: true },
      });
      const text = bytesToText(out);
      expect(text).toContain('PRE-CONTA');
      expect(text).toContain('MESA 4');
    });

    it('mostra "2a VIA / COPIA" quando opcoes.copia=true', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: baseVenda,
        opcoes: { copia: true },
      });
      const text = bytesToText(out);
      expect(text).toContain('2a VIA');
    });

    it('usa cols=28 para 58mm', () => {
      const out = buildVendaEscPos({
        estabelecimento: { ...baseEst, largura_bobina: '58mm' },
        venda: baseVenda,
      });
      const text = bytesToText(out);
      // Separadores devem ter exatamente 28 dashes em uma linha.
      expect(text).toMatch(/-{28}/);
      expect(text).not.toMatch(/-{32}/);
    });

    it('imprime couvert e taxa de serviço explícitos na pré-conta de mesa', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          tipoPedido: 'mesa',
          mesaNumero: 6,
          formaPagamento: null,
          subtotal: 100,
          couvert: 10,
          taxa_pct: 10,
          taxa_valor: 11,
          total: 121,
          taxaEntrega: 99,
        },
        opcoes: { titulo: 'PRE-CONTA - MESA 6', naoFiscal: true },
      });
      const text = bytesToText(out);

      expect(text).toContain('PRE-CONTA');
      expect(text).toContain('MESA 6');
      expect(text).toContain('Couvert');
      expect(text).toContain('Taxa servico (10%)');
      expect(text).toMatch(/Couvert\s+\+ R\$ 10,00/);
      expect(text).toMatch(/Taxa servico \(10%\)\s+\+ R\$ 11,00/);
      expect(text).not.toContain('Taxa entrega');
    });

    it('imprime o recibo final de mesa com couvert e taxa de serviço', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          numeroVenda: 25,
          tipoPedido: 'mesa',
          mesaNumero: 6,
          subtotal: 50,
          couvert: 5,
          taxaServicoPct: 10,
          taxaServico: 5.3,
          desconto: 2,
          total: 58.3,
          formaPagamento: 'pix',
        },
        opcoes: { titulo: 'RECIBO - MESA 6' },
      });
      const text = bytesToText(out);

      expect(text).toContain('RECIBO');
      expect(text).toContain('Couvert');
      expect(text).toContain('Taxa servico (10%)');
      expect(text).toMatch(/TOTAL\s+R\$ 58,30/);
      expect(text).not.toContain('Taxa entrega');
    });

    it('preserva taxa de entrega em delivery', () => {
      const out = buildVendaEscPos({
        estabelecimento: baseEst,
        venda: {
          ...baseVenda,
          tipoPedido: 'delivery',
          subtotal: 40,
          taxaEntrega: 8,
          total: 48,
        },
      });
      const text = bytesToText(out);

      expect(text).toContain('Taxa entrega');
      expect(text).toMatch(/Taxa entrega\s+\+ R\$ 8,00/);
      expect(text).not.toContain('Couvert');
      expect(text).not.toContain('Taxa servico');
    });
  });

  describe('buildMovCaixaEscPos', () => {
    it('renderiza sangria (saida)', () => {
      const out = buildMovCaixaEscPos({
        estabelecimento: { nome_exibicao: 'Loja' },
        mov: { idMov: 1, idCaixa: 7, tipo: 'saida', valor: 50, motivo: 'Troco' },
      });
      const text = bytesToText(out);
      expect(text).toContain('SANGRIA DE CAIXA');
      expect(text).toContain('Valor retirado');
      expect(text).toMatch(/R\$ 50,00/);
    });

    it('renderiza suprimento (entrada)', () => {
      const out = buildMovCaixaEscPos({
        estabelecimento: { nome_exibicao: 'Loja' },
        mov: { idMov: 2, idCaixa: 7, tipo: 'entrada', valor: 100 },
      });
      const text = bytesToText(out);
      expect(text).toContain('SUPRIMENTO DE CAIXA');
      expect(text).toContain('Valor adicionado');
    });
  });

  describe('buildPagamentoFiadoEscPos', () => {
    it('renderiza recibo com cliente e valores', () => {
      const out = buildPagamentoFiadoEscPos({
        estabelecimento: { nome_exibicao: 'Loja' },
        pagamento: { nomePessoa: 'João Silva', valor: 25, saldoAnterior: 100, saldoAtual: 75 },
      });
      const text = bytesToText(out);
      expect(text).toContain('RECIBO DE PAGAMENTO');
      expect(text).toContain('Jo'); // "João" — "ã" vira byte > 0x7e em CP850, então só checamos prefix ASCII
      expect(text).toContain('Valor pago');
      expect(text).toMatch(/R\$ 25,00/);
      expect(text).toMatch(/R\$ 75,00/);
    });

    it('lida com nome de cliente muito longo sem cortar', () => {
      const nome = 'Cliente Com Nome Extremamente Longo Para Testar';
      const out = buildPagamentoFiadoEscPos({
        estabelecimento: { nome_exibicao: 'Loja' },
        pagamento: { nomePessoa: nome, valor: 10 },
      });
      const text = bytesToText(out);
      expect(text).toContain('Extremamente');
    });
  });

  describe('buildTesteEscPos', () => {
    it('produz cupom de teste', () => {
      const out = buildTesteEscPos({ nome_exibicao: 'Loja', largura_bobina: '80mm' });
      expect(out).toBeInstanceOf(Uint8Array);
      const text = bytesToText(out);
      expect(text).toContain('TESTE DE IMPRESSAO');
    });
  });
});
