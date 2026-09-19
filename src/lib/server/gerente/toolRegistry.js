/**
 * @file Catálogo único das ferramentas do Zelinho Gerente.
 * `write: true` nunca executa direto: vira ação pendente (ver agent.js).
 * Nenhum schema expõe owner/tenant; o servidor injeta via ctx.
 */
import { alterarPreco, buscarProduto, criarCategoria, criarProduto, criarProdutosLote, definirCustoProduto, definirPublicacaoProduto, editarProduto, estoqueProduto, excluirCatalogo, listarCatalogo, listarCategorias, ocultarNoPdv, pausarNoCardapio, prepararExclusaoCatalogo } from './tools/catalog.js';
import { alterarDespesa, buscarFiado, criarDespesa, excluirDespesa, EXPENSE_CATEGORIES, listarDespesas, resumoFiado } from './tools/finance.js';
import { resumoFinanceiro } from './tools/financialAnalysis.js';
import { resumoPeriodo, sinaisAtivos } from './tools/insights.js';

const brl = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const CATEGORIAS_DESPESA = EXPENSE_CATEGORIES.join(', ');

export const TOOLS = [
  {
    name: 'buscar_produto',
    write: false,
    description: 'Busca produtos do catálogo pelo nome (parcial, sem acento). Use SEMPRE antes de pausar, ocultar, editar, alterar preço ou definir custo, para obter produto_id e o nome exato.',
    parameters: { type: 'object', properties: { termo: { type: 'string', description: 'Parte do nome do produto' }, limite: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['termo'] },
    run: (ctx, args) => buscarProduto(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'listar_categorias',
    write: false,
    description: 'Lista as categorias do catálogo com id, nome e ordem. Use antes de criar produto.',
    parameters: { type: 'object', properties: {}, required: [] },
    run: (ctx) => listarCategorias(ctx.db, ctx.ownerUserId),
  },
  {
    name: 'listar_catalogo',
    write: false,
    description: 'Lista uma página do catálogo com categorias, preços, custos conhecidos, estoque e estado operacional. Aceita filtros por categoria, visibilidade no PDV e controle de estoque; use para preparar cadastro, edição ou limpeza em massa.',
    parameters: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 }, categoria_id: { type: 'integer' }, oculto_no_pdv: { type: 'boolean' }, controlar_estoque: { type: 'boolean' } }, required: [] },
    run: (ctx, args) => listarCatalogo(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'analisar_exclusao_catalogo',
    write: false,
    description: 'Prepara uma prévia segura de exclusão de produtos/categorias. Se o produto já apareceu em vendas, ele será arquivado para preservar o histórico.',
    parameters: { type: 'object', properties: { produto_ids: { type: 'array', items: { type: 'integer' } }, categoria_ids: { type: 'array', items: { type: 'integer' } }, todos: { type: 'boolean' } }, required: [] },
    run: (ctx, args) => prepararExclusaoCatalogo(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'estoque_produto',
    write: false,
    description: 'Consulta o estoque atual de um produto (e da categoria, se o estoque for compartilhado).',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' } }, required: ['produto_id'] },
    run: (ctx, args) => estoqueProduto(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'resumo_periodo',
    write: false,
    description: 'Resumo de vendas de um período: receita, quantidade, ticket médio, mix de pagamento e produtos mais vendidos. A resposta sempre traz "por_canal" (receita e quantidade por canal de origem: PDV, ZeloMenu, ZeloChat, Mesas, Manual, iFood) para comparar canais sem precisar de outra chamada. Use o parâmetro "canal" só quando o dono pedir o número de UM canal específico (ex.: "quanto veio do iFood?"); nesse caso a resposta toda (receita, quantidade, ticket médio) fica restrita àquele canal.',
    parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes'] }, canal: { type: 'string', enum: ['pdv', 'zelomenu', 'zelochat', 'mesa', 'manual', 'ifood'], description: 'Opcional. Restringe o resumo a um único canal de origem da venda.' } }, required: ['periodo'] },
    run: (ctx, args) => resumoPeriodo(ctx.db, ctx.ownerUserId, args, { now: ctx.now }),
  },
  {
    name: 'resumo_financeiro',
    write: false,
    description: 'Calcula faturamento, despesas registradas, taxas de plataforma, custos de produtos cadastrados, resultado registrado, lucro estimado e cobertura dos custos. Use para perguntas sobre lucro ou margem.',
    parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes'] }, produto_id: { type: 'integer' } }, required: ['periodo'] },
    run: (ctx, args) => resumoFinanceiro(ctx.db, ctx.ownerUserId, args, { now: ctx.now }),
  },
  {
    name: 'sinais_ativos',
    write: false,
    description: 'Avisos recentes do Zelinho Gerente sobre o negócio (vendas, estoque, caixa, fiado).',
    parameters: { type: 'object', properties: { dias: { type: 'integer', minimum: 1, maximum: 30 } }, required: [] },
    run: (ctx, args) => sinaisAtivos(ctx.db, ctx.ownerUserId, args, { now: ctx.now }),
  },
  {
    name: 'resumo_fiado',
    write: false,
    description: 'Resumo do fichário: total em aberto, quantos clientes devem e os maiores saldos. Use quando o dono perguntar sobre fiado, quem deve ou quanto está em aberto.',
    parameters: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 30 } }, required: [] },
    run: (ctx, args) => resumoFiado(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'buscar_fiado',
    write: false,
    description: 'Busca clientes no fichário pelo nome e devolve saldo de fiado. Use antes de falar do saldo de um cliente específico.',
    parameters: { type: 'object', properties: { termo: { type: 'string', description: 'Parte do nome do cliente' }, limite: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['termo'] },
    run: (ctx, args) => buscarFiado(ctx.db, ctx.ownerUserId, args),
  },
  {
    name: 'listar_despesas',
    write: false,
    description: `Lista despesas lançadas em um período com total e breakdown por categoria. Categorias válidas: ${CATEGORIAS_DESPESA}.`,
    parameters: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes'] },
        categoria: { type: 'string', description: `Opcional. Uma de: ${CATEGORIAS_DESPESA}` },
      },
      required: ['periodo'],
    },
    run: (ctx, args) => listarDespesas(ctx.db, ctx.ownerUserId, args, { now: ctx.now }),
  },
  {
    name: 'criar_despesa',
    write: true,
    description: `Lança uma despesa nova (descrição, valor, categoria e data opcional). Categorias: ${CATEGORIAS_DESPESA}. Exige confirmação do dono.`,
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        valor: { type: 'number', minimum: 0.01 },
        categoria: { type: 'string', description: `Uma de: ${CATEGORIAS_DESPESA}` },
        data: { type: 'string', description: 'AAAA-MM-DD; se omitir, usa hoje' },
      },
      required: ['descricao', 'valor'],
    },
    run: (ctx, args) => criarDespesa(ctx.db, ctx.ownerUserId, args, { actorUserId: ctx.actorUserId, now: ctx.now }),
    summary: (args) => `Lançar despesa "${String(args.descricao || '').trim()}" de ${brl(args.valor)}${args.categoria ? ` em ${args.categoria}` : ''}`,
    effect: () => 'Entra no relatório de despesas e no resultado operacional aproximado.',
  },
  {
    name: 'alterar_despesa',
    write: true,
    description: 'Altera uma despesa já lançada (descrição, valor, categoria e/ou data). Use listar_despesas antes para obter despesa_id. Exige confirmação do dono.',
    parameters: {
      type: 'object',
      properties: {
        despesa_id: { type: 'string', description: 'UUID devolvido por listar_despesas' },
        descricao: { type: 'string' },
        valor: { type: 'number', minimum: 0.01 },
        categoria: { type: 'string' },
        data: { type: 'string', description: 'AAAA-MM-DD' },
      },
      required: ['despesa_id'],
    },
    run: (ctx, args) => alterarDespesa(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Alterar despesa "${String(args.descricao || args.despesa_id || '').trim()}"${args.valor != null ? ` para ${brl(args.valor)}` : ''}`,
    effect: () => 'Atualiza o lançamento no módulo de despesas.',
  },
  {
    name: 'excluir_despesa',
    write: true,
    description: 'Exclui uma despesa já lançada. Use listar_despesas antes para obter despesa_id. Exige confirmação do dono.',
    parameters: {
      type: 'object',
      properties: {
        despesa_id: { type: 'string', description: 'UUID devolvido por listar_despesas' },
        descricao: { type: 'string', description: 'Descrição exibida no cartão de confirmação' },
      },
      required: ['despesa_id'],
    },
    run: (ctx, args) => excluirDespesa(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Excluir despesa "${String(args.descricao || args.despesa_id || '').trim()}"`,
    effect: () => 'Remove o lançamento do módulo de despesas e do resultado operacional aproximado.',
  },
  {
    name: 'pausar_no_cardapio',
    write: true,
    description: 'Pausa (ou despausa) um produto no cardápio digital ZeloMenu. Não afeta o PDV. Exige confirmação do dono.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string', description: 'Nome exato devolvido por buscar_produto' }, pausado: { type: 'boolean', description: 'true pausa, false despausa' } }, required: ['produto_id', 'nome_produto', 'pausado'] },
    run: (ctx, args) => pausarNoCardapio(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `${args.pausado ? 'Pausar' : 'Voltar'} "${args.nome_produto}" ${args.pausado ? 'no' : 'para o'} cardápio digital`,
    effect: (args) => args.pausado ? 'Para de aparecer para o cliente em todo o cardápio digital. Continua no PDV para venda no balcão.' : 'Volta a aparecer para o cliente no cardápio digital.',
  },
  {
    name: 'definir_publicacao_no_cardapio',
    write: true,
    description: 'Publica ou retira um produto do ZeloMenu. Publicar cria/reativa a publicação; retirar mantém o produto no catálogo do PDV. Exige confirmação do dono.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string' }, publicado: { type: 'boolean' } }, required: ['produto_id', 'nome_produto', 'publicado'] },
    run: (ctx, args) => definirPublicacaoProduto(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `${args.publicado ? 'Publicar' : 'Retirar'} "${args.nome_produto}" ${args.publicado ? 'no' : 'do'} ZeloMenu`,
    effect: (args) => args.publicado ? 'Passa a ficar disponível no cardápio digital, salvo se estiver pausado.' : 'Sai da venda avulsa no cardápio digital e continua no catálogo do PDV.',
  },
  {
    name: 'ocultar_no_pdv',
    write: true,
    description: 'Oculta (ou mostra) um produto na frente de caixa do PDV. Não afeta o cardápio digital. Exige confirmação do dono.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string' }, ocultar: { type: 'boolean' } }, required: ['produto_id', 'nome_produto', 'ocultar'] },
    run: (ctx, args) => ocultarNoPdv(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `${args.ocultar ? 'Ocultar' : 'Mostrar'} "${args.nome_produto}" no PDV`,
    effect: (args) => args.ocultar ? 'Sai da frente de caixa. O cardápio digital não muda.' : 'Volta a aparecer na frente de caixa.',
  },
  {
    name: 'criar_categoria',
    write: true,
    description: 'Cria uma categoria nova no catálogo. Se já existir com o mesmo nome, reutiliza. Exige confirmação do dono.',
    parameters: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] },
    run: (ctx, args) => criarCategoria(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Criar a categoria "${String(args.nome || '').trim()}"`,
    effect: () => 'Aparece em Produtos e no cardápio quando tiver itens.',
  },
  {
    name: 'criar_produto',
    write: true,
    description: 'Cadastra um produto novo com nome, preço e categoria obrigatória (use listar_categorias ou criar_categoria antes). Exige confirmação do dono.',
    parameters: { type: 'object', properties: { nome: { type: 'string' }, preco: { type: 'number', minimum: 0 }, preco_2: { type: 'number', minimum: 0 }, preco_3: { type: 'number', minimum: 0 }, categoria_id: { type: 'integer' }, nome_categoria: { type: 'string' }, id_subcategoria: { type: 'integer' }, controlar_estoque: { type: 'boolean' }, estoque_atual: { type: 'integer', minimum: 0 }, custo_unitario: { type: 'number', minimum: 0 }, eh_item_por_unidade: { type: 'boolean' } }, required: ['nome', 'preco', 'categoria_id', 'nome_categoria'] },
    run: (ctx, args) => criarProduto(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Cadastrar "${String(args.nome || '').trim()}" por ${brl(args.preco)} em "${args.nome_categoria}"`,
    effect: () => 'Entra no PDV na hora. No cardápio digital só quando você publicar.',
  },
  {
    name: 'alterar_preco',
    write: true,
    description: 'Altera o preço principal de um produto. Exige confirmação do dono.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string' }, preco: { type: 'number', minimum: 0 } }, required: ['produto_id', 'nome_produto', 'preco'] },
    run: (ctx, args) => alterarPreco(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Alterar o preço de "${args.nome_produto}" para ${brl(args.preco)}`,
    effect: () => 'Vale para o PDV e para o cardápio digital a partir de agora.',
  },
  {
    name: 'editar_produto',
    write: true,
    description: 'Edita os dados de um produto (nome, preço, categoria, estoque, custo ou visibilidade). Use buscar_produto antes e exige confirmação.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string' }, nome: { type: 'string' }, preco: { type: 'number', minimum: 0 }, preco_2: { type: 'number', minimum: 0 }, preco_3: { type: 'number', minimum: 0 }, categoria_id: { type: 'integer' }, id_subcategoria: { type: 'integer' }, controlar_estoque: { type: 'boolean' }, estoque_atual: { type: 'integer', minimum: 0 }, custo_unitario: { type: 'number', minimum: 0 }, eh_item_por_unidade: { type: 'boolean' }, ocultar_no_pdv: { type: 'boolean' } }, required: ['produto_id', 'nome_produto'] },
    run: (ctx, args) => editarProduto(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Editar o produto "${args.nome_produto}"`,
    effect: () => 'Atualiza os dados do produto no catálogo.',
  },
  {
    name: 'definir_custo_produto',
    write: true,
    description: 'Salva ou remove o custo unitário estimado de um produto. Use quando o dono informar quanto custa produzir uma unidade.',
    parameters: { type: 'object', properties: { produto_id: { type: 'integer' }, nome_produto: { type: 'string' }, custo_unitario: { type: 'number', minimum: 0 } }, required: ['produto_id', 'nome_produto', 'custo_unitario'] },
    run: (ctx, args) => definirCustoProduto(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Salvar custo de "${args.nome_produto}"`,
    effect: () => 'Passa a ser usado nas estimativas de lucro e margem.',
  },
  {
    name: 'criar_produtos_lote',
    write: true,
    description: 'Cadastra vários produtos de uma vez. Cada item precisa de nome, preço e categoria_id; exige confirmação do dono.',
    parameters: { type: 'object', properties: { produtos: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', properties: { nome: { type: 'string' }, preco: { type: 'number', minimum: 0 }, preco_2: { type: 'number', minimum: 0 }, preco_3: { type: 'number', minimum: 0 }, categoria_id: { type: 'integer' }, nome_categoria: { type: 'string' }, id_subcategoria: { type: 'integer' }, controlar_estoque: { type: 'boolean' }, estoque_atual: { type: 'integer', minimum: 0 }, custo_unitario: { type: 'number', minimum: 0 }, eh_item_por_unidade: { type: 'boolean' } }, required: ['nome', 'preco', 'categoria_id'] } } }, required: ['produtos'] },
    run: (ctx, args) => criarProdutosLote(ctx.db, ctx.ownerUserId, args),
    summary: (args) => `Cadastrar ${Array.isArray(args.produtos) ? args.produtos.length : 0} produtos`,
    effect: () => 'Os produtos entram no PDV após a confirmação.',
  },
  {
    name: 'excluir_catalogo',
    write: true,
    description: 'Exclui produtos sem histórico e arquiva os que já foram vendidos; também exclui categorias vazias. Use analisar_exclusao_catalogo antes e sempre exige confirmação.',
    parameters: { type: 'object', properties: { produto_ids: { type: 'array', items: { type: 'integer' } }, categoria_ids: { type: 'array', items: { type: 'integer' } }, todos: { type: 'boolean' }, resumo: { type: 'string' } }, required: [] },
    run: (ctx, args) => excluirCatalogo(ctx.db, ctx.ownerUserId, args),
    summary: (args) => args.resumo || 'Limpar produtos e categorias selecionados do catálogo',
    effect: () => 'Produtos sem histórico serão excluídos; produtos vendidos serão arquivados para preservar relatórios.',
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
export const WRITE_TOOL_NAMES = new Set(TOOLS.filter((tool) => tool.write).map((tool) => tool.name));

export function getTool(name) {
  return BY_NAME.get(name);
}

export function getOpenAiTools() {
  return TOOLS.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

export async function executeTool(ctx, name, args) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: 'Ferramenta desconhecida.' };
  try {
    return await tool.run(ctx, args || {});
  } catch (error) {
    console.error(`[gerente/tools] ${name}:`, error?.message || error);
    return { ok: false, error: 'Não consegui concluir essa ação agora.' };
  }
}

export function summarizeAction(name, args) {
  const tool = getTool(name);
  if (!tool?.summary) return `Executar ${name}`;
  return tool.summary(args || {});
}

export function summarizeEffect(name, args) {
  const tool = getTool(name);
  if (!tool?.effect) return '';
  return tool.effect(args || {});
}
