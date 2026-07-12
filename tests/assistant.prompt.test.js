import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, sanitizeAssistantCopy, takeCompleteAssistantCopy } from '../src/routes/api/chat/assistant/+server.js';

describe('assistant prompt', () => {
  it('uses the gerente financial wording without prohibited terms', () => {
    const prompt = buildSystemPrompt({
      perfil: { nome_negocio: 'Teste' },
      vendas: { receita_total: '100.00', quantidade: 2, por_metodo_pagamento: {} },
      despesas: { total_mes_atual: '25.00', por_categoria: {} },
      resultado_operacional_aproximado: '75.00',
      top_produtos: [],
      fiado_em_aberto: [],
      catalogo_produtos: [],
    }, 'geral');

    expect(prompt).toContain('Resultado operacional aproximado');
    expect(prompt).toContain('não inclui o custo dos produtos');
    expect(prompt).not.toMatch(/lucro|margem|margens|vai acabar/i);
  });

  it('normalizes prohibited terms before a model response reaches the client', () => {
    expect(sanitizeAssistantCopy('O lucro caiu e a margem apertou; o estoque vai acabar amanhã.'))
      .toBe('O resultado operacional aproximado caiu e a diferença entre preço e custo apertou; o estoque tem cobertura ao ritmo médio.');
  });

  it('emits complete sanitized sentences without waiting for the entire response', () => {
    const first = takeCompleteAssistantCopy('O lucro caiu. Revise os custos');

    expect(first).toEqual({
      content: 'O resultado operacional aproximado caiu.',
      pending: ' Revise os custos',
    });
  });

  it('does not split a Brazilian currency value at its thousands separator', () => {
    const partial = takeCompleteAssistantCopy('A receita foi R$ 1.234,56');
    const complete = takeCompleteAssistantCopy('A receita foi R$ 1.234,56. Revise o caixa');

    expect(partial).toEqual({ content: '', pending: 'A receita foi R$ 1.234,56' });
    expect(complete).toEqual({
      content: 'A receita foi R$ 1.234,56.',
      pending: ' Revise o caixa',
    });
  });
});
