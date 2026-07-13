import { describe, expect, it } from 'vitest';
import { _buildScreenContextPrompt, _buildSystemPrompt, _parseScreenContext, _sanitizeAssistantCopy, _takeCompleteAssistantCopy } from '../src/routes/api/chat/assistant/+server.js';

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
    expect(prompt).toContain('grupos_de_categorias');
    expect(prompt).toContain('nunca diga que elas não existem');
    expect(prompt).toContain('nunca escreva os nomes dos campos');
    expect(prompt).not.toMatch(/lucro|margem|margens|vai acabar/i);
  });

  it('surfaces the latest day of active, non-muted signals for general awareness', () => {
    const prompt = _buildSystemPrompt({
      perfil: { nome_negocio: 'Teste' },
      vendas: { receita_total: '100.00', quantidade: 2, por_metodo_pagamento: {} },
      despesas: { total_mes_atual: '25.00', por_categoria: {} },
      resultado_operacional_aproximado: '75.00',
      fiado_em_aberto: [],
      catalogo_produtos: [],
      sinais_ativos: [{ severidade: 'Precisa de você', narrativa: 'X-Bacon zerou o estoque.' }],
    }, 'geral');

    expect(prompt).toContain('SINAIS DETECTADOS PELO ZELINHO GERENTE');
    expect(prompt).toContain('[Precisa de você] X-Bacon zerou o estoque.');
    expect(prompt).toContain('Não invente sinais além destes.');
  });

  it('omits the signals block entirely when there are no active signals', () => {
    const prompt = _buildSystemPrompt({
      perfil: { nome_negocio: 'Teste' },
      vendas: { receita_total: '0.00', quantidade: 0, por_metodo_pagamento: {} },
      despesas: { total_mes_atual: '0.00', por_categoria: {} },
      resultado_operacional_aproximado: '0.00',
      fiado_em_aberto: [],
      catalogo_produtos: [],
      sinais_ativos: [],
    }, 'geral');

    expect(prompt).not.toContain('SINAIS DETECTADOS PELO ZELINHO GERENTE');
  });

  it('surfaces yesterday vs. same-weekday-average precomputed figures so the model never claims the data is missing', () => {
    const prompt = _buildSystemPrompt({
      perfil: { nome_negocio: 'Teste' },
      vendas: { receita_total: '100.00', quantidade: 2, por_metodo_pagamento: {} },
      despesas: { total_mes_atual: '25.00', por_categoria: {} },
      resultado_operacional_aproximado: '75.00',
      fiado_em_aberto: [],
      catalogo_produtos: [],
      ontem: { data: '2026-07-08', receita: 100, quantidade: 1 },
      media_mesmo_dia_semana: { receita: 50, quantidade: 1, dias_considerados: 2 },
      media_diaria_periodo: { receita: 100, quantidade: 1, dias_considerados: 3 },
    }, 'vendas');

    expect(prompt).toContain('Vendas de ontem (quarta-feira, 2026-07-08): R$ 100.00 em 1 vendas');
    expect(prompt).toContain('Média das últimas 2 ocorrências de quarta-feira: R$ 50.00 em 1 vendas');
    expect(prompt).toContain('Média diária do período, excluindo ontem (3 dias): R$ 100.00 em 1 vendas');
    expect(prompt).toContain('nunca diga que falta esse dado');
  });

  it('falls back to the general daily average when there is no same-weekday history yet', () => {
    const prompt = _buildSystemPrompt({
      perfil: { nome_negocio: 'Teste' },
      vendas: { receita_total: '0.00', quantidade: 0, por_metodo_pagamento: {} },
      despesas: { total_mes_atual: '0.00', por_categoria: {} },
      resultado_operacional_aproximado: '0.00',
      fiado_em_aberto: [],
      catalogo_produtos: [],
      ontem: { data: '2026-07-08', receita: 0, quantidade: 0 },
      media_mesmo_dia_semana: null,
      media_diaria_periodo: null,
    }, 'geral');

    expect(prompt).toContain('Ainda não há ocorrências anteriores de quarta-feira suficientes no período para uma média por dia da semana');
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

  it('accepts only supported, minimally scoped screen contexts', () => {
    expect(_parseScreenContext({
      source: 'gestao-produtos',
      entity: { type: 'product', id: 'product-1' },
    })).toEqual({ kind: 'product', id: 'product-1' });
    expect(_parseScreenContext({
      source: 'gerente-semana',
      entity: { type: 'weekly_report', id: '2026-07-06' },
    })).toEqual({ kind: 'week', weekStart: '2026-07-06' });
    expect(_parseScreenContext({
      source: 'untrusted',
      entity: { type: 'product', id: 'product-1' },
    })).toBeNull();
  });

  it('adds owner-loaded screen facts to the system prompt', () => {
    const prompt = _buildScreenContextPrompt({
      kind: 'product',
      product: { id: 'product-1', nome: 'Coxinha', preco: 8 },
    });

    expect(prompt).toContain('CONTEXTO DO PRODUTO SELECIONADO');
    expect(prompt).toContain('Coxinha');
  });
});
