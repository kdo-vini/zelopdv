import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isFirstUseNoCaixa,
  shouldAutoOpenCaixaModal,
  shouldBlockAddToCart,
  shouldPromptCaixaBeforePayment
} from '../src/lib/pdv/firstUseCaixaGate.js';

describe('isFirstUseNoCaixa — deteccao de "conta nova sem caixa aberto"', () => {
  it('conta nova (titular que nunca abriu caixa, caixa fechado) e reconhecida', () => {
    expect(isFirstUseNoCaixa({ hasEverOpenedCaixa: false, isSubUser: false, caixaAberto: false })).toBe(true);
  });

  it('assim que o caixa abre, o estado vira false sozinho (sem flag persistida)', () => {
    expect(isFirstUseNoCaixa({ hasEverOpenedCaixa: false, isSubUser: false, caixaAberto: true })).toBe(false);
  });

  it('conta antiga (ja abriu caixa alguma vez) nunca entra no primeiro uso', () => {
    expect(isFirstUseNoCaixa({ hasEverOpenedCaixa: true, isSubUser: false, caixaAberto: false })).toBe(false);
  });

  it('subusuario nunca entra no primeiro uso, mesmo que o titular nunca tenha aberto caixa', () => {
    expect(isFirstUseNoCaixa({ hasEverOpenedCaixa: false, isSubUser: true, caixaAberto: false })).toBe(false);
  });

  it('informacao desconhecida (falha na consulta ou offline) mantem o comportamento atual', () => {
    expect(isFirstUseNoCaixa({ hasEverOpenedCaixa: null, isSubUser: false, caixaAberto: false })).toBe(false);
  });
});

describe('shouldAutoOpenCaixaModal — "deve abrir o caixa sozinho ao carregar?"', () => {
  it('conta nova em primeiro uso: nao abre sozinho (barreira adiada para o pagamento)', () => {
    expect(shouldAutoOpenCaixaModal({ caixaAberto: false, isFirstUseNoCaixa: true })).toBe(false);
  });

  it('qualquer outra conta com caixa fechado: abre sozinho, como hoje', () => {
    expect(shouldAutoOpenCaixaModal({ caixaAberto: false, isFirstUseNoCaixa: false })).toBe(true);
  });

  it('caixa ja aberto: nunca abre o modal, independente do estado de primeiro uso', () => {
    expect(shouldAutoOpenCaixaModal({ caixaAberto: true, isFirstUseNoCaixa: false })).toBe(false);
    expect(shouldAutoOpenCaixaModal({ caixaAberto: true, isFirstUseNoCaixa: true })).toBe(false);
  });
});

describe('shouldBlockAddToCart — "deve barrar o clique num produto/item avulso?"', () => {
  it('conta nova em primeiro uso: nao barra, o item entra na comanda normalmente', () => {
    expect(shouldBlockAddToCart({ caixaAberto: false, isFirstUseNoCaixa: true })).toBe(false);
  });

  it('qualquer outra conta com caixa fechado: barra, como hoje', () => {
    expect(shouldBlockAddToCart({ caixaAberto: false, isFirstUseNoCaixa: false })).toBe(true);
  });

  it('caixa aberto: nunca barra', () => {
    expect(shouldBlockAddToCart({ caixaAberto: true, isFirstUseNoCaixa: false })).toBe(false);
  });
});

describe('shouldPromptCaixaBeforePayment — "deve barrar a ida para o pagamento?"', () => {
  it('caixa fechado: barra (e onde a barreira contextual aparece para conta nova)', () => {
    expect(shouldPromptCaixaBeforePayment({ caixaAberto: false })).toBe(true);
  });

  it('caixa aberto: nunca barra', () => {
    expect(shouldPromptCaixaBeforePayment({ caixaAberto: true })).toBe(false);
  });
});

describe('combinacoes de persona (conta nova owner, conta antiga, subusuario, desconhecido/offline)', () => {
  const personas = [
    { nome: 'conta nova owner', hasEverOpenedCaixa: false, isSubUser: false, esperaPrimeiroUso: true },
    { nome: 'conta antiga', hasEverOpenedCaixa: true, isSubUser: false, esperaPrimeiroUso: false },
    { nome: 'subusuario', hasEverOpenedCaixa: false, isSubUser: true, esperaPrimeiroUso: false },
    { nome: 'informacao desconhecida/offline', hasEverOpenedCaixa: null, isSubUser: false, esperaPrimeiroUso: false }
  ];

  for (const persona of personas) {
    it(`${persona.nome}: com caixa fechado, load/add/pagamento decidem de acordo com o primeiro uso`, () => {
      const caixaAberto = false;
      const primeiroUso = isFirstUseNoCaixa({ hasEverOpenedCaixa: persona.hasEverOpenedCaixa, isSubUser: persona.isSubUser, caixaAberto });
      expect(primeiroUso).toBe(persona.esperaPrimeiroUso);

      const abreSozinho = shouldAutoOpenCaixaModal({ caixaAberto, isFirstUseNoCaixa: primeiroUso });
      const barraAoAdicionar = shouldBlockAddToCart({ caixaAberto, isFirstUseNoCaixa: primeiroUso });
      // A barreira do pagamento nao depende do primeiro uso: existe para
      // qualquer conta, mas so e alcancada quando o load/add nao ja barraram antes.
      const barraAoPagar = shouldPromptCaixaBeforePayment({ caixaAberto });

      if (persona.esperaPrimeiroUso) {
        expect(abreSozinho).toBe(false);
        expect(barraAoAdicionar).toBe(false);
        expect(barraAoPagar).toBe(true);
      } else {
        expect(abreSozinho).toBe(true);
        expect(barraAoAdicionar).toBe(true);
        expect(barraAoPagar).toBe(true);
      }
    });
  }
});

describe('copy exata do estado vazio "faca sua primeira venda" (VirtualProductGrid.svelte)', () => {
  const source = readFileSync('src/lib/components/VirtualProductGrid.svelte', 'utf8');

  it('mostra titulo, texto, CTAs e rodape exatos quando nao ha nenhum produto cadastrado', () => {
    expect(source).toContain("hasAnyProducts ? 'Nenhum produto encontrado' : 'Faça sua primeira venda'");
    expect(source).toContain('Cadastre seu primeiro produto para começar. É rápido: nome e preço.');
    // O "+" antes de "Cadastrar primeiro produto" e "Ou venda avulsa" virou um
    // ícone lucide Plus ao lado do texto (ver especificação de design do
    // estado vazio) — o texto em si continua exatamente o mesmo.
    // PR #39: hierarquia invertida para reforçar o caminho canônico (produto primeiro).
    expect(source).toContain('Cadastrar primeiro produto');
    expect(source).toContain("hasAnyProducts ? 'Testar com item avulso' : 'Ou venda avulsa'");
    expect(source).toContain('Seus produtos aparecerão aqui.');
  });

  it('o CTA de cadastro dispara um evento (cadastrarProdutoClick), nunca navega para /gestao/produtos', () => {
    expect(source).toContain('handleCadastrarProdutoClick');
    expect(source).toMatch(/function handleCadastrarProdutoClick\(\) \{\s*dispatch\('cadastrarProdutoClick'\);/);
    expect(source).not.toContain('/gestao/produtos');
  });

  it('o CTA de cadastro so aparece quando faltam produtos e a conta pode gerenciar produtos', () => {
    expect(source).toContain("{#if !hasAnyProducts && canCadastrarProduto}");
  });

  it('o estado de busca/filtro sem resultado (hasAnyProducts true) continua com a copy antiga', () => {
    expect(source).toContain('Tente limpar a busca ou escolher outra categoria. Se quiser vender mesmo assim, use um item avulso.');
  });
});
