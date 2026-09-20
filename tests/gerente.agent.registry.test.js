import { describe, expect, it, vi } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { TOOLS, WRITE_TOOL_NAMES, executeTool, getOpenAiTools, getTool, summarizeAction } from '../src/lib/server/gerente/toolRegistry.js';
import { buildAgentSystemPrompt } from '../src/lib/server/gerente/prompt.js';

describe('tool registry', () => {
  it('expõe as ferramentas operacionais, financeiras e de crescimento', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      'alterar_despesa', 'alterar_preco', 'analisar_exclusao_catalogo', 'buscar_fiado', 'buscar_produto', 'criar_categoria', 'criar_despesa',
      'criar_produto', 'criar_produtos_lote', 'definir_custo_produto', 'definir_publicacao_no_cardapio', 'editar_produto', 'estoque_produto',
      'excluir_catalogo', 'excluir_despesa', 'listar_catalogo', 'listar_categorias', 'listar_despesas',
      'ocultar_no_pdv', 'pausar_no_cardapio', 'resumo_fiado', 'resumo_financeiro',
      'resumo_periodo', 'sinais_ativos',
    ]);
    expect([...WRITE_TOOL_NAMES].sort()).toEqual([
      'alterar_despesa', 'alterar_preco', 'criar_categoria', 'criar_despesa', 'criar_produto',
      'criar_produtos_lote', 'definir_custo_produto', 'definir_publicacao_no_cardapio', 'editar_produto', 'excluir_catalogo',
      'excluir_despesa', 'ocultar_no_pdv', 'pausar_no_cardapio',
    ]);
  });

  it('gera schemas OpenAI com parameters válidos e sem owner', () => {
    const tools = getOpenAiTools();
    expect(tools).toHaveLength(TOOLS.length);
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function.parameters.type).toBe('object');
      expect(JSON.stringify(tool)).not.toMatch(/owner/i);
    }
    const pausar = tools.find((t) => t.function.name === 'pausar_no_cardapio');
    expect(pausar.function.parameters.required).toEqual(['produto_id', 'nome_produto', 'pausado']);
  });

  it('executa ferramenta de leitura com o owner do contexto', async () => {
    const db = makeDb({ tables: { categorias: [{ data: [{ id: 1, nome: 'Bebidas', ordem: 1, controlar_estoque_compartilhado: false }], error: null }] } });
    const result = await executeTool({ db, ownerUserId: 'owner-1', now: new Date() }, 'listar_categorias', {});
    expect(result.ok).toBe(true);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id_usuario', value: 'owner-1' }]));
  });

  it('rejeita ferramenta desconhecida sem tocar o banco', async () => {
    const db = makeDb();
    const result = await executeTool({ db, ownerUserId: 'owner-1', now: new Date() }, 'apagar_tudo', {});
    expect(result).toEqual({ ok: false, error: 'Ferramenta desconhecida.' });
    expect(db.calls).toHaveLength(0);
  });

  it('resume ações de escrita em português', () => {
    expect(summarizeAction('pausar_no_cardapio', { nome_produto: 'Refri 2L', pausado: true })).toBe('Pausar "Refri 2L" no cardápio digital');
    expect(summarizeAction('pausar_no_cardapio', { nome_produto: 'Refri 2L', pausado: false })).toBe('Voltar "Refri 2L" para o cardápio digital');
    expect(summarizeAction('ocultar_no_pdv', { nome_produto: 'Refri 2L', ocultar: true })).toBe('Ocultar "Refri 2L" no PDV');
    expect(summarizeAction('criar_categoria', { nome: 'Sobremesas' })).toBe('Criar a categoria "Sobremesas"');
    expect(summarizeAction('criar_produto', { nome: 'Pudim', preco: 12, nome_categoria: 'Sobremesas' })).toBe('Cadastrar "Pudim" por R$ 12,00 em "Sobremesas"');
    expect(summarizeAction('alterar_preco', { nome_produto: 'Pudim', preco: 14 })).toBe('Alterar o preço de "Pudim" para R$ 14,00');
  });

  it('getTool devolve undefined para nome inválido', () => {
    expect(getTool('x')).toBeUndefined();
    expect(getTool('buscar_produto').write).toBe(false);
  });

  it('mantém ferramentas financeiras e de limpeza como owner-scoped', () => {
    expect(getTool('resumo_financeiro').write).toBe(false);
    expect(getTool('analisar_exclusao_catalogo').write).toBe(false);
    expect(getTool('excluir_catalogo').write).toBe(true);
    expect(getTool('definir_custo_produto').write).toBe(true);
  });

  it('descreve o efeito de cada ferramenta de escrita', async () => {
    const { summarizeEffect } = await import('../src/lib/server/gerente/toolRegistry.js');
    expect(summarizeEffect('pausar_no_cardapio', { pausado: true })).toBe('Para de aparecer para o cliente em todo o cardápio digital. Continua no PDV para venda no balcão.');
    expect(summarizeEffect('pausar_no_cardapio', { pausado: false })).toBe('Volta a aparecer para o cliente no cardápio digital.');
    expect(summarizeEffect('ocultar_no_pdv', { ocultar: true })).toBe('Sai da frente de caixa. O cardápio digital não muda.');
    expect(summarizeEffect('criar_categoria', {})).toBe('Aparece em Produtos e no cardápio quando tiver itens.');
    expect(summarizeEffect('criar_produto', {})).toBe('Entra no PDV na hora. No cardápio digital só quando você publicar.');
    expect(summarizeEffect('alterar_preco', {})).toBe('Vale para o PDV e para o cardápio digital a partir de agora.');
    expect(summarizeEffect('buscar_produto', {})).toBe('');
  });
});

describe('buildAgentSystemPrompt', () => {
  it('inclui nome da empresa, data, canal e regras de confirmação', () => {
    const prompt = buildAgentSystemPrompt({ perfil: { nome_exibicao: 'Lanchonete do Zé' }, channel: 'whatsapp', hints: ['Contexto extra.'], today: '2026-09-02' });
    expect(prompt).toContain('Lanchonete do Zé');
    expect(prompt).toContain('2026-09-02');
    expect(prompt).toContain('aguardando_confirmacao');
    expect(prompt).toContain('[[opcoes: Sim | Não]]');
    expect(prompt).toContain('buscar_produto');
    expect(prompt).toContain('sugestões de marketing');
    expect(prompt).toContain('resumo_financeiro');
    expect(prompt).toContain('analisar_exclusao_catalogo');
    expect(prompt).toContain('resultado registrado');
    expect(prompt).toContain('Contexto extra.');
    expect(prompt).toMatch(/WhatsApp/);
    expect(prompt).not.toMatch(/markdown/i);
  });

  it('no app permite markdown leve', () => {
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', today: '2026-09-02' });
    expect(prompt).toMatch(/markdown/i);
  });

  it('avisa para nunca inventar id nem usar 0', () => {
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', today: '2026-09-02' });
    expect(prompt).toContain('nunca use 0');
    expect(prompt).toContain('tudo é produto');
  });

  it('permite aconselhamento geral, mas preserva bloqueios operacionais', () => {
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', today: '2026-09-02' });
    expect(prompt).toContain('Instagram');
    expect(prompt).toContain('hipótese');
    expect(prompt).toContain('Não abre ou fecha caixa');
    expect(prompt).not.toContain('Não exclui produtos ou categorias');
    expect(prompt).not.toContain('Não fala de lucro ou margem');
  });
});
