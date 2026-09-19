// src/lib/server/gerente/tools/catalog.js
/**
 * @file Ferramentas de catálogo do Zelinho Gerente.
 * Leitura: consultas owner-scoped. Escrita: RPCs gerente_* ou operações
 * server-side owner-scoped que revalidam o alvo antes de persistir.
 * O owner é sempre injetado pelo servidor; nunca vem do modelo.
 */

const PRODUCT_COLUMNS = 'id, nome, preco, preco_2, preco_3, custo_unitario, id_categoria, id_subcategoria, eh_item_por_unidade, tipo_produto, ocultar_no_pdv, controlar_estoque, estoque_atual, categorias(nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)';
const MAX_CATALOG_ROWS = 500;

const RPC_ERRORS = {
  PRODUTO_NAO_ENCONTRADO: 'Não encontrei esse produto.',
  PRODUTO_NAO_PUBLICADO: 'Esse produto ainda não foi levado para o cardápio digital, então não há o que pausar. Isso se faz no ZeloMenu.',
  CATEGORIA_NAO_ENCONTRADA: 'Não encontrei essa categoria.',
  PRODUTO_DUPLICADO: 'Já existe um produto com esse nome.',
  NOME_INVALIDO: 'Esse nome não é válido.',
  PRECO_INVALIDO: 'Esse preço não é válido.',
  SEM_PERMISSAO_PRODUTOS: 'Você não tem permissão para alterar produtos.',
  NAO_AUTENTICADO: 'Sessão expirada.',
  SERVICE_ROLE_OWNER_REQUIRED: 'Configuração interna inválida.',
};

export function translateRpcError(message) {
  const key = String(message || '').trim().toUpperCase();
  return RPC_ERRORS[key] || 'Não consegui concluir essa ação agora.';
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mesma precedência do ZeloMenu (resolveZeloMenuPublicationStatus): a pausa vem
// antes da venda avulsa, porque pausar é global — tira o produto da lista e também
// das opções de outros produtos. visivel_online = false não é "escondido": é
// "somente complemento", ou seja, não se vende sozinho mas segue valendo como
// opção dentro de outros produtos.
function menuState(publication) {
  if (!publication) return 'fora_do_cardapio';
  if (publication.pausado_manualmente) return 'pausado';
  return publication.visivel_online === true ? 'publicado' : 'somente_complemento';
}

function toProductSummary(row, publication) {
  const summary = {
    id: row.id,
    nome: row.nome,
    preco: Number(row.preco),
    categoria: row.categorias?.nome ?? null,
    oculto_no_pdv: row.ocultar_no_pdv === true,
    controla_estoque: row.controlar_estoque === true,
    estoque_atual: Number(row.estoque_atual ?? 0),
    no_cardapio: menuState(publication),
  };
  if (row.custo_unitario != null) summary.custo_unitario = Number(row.custo_unitario);
  if (row.preco_2 !== undefined) summary.preco_2 = row.preco_2 == null ? null : Number(row.preco_2);
  if (row.preco_3 !== undefined) summary.preco_3 = row.preco_3 == null ? null : Number(row.preco_3);
  if (row.id_subcategoria !== undefined) summary.id_subcategoria = row.id_subcategoria;
  if (row.eh_item_por_unidade !== undefined) summary.item_por_unidade = row.eh_item_por_unidade === true;
  if (row.tipo_produto !== undefined) summary.tipo_produto = row.tipo_produto;
  return summary;
}

async function callRpc(db, name, params) {
  const { data, error } = await db.rpc(name, params);
  if (error) return { ok: false, error: translateRpcError(error.message) };
  return { ok: true, data };
}

export async function buscarProduto(db, ownerUserId, { termo, limite = 5 }) {
  const needle = normalizeText(termo);
  if (needle.length < 2) return { ok: false, error: 'Me diga pelo menos duas letras do nome do produto.' };
  const { data, error } = await db
    .from('produtos')
    .select(PRODUCT_COLUMNS)
    .eq('id_usuario', ownerUserId)
    .order('nome')
    .limit(MAX_CATALOG_ROWS);
  if (error) return { ok: false, error: 'Não consegui consultar o catálogo agora.' };

  const tokens = needle.split(' ');
  const matches = (data || [])
    .filter((row) => {
      const name = normalizeText(row.nome);
      return tokens.every((token) => name.includes(token));
    })
    .slice(0, Math.max(1, Math.min(Number(limite) || 5, 10)));
  if (matches.length === 0) return { ok: true, data: { produtos: [] } };

  const ids = matches.map((row) => row.id);
  const publications = await db
    .from('zelomenu_product_publications')
    .select('id_produto, visivel_online, pausado_manualmente')
    .eq('id_usuario', ownerUserId)
    .in('id_produto', ids);
  if (publications.error) return { ok: false, error: 'Não consegui consultar o cardápio agora.' };
  const byProduct = new Map((publications.data || []).map((row) => [row.id_produto, row]));
  return { ok: true, data: { produtos: matches.map((row) => toProductSummary(row, byProduct.get(row.id))) } };
}

/**
 * Lista uma página do catálogo, com filtros operacionais owner-scoped.
 * `offset` é deliberadamente explícito para o modelo não precisar inventar
 * cursores opacos; a resposta devolve o próximo offset quando houver mais
 * itens. O filtro de publicação é aplicado depois da consulta porque o estado
 * do ZeloMenu mora em uma tabela própria.
 */
export async function listarCatalogo(db, ownerUserId, {
  limite = 100,
  offset = 0,
  categoria_id = null,
  oculto_no_pdv = null,
  controlar_estoque = null,
} = {}) {
  const pageSize = Math.min(Math.max(Number(limite) || 100, 1), 1000);
  const pageOffset = Math.max(Number.isInteger(Number(offset)) ? Number(offset) : 0, 0);
  let query = db
    .from('produtos')
    .select(PRODUCT_COLUMNS, { count: 'exact' })
    .eq('id_usuario', ownerUserId)
    .order('nome')
    .range(pageOffset, pageOffset + pageSize - 1);
  if (categoria_id != null && Number.isInteger(Number(categoria_id)) && Number(categoria_id) > 0) {
    query = query.eq('id_categoria', Number(categoria_id));
  }
  if (oculto_no_pdv != null) query = query.eq('ocultar_no_pdv', oculto_no_pdv === true);
  if (controlar_estoque != null) query = query.eq('controlar_estoque', controlar_estoque === true);
  const { data, error, count } = await query;
  if (error) return { ok: false, error: 'Não consegui consultar o catálogo agora.' };
  const rows = data || [];
  const publications = rows.length
    ? await db.from('zelomenu_product_publications').select('id_produto, visivel_online, pausado_manualmente').eq('id_usuario', ownerUserId).in('id_produto', rows.map((row) => row.id))
    : { data: [], error: null };
  if (publications.error) return { ok: false, error: 'Não consegui consultar o cardápio agora.' };
  const byProduct = new Map((publications.data || []).map((row) => [row.id_produto, row]));
  return {
    ok: true,
    data: {
      produtos: rows.map((row) => toProductSummary(row, byProduct.get(row.id))),
      pagina: {
        offset: pageOffset,
        limite: pageSize,
        total: Number.isInteger(count) ? count : null,
        proximo_offset: rows.length === pageSize ? pageOffset + pageSize : null,
      },
    },
  };
}

function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

/**
 * Faz a prévia da limpeza. Produtos vendidos são arquivados operacionalmente
 * (ocultos/pausados), enquanto os nunca vendidos podem ser excluídos.
 */
export async function prepararExclusaoCatalogo(db, ownerUserId, { produto_ids = [], categoria_ids = [], todos = false } = {}) {
  const ids = normalizeIds(produto_ids);
  let selected = [];
  if (todos || ids.length) {
    let productQuery = db.from('produtos').select('id, nome, id_categoria, preco, tipo_produto').eq('id_usuario', ownerUserId).order('nome').limit(1000);
    if (!todos) productQuery = productQuery.in('id', ids);
    const { data: products, error: productsError } = await productQuery;
    if (productsError) return { ok: false, error: 'Não consegui preparar a limpeza do catálogo.' };
    selected = products || [];
  }
  const categoryIds = normalizeIds(categoria_ids);
  if (!selected.length && !todos && !categoryIds.length) return { ok: false, error: 'Não encontrei produtos para essa operação.' };
  const selectedIds = selected.map((row) => row.id);
  const sold = selected.length
    ? await db.from('vendas_itens').select('id_produto, vendas!inner(id_usuario)').eq('vendas.id_usuario', ownerUserId).in('id_produto', selectedIds)
    : { data: [], error: null };
  if (sold.error) return { ok: false, error: 'Não consegui verificar o histórico de vendas.' };
  // Comandas abertas também mantêm referência ao produto. Elas não são venda
  // concluída, mas tornam a exclusão definitiva insegura até que a comanda
  // seja encerrada; nesse caso o produto segue para arquivamento.
  const openOrders = selected.length
    ? await db.from('comanda_itens').select('id_produto, comandas!inner(id_usuario)').eq('comandas.id_usuario', ownerUserId).in('id_produto', selectedIds)
    : { data: [], error: null };
  if (openOrders.error) return { ok: false, error: 'Não consegui verificar dependências abertas do catálogo.' };
  // O id do produto é global e já foi validado contra o owner acima; por isso
  // a referência em pedidos online também é uma dependência segura de testar
  // sem expor dados de outra empresa.
  const onlineOrders = selected.length
    ? await db.from('zelo_order_items').select('product_id').in('product_id', selectedIds)
    : { data: [], error: null };
  if (onlineOrders.error) return { ok: false, error: 'Não consegui verificar pedidos online do catálogo.' };
  const soldIds = new Set((sold.data || []).map((row) => Number(row.id_produto)));
  const dependencyReasons = new Map();
  for (const row of sold.data || []) dependencyReasons.set(Number(row.id_produto), 'historico_de_venda');
  for (const row of selected) {
    if (row.tipo_produto === 'pizza') {
      soldIds.add(Number(row.id));
      dependencyReasons.set(Number(row.id), 'pizza_deve_ser_arquivada');
    }
  }
  for (const row of openOrders.data || []) {
    const id = Number(row.id_produto);
    soldIds.add(id);
    if (!dependencyReasons.has(id)) dependencyReasons.set(id, 'comanda_aberta');
  }
  for (const row of onlineOrders.data || []) {
    const id = Number(row.product_id);
    soldIds.add(id);
    if (!dependencyReasons.has(id)) dependencyReasons.set(id, 'pedido_online');
  }
  let categoryQuery = null;
  if (todos || categoryIds.length) {
    categoryQuery = db.from('categorias').select('id, nome').eq('id_usuario', ownerUserId);
    if (!todos) categoryQuery = categoryQuery.in('id', categoryIds);
  }
  const categories = categoryQuery ? await categoryQuery : { data: [], error: null };
  if (categories.error) return { ok: false, error: 'Não consegui verificar as categorias.' };
  const categoryRows = categories.data || [];
  const subcategoryDependencies = categoryRows.length
    ? await db.from('subcategorias').select('id_categoria').eq('id_usuario', ownerUserId).in('id_categoria', categoryRows.map((row) => row.id))
    : { data: [], error: null };
  if (subcategoryDependencies.error) return { ok: false, error: 'Não consegui verificar dependências das categorias.' };
  const categoryDependencyIds = new Set((subcategoryDependencies.data || []).map((row) => Number(row.id_categoria)));
  return {
    ok: true,
    data: {
      produto_ids: selected.map((row) => row.id),
      categoria_ids: (categories.data || []).map((row) => row.id),
      excluir: selected.filter((row) => !soldIds.has(row.id)).map((row) => ({ id: row.id, nome: row.nome })),
      arquivar: selected.filter((row) => soldIds.has(row.id)).map((row) => ({ id: row.id, nome: row.nome })),
      dependencias: selected.filter((row) => dependencyReasons.has(row.id)).map((row) => ({ id: row.id, nome: row.nome, motivo: dependencyReasons.get(row.id) })),
      categorias: categoryRows.map((row) => ({ id: row.id, nome: row.nome })),
      categorias_com_dependencias: categoryRows.filter((row) => categoryDependencyIds.has(Number(row.id))).map((row) => ({ id: row.id, nome: row.nome, motivo: 'subcategorias' })),
      total_produtos: selected.length,
    },
  };
}

/** Executa uma limpeza já confirmada e revalida o histórico na hora. */
export async function excluirCatalogo(db, ownerUserId, args) {
  const ids = normalizeIds(args.produto_ids);
  const categoryIds = normalizeIds(args.categoria_ids);
  if (!ids.length && !categoryIds.length && args.todos !== true) return { ok: false, error: 'Não há produtos ou categorias para alterar.' };
  const preview = await prepararExclusaoCatalogo(db, ownerUserId, { produto_ids: ids, categoria_ids: categoryIds, todos: args.todos === true });
  if (!preview.ok) return preview;
  const data = preview.data;
  const rpc = await callRpc(db, 'gerente_excluir_catalogo', { p_produto_ids: data.produto_ids, p_categoria_ids: data.categoria_ids, p_owner: ownerUserId });
  if (!rpc.ok) return rpc;
  const outcome = rpc.data || {};
  return {
    ok: true,
    data: outcome,
    before: data,
    after: outcome,
  };
}

export async function definirCustoProduto(db, ownerUserId, { produto_id, custo_unitario }) {
  const productId = Number(produto_id);
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: 'Preciso do produto certo antes de salvar o custo.' };
  const custo = custo_unitario == null || custo_unitario === '' ? null : Number(custo_unitario);
  if (custo != null && (!Number.isFinite(custo) || custo < 0)) return { ok: false, error: 'O custo precisa ser um valor maior ou igual a zero.' };
  const current = await db.from('produtos').select('id, nome, preco, custo_unitario').eq('id_usuario', ownerUserId).eq('id', productId).maybeSingle();
  if (current.error) return { ok: false, error: 'Não consegui consultar o produto agora.' };
  if (!current.data) return { ok: false, error: 'Não encontrei esse produto.' };
  const updated = await db.from('produtos').update({ custo_unitario: custo }).eq('id_usuario', ownerUserId).eq('id', productId).select('id, nome, preco, custo_unitario').single();
  if (updated.error || !updated.data) return { ok: false, error: 'Não consegui salvar o custo do produto.' };
  return { ok: true, data: updated.data, before: { custo_unitario: current.data.custo_unitario == null ? null : Number(current.data.custo_unitario) }, after: { custo_unitario: custo } };
}

export async function listarCategorias(db, ownerUserId) {
  const { data, error } = await db
    .from('categorias')
    .select('id, nome, ordem, controlar_estoque_compartilhado')
    .eq('id_usuario', ownerUserId)
    .order('ordem');
  if (error) return { ok: false, error: 'Não consegui consultar as categorias agora.' };
  return { ok: true, data: { categorias: (data || []).map((row) => ({ id: row.id, nome: row.nome, ordem: row.ordem, estoque_compartilhado: row.controlar_estoque_compartilhado === true })) } };
}

export async function estoqueProduto(db, ownerUserId, { produto_id }) {
  const { data, error } = await db
    .from('produtos')
    .select(PRODUCT_COLUMNS)
    .eq('id_usuario', ownerUserId)
    .eq('id', produto_id)
    .maybeSingle();
  if (error) return { ok: false, error: 'Não consegui consultar o estoque agora.' };
  if (!data) return { ok: false, error: 'Não encontrei esse produto.' };
  const categoria = data.categorias || {};
  return {
    ok: true,
    data: {
      id: data.id,
      nome: data.nome,
      controla_estoque: data.controlar_estoque === true,
      estoque_atual: Number(data.estoque_atual ?? 0),
      estoque_da_categoria: categoria.controlar_estoque_compartilhado ? Number(categoria.estoque_compartilhado_atual ?? 0) : null,
    },
  };
}

export async function pausarNoCardapio(db, ownerUserId, { produto_id, pausado }) {
  if (!Number.isFinite(Number(produto_id))) return { ok: false, error: 'Preciso do produto certo antes de pausar.' };
  // A pausa vai para a identidade canônica do item, então vale de uma vez para o
  // avulso e para todas as aparições dele como adicional. A RPC só recusa quando
  // o produto nem tem linha de publicação, ou seja, nunca foi para o ZeloMenu.
  const result = await callRpc(db, 'gerente_set_menu_pause', { p_produto_id: Number(produto_id), p_pausado: pausado === true, p_owner: ownerUserId });
  if (!result.ok) return result;
  // `before`/`after` descrevem só o estado da entidade, porque é deles que o
  // undo é reconstruído. A contagem de aparições afetadas vai no result.
  return { ...result, before: { pausado_manualmente: result.data.pausado_anterior === true }, after: { pausado_manualmente: result.data.pausado_manualmente === true } };
}

/** Publica ou retira um produto do ZeloMenu sem tocar no PDV. */
export async function definirPublicacaoProduto(db, ownerUserId, { produto_id, publicado }) {
  const productId = Number(produto_id);
  if (!Number.isInteger(productId) || productId <= 0 || typeof publicado !== 'boolean') {
    return { ok: false, error: 'Preciso do produto e de dizer se ele ficará publicado.' };
  }
  const product = await db.from('produtos').select('id, nome').eq('id_usuario', ownerUserId).eq('id', productId).maybeSingle();
  if (product.error) return { ok: false, error: 'Não consegui consultar o produto agora.' };
  if (!product.data) return { ok: false, error: 'Não encontrei esse produto.' };
  const current = await db.from('zelomenu_product_publications').select('id_produto, visivel_online, pausado_manualmente').eq('id_usuario', ownerUserId).eq('id_produto', productId).maybeSingle();
  if (current.error) return { ok: false, error: 'Não consegui consultar o estado no cardápio agora.' };
  if (!publicado && !current.data) return { ok: false, error: 'Esse produto ainda não foi publicado no ZeloMenu.' };
  const query = publicado
    ? db.from('zelomenu_product_publications').upsert({ id_usuario: ownerUserId, id_produto: productId, visivel_online: true, pausado_manualmente: false }, { onConflict: 'id_usuario,id_produto' }).select('id_produto, visivel_online, pausado_manualmente').single()
    : db.from('zelomenu_product_publications').update({ visivel_online: false }).eq('id_usuario', ownerUserId).eq('id_produto', productId).select('id_produto, visivel_online, pausado_manualmente').single();
  const updated = await query;
  if (updated.error || !updated.data) return { ok: false, error: 'Não consegui atualizar a publicação no ZeloMenu.' };
  return {
    ok: true,
    data: { produto_id: productId, nome: product.data.nome, publicado: updated.data.visivel_online === true, pausado_manualmente: updated.data.pausado_manualmente === true },
    before: { publicado: current.data?.visivel_online === true },
    after: { publicado: updated.data.visivel_online === true },
  };
}

export async function ocultarNoPdv(db, ownerUserId, { produto_id, ocultar }) {
  if (!Number.isFinite(Number(produto_id))) return { ok: false, error: 'Preciso do produto certo antes de alterar.' };
  const result = await callRpc(db, 'gerente_set_ocultar_pdv', { p_produto_id: Number(produto_id), p_ocultar: ocultar === true, p_owner: ownerUserId });
  if (!result.ok) return result;
  return { ...result, before: { ocultar_no_pdv: result.data.ocultar_anterior === true }, after: { ocultar_no_pdv: result.data.ocultar_no_pdv === true } };
}

export async function criarCategoria(db, ownerUserId, { nome }) {
  const cleanName = String(nome || '').trim();
  if (cleanName.length < 2 || cleanName.length > 60) return { ok: false, error: 'O nome da categoria precisa ter entre 2 e 60 caracteres.' };
  const result = await callRpc(db, 'gerente_criar_categoria', { p_nome: cleanName, p_owner: ownerUserId });
  if (!result.ok) return result;
  return { ...result, before: null, after: { categoria_id: result.data.id, created: result.data.created === true } };
}

export async function criarProduto(db, ownerUserId, { nome, preco, preco_2 = null, preco_3 = null, categoria_id, id_subcategoria = null, controlar_estoque = false, estoque_atual = 0, custo_unitario = null, eh_item_por_unidade = false }) {
  const cleanName = String(nome || '').trim();
  if (cleanName.length < 2 || cleanName.length > 80) return { ok: false, error: 'O nome do produto precisa ter entre 2 e 80 caracteres.' };
  const price = Number(preco);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' };
  if (!Number.isFinite(Number(categoria_id))) return { ok: false, error: 'Escolha uma categoria para o produto.' };
  if (id_subcategoria != null) {
    const subcategoriaId = Number(id_subcategoria);
    if (!Number.isInteger(subcategoriaId) || subcategoriaId <= 0) return { ok: false, error: 'A subcategoria informada não é válida.' };
    const subcategoria = await db.from('subcategorias').select('id').eq('id_usuario', ownerUserId).eq('id', subcategoriaId).maybeSingle();
    if (subcategoria.error) return { ok: false, error: 'Não consegui validar a subcategoria.' };
    if (!subcategoria.data) return { ok: false, error: 'Não encontrei essa subcategoria.' };
  }
  for (const value of [preco_2, preco_3]) {
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) return { ok: false, error: 'Os preços adicionais precisam ser maiores ou iguais a zero.' };
  }
  if (custo_unitario != null && (!Number.isFinite(Number(custo_unitario)) || Number(custo_unitario) < 0)) {
    return { ok: false, error: 'O custo precisa ser um valor maior ou igual a zero.' };
  }
  const result = await callRpc(db, 'gerente_criar_produto', {
    p_nome: cleanName,
    p_preco: price,
    p_categoria_id: Number(categoria_id),
    p_owner: ownerUserId,
    p_controlar_estoque: controlar_estoque === true,
    p_estoque_atual: Math.max(0, Math.floor(Number(estoque_atual) || 0)),
  });
  if (!result.ok) return result;
  if (!result.data?.id) return { ok: false, error: 'Não consegui cadastrar o produto agora.' };
  if (custo_unitario != null) {
    const cost = await definirCustoProduto(db, ownerUserId, { produto_id: result.data.id, custo_unitario });
    if (!cost.ok) return cost;
    result.data.custo_unitario = cost.data.custo_unitario;
  }
  const extras = {};
  for (const [field, value] of [['preco_2', preco_2], ['preco_3', preco_3]]) {
    if (value != null) extras[field] = Math.round(Number(value) * 100) / 100;
  }
  if (id_subcategoria != null) extras.id_subcategoria = Number(id_subcategoria);
  if (eh_item_por_unidade === true) extras.eh_item_por_unidade = true;
  if (Object.keys(extras).length) {
    const updated = await db.from('produtos').update(extras).eq('id_usuario', ownerUserId).eq('id', result.data.id).select('id').single();
    if (updated.error) return { ok: false, error: 'Cadastrei o produto, mas não consegui salvar todas as configurações.' };
  }
  return { ...result, before: null, after: { produto_id: result.data.id } };
}

export async function criarProdutosLote(db, ownerUserId, { produtos = [] } = {}) {
  if (!Array.isArray(produtos) || produtos.length === 0 || produtos.length > 50) {
    return { ok: false, error: 'Envie entre 1 e 50 produtos para cadastrar.' };
  }
  // Valida o lote inteiro antes da primeira escrita para não deixar metade do
  // cadastro aplicado por um erro simples de nome, preço ou custo.
  const names = new Set();
  for (const produto of produtos) {
    const nome = String(produto?.nome || '').trim();
    if (nome.length < 2 || nome.length > 80) return { ok: false, error: `O nome do produto "${nome || 'sem nome'}" precisa ter entre 2 e 80 caracteres.` };
    const normalizedName = normalizeText(nome);
    if (names.has(normalizedName)) return { ok: false, error: `O produto "${nome}" aparece mais de uma vez no lote.` };
    names.add(normalizedName);
    if (!Number.isFinite(Number(produto?.preco)) || Number(produto.preco) < 0) return { ok: false, error: `O preço de "${nome}" precisa ser um número maior ou igual a zero.` };
    if (!Number.isFinite(Number(produto?.categoria_id))) return { ok: false, error: `Escolha uma categoria para "${nome}".` };
    if (produto.custo_unitario != null && (!Number.isFinite(Number(produto.custo_unitario)) || Number(produto.custo_unitario) < 0)) return { ok: false, error: `O custo de "${nome}" precisa ser um valor maior ou igual a zero.` };
  }
  const criados = [];
  for (const produto of produtos) {
    const result = await criarProduto(db, ownerUserId, produto || {});
    if (!result.ok) return { ok: false, error: `Não consegui cadastrar "${String(produto?.nome || 'produto').trim()}": ${result.error}` };
    criados.push(result.data);
  }
  return { ok: true, data: { criados }, before: null, after: { produto_ids: criados.map((produto) => produto.id) } };
}

export async function editarProduto(db, ownerUserId, { produto_id, nome_produto, nome, preco, preco_2, preco_3, categoria_id, id_subcategoria, controlar_estoque, estoque_atual, custo_unitario, ocultar_no_pdv, eh_item_por_unidade }) {
  const productId = Number(produto_id);
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: 'Preciso do produto certo antes de editar.' };
  const current = await db.from('produtos').select('id, nome, preco, preco_2, preco_3, id_categoria, id_subcategoria, eh_item_por_unidade, controlar_estoque, estoque_atual, custo_unitario, ocultar_no_pdv').eq('id_usuario', ownerUserId).eq('id', productId).maybeSingle();
  if (current.error) return { ok: false, error: 'Não consegui consultar o produto agora.' };
  if (!current.data) return { ok: false, error: 'Não encontrei esse produto.' };
  const patch = {};
  if (nome != null) {
    const cleanName = String(nome).trim();
    if (cleanName.length < 2 || cleanName.length > 80) return { ok: false, error: 'O nome precisa ter entre 2 e 80 caracteres.' };
    patch.nome = cleanName;
  }
  if (preco != null) {
    const value = Number(preco);
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' };
    patch.preco = Math.round(value * 100) / 100;
  }
  for (const [field, value] of [['preco_2', preco_2], ['preco_3', preco_3]]) {
    if (value !== undefined) {
      const price = value == null || value === '' ? null : Number(value);
      if (price != null && (!Number.isFinite(price) || price < 0)) return { ok: false, error: 'Os preços adicionais precisam ser maiores ou iguais a zero.' };
      patch[field] = price == null ? null : Math.round(price * 100) / 100;
    }
  }
  if (categoria_id != null) {
    const category = await db.from('categorias').select('id').eq('id_usuario', ownerUserId).eq('id', Number(categoria_id)).maybeSingle();
    if (category.error) return { ok: false, error: 'Não consegui validar a categoria.' };
    if (!category.data) return { ok: false, error: 'Não encontrei essa categoria.' };
    patch.id_categoria = Number(categoria_id);
  }
  if (id_subcategoria != null) {
    const subcategoriaId = Number(id_subcategoria);
    if (!Number.isInteger(subcategoriaId) || subcategoriaId <= 0) return { ok: false, error: 'A subcategoria informada não é válida.' };
    const subcategoria = await db.from('subcategorias').select('id').eq('id_usuario', ownerUserId).eq('id', subcategoriaId).maybeSingle();
    if (subcategoria.error) return { ok: false, error: 'Não consegui validar a subcategoria.' };
    if (!subcategoria.data) return { ok: false, error: 'Não encontrei essa subcategoria.' };
    patch.id_subcategoria = subcategoriaId;
  }
  if (controlar_estoque != null) patch.controlar_estoque = controlar_estoque === true;
  if (estoque_atual != null) patch.estoque_atual = Math.max(0, Math.floor(Number(estoque_atual) || 0));
  if (eh_item_por_unidade != null) patch.eh_item_por_unidade = eh_item_por_unidade === true;
  if (custo_unitario !== undefined) {
    const value = custo_unitario == null || custo_unitario === '' ? null : Number(custo_unitario);
    if (value != null && (!Number.isFinite(value) || value < 0)) return { ok: false, error: 'O custo precisa ser um valor maior ou igual a zero.' };
    patch.custo_unitario = value;
  }
  if (ocultar_no_pdv != null) patch.ocultar_no_pdv = ocultar_no_pdv === true;
  if (!Object.keys(patch).length) return { ok: false, error: 'Diga o que quer alterar no produto.' };
  const updated = await db.from('produtos').update(patch).eq('id_usuario', ownerUserId).eq('id', productId).select('id, nome, preco, preco_2, preco_3, id_categoria, id_subcategoria, eh_item_por_unidade, controlar_estoque, estoque_atual, custo_unitario, ocultar_no_pdv').single();
  if (updated.error || !updated.data) return { ok: false, error: 'Não consegui atualizar o produto.' };
  return { ok: true, data: updated.data, before: current.data, after: updated.data };
}

export async function alterarPreco(db, ownerUserId, { produto_id, preco }) {
  if (!Number.isFinite(Number(produto_id))) return { ok: false, error: 'Preciso do produto certo antes de alterar o preço.' };
  const price = Number(preco);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' };
  const result = await callRpc(db, 'gerente_alterar_preco', { p_produto_id: Number(produto_id), p_preco: price, p_owner: ownerUserId });
  if (!result.ok) return result;
  return { ...result, before: { preco: Number(result.data.preco_anterior) }, after: { preco: Number(result.data.preco) } };
}
