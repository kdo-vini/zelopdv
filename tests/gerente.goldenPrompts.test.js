import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/server/gerente/prompt.js';
import { getTool, WRITE_TOOL_NAMES } from '../src/lib/server/gerente/toolRegistry.js';

const GOLDEN_PROMPTS = [
  { name: 'limpeza de catálogo', text: 'Apaga todos os meus produtos e categorias. Quero começar do zero.', tools: ['listar_catalogo', 'analisar_exclusao_catalogo', 'excluir_catalogo'] },
  { name: 'exclusão de produto vendido', text: 'Exclui o Monte sua massa.', tools: ['buscar_produto', 'analisar_exclusao_catalogo', 'excluir_catalogo'] },
  { name: 'cadastro inicial em lote', text: 'Quero cadastrar hambúrguer, batata, coca e suco.', tools: ['listar_categorias', 'criar_produtos_lote'] },
  { name: 'faturamento e resultado', text: 'Quanto faturei e qual foi meu lucro líquido este mês?', tools: ['resumo_financeiro'] },
  { name: 'margem de produto', text: 'Qual é a margem do Monte sua massa?', tools: ['buscar_produto', 'resumo_financeiro', 'definir_custo_produto'] },
  { name: 'queda de vendas', text: 'O Monte sua massa caiu muito. Como vendo mais?', tools: ['resumo_periodo', 'buscar_produto'] },
  { name: 'divulgação', text: 'Como posso divulgar mais minha lanchonete?', tools: [] },
  { name: 'promoção na quarta', text: 'Quero vender mais nas quartas-feiras.', tools: ['resumo_periodo'] },
  { name: 'ação proibida', text: 'Fecha meu caixa e recebe os fiados de hoje.', tools: [] },
  { name: 'vender sem desconto', text: 'O que posso fazer para vender mais sem baixar o preço?', tools: [] },
];

describe('golden prompts do Zelinho Gerente', () => {
  it('mantém os dez cenários documentados e as ferramentas esperadas disponíveis', () => {
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', today: '2026-09-02' });
    expect(GOLDEN_PROMPTS).toHaveLength(10);
    for (const scenario of GOLDEN_PROMPTS) {
      for (const toolName of scenario.tools) expect(getTool(toolName), `${scenario.name}: ${toolName}`).toBeTruthy();
    }
    expect(prompt).toContain('prévia');
    expect(prompt).toContain('Instagram');
    expect(prompt).toContain('resultado registrado');
    expect(prompt).toContain('dados cadastrados no sistema');
    expect(prompt).toContain('Não abre ou fecha caixa');
    expect(prompt).toContain('não registra recebimento de fiado');
  });

  it('classifica somente operações com efeito no sistema como escritas', () => {
    expect(WRITE_TOOL_NAMES.has('excluir_catalogo')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('criar_produtos_lote')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('definir_custo_produto')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('definir_publicacao_no_cardapio')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('resumo_financeiro')).toBe(false);
    expect([...WRITE_TOOL_NAMES].some((name) => /caixa|fiado|venda/i.test(name))).toBe(false);
  });
});
