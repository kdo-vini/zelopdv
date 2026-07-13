import { describe, expect, it } from 'vitest';
import { _buildSystemPrompt, _sanitizeAssistantCopy, _takeCompleteAssistantCopy } from '../src/routes/api/chat/assistant/+server.js';

describe('assistant prompt', () => {
  it('uses the gerente financial wording without prohibited terms', () => {
    const prompt = _buildSystemPrompt({
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
    expect(prompt).toContain('categorias.nome');
    expect(prompt).toContain('media_unidades_por_venda');
    expect(prompt).not.toMatch(/lucro|margem|margens|vai acabar/i);
  });

  it('normalizes prohibited terms before a model response reaches the client', () => {
    expect(_sanitizeAssistantCopy('O lucro caiu e a margem apertou; o estoque vai acabar amanhã.'))
      .toBe('O resultado operacional aproximado caiu e a diferença entre preço e custo apertou; o estoque tem cobertura ao ritmo médio.');
  });

  it('emits complete sanitized sentences without waiting for the entire response', () => {
    const first = _takeCompleteAssistantCopy('O lucro caiu. Revise os custos');

    expect(first).toEqual({
      content: 'O resultado operacional aproximado caiu.',
      pending: ' Revise os custos',
    });
  });

  it('does not split a Brazilian currency value at its thousands separator', () => {
    const partial = _takeCompleteAssistantCopy('A receita foi R$ 1.234,56');
    const complete = _takeCompleteAssistantCopy('A receita foi R$ 1.234,56. Revise o caixa');

    expect(partial).toEqual({ content: '', pending: 'A receita foi R$ 1.234,56' });
    expect(complete).toEqual({
      content: 'A receita foi R$ 1.234,56.',
      pending: ' Revise o caixa',
    });
  });
});
