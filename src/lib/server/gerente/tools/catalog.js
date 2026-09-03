// src/lib/server/gerente/tools/catalog.js
/**
 * @file Ferramentas de catálogo do Zelinho Gerente.
 * Leitura: consultas owner-scoped. Escrita: RPCs gerente_* com p_owner.
 * O owner é sempre injetado pelo servidor; nunca vem do modelo.
 */

const PRODUCT_COLUMNS = 'id, nome, preco, id_categoria, ocultar_no_pdv, controlar_estoque, estoque_atual, categorias(nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)';
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
  return {
    id: row.id,
    nome: row.nome,
    preco: Number(row.preco),
    categoria: row.categorias?.nome ?? null,
    oculto_no_pdv: row.ocultar_no_pdv === true,
    controla_estoque: row.controlar_estoque === true,
    estoque_atual: Number(row.estoque_atual ?? 0),
    no_cardapio: menuState(publication),
  };
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
  // Pausar vale para produto avulso e para complemento: a RPC decide, e ela só recusa
  // quando o produto nem tem linha de publicação, ou seja, nunca foi para o ZeloMenu.
  const result = await callRpc(db, 'gerente_set_menu_pause', { p_produto_id: Number(produto_id), p_pausado: pausado === true, p_owner: ownerUserId });
  if (!result.ok) return result;
  return { ...result, before: { pausado_manualmente: result.data.pausado_anterior === true }, after: { pausado_manualmente: result.data.pausado_manualmente === true } };
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

export async function criarProduto(db, ownerUserId, { nome, preco, categoria_id, controlar_estoque = false, estoque_atual = 0 }) {
  const cleanName = String(nome || '').trim();
  if (cleanName.length < 2 || cleanName.length > 80) return { ok: false, error: 'O nome do produto precisa ter entre 2 e 80 caracteres.' };
  const price = Number(preco);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' };
  if (!Number.isFinite(Number(categoria_id))) return { ok: false, error: 'Escolha uma categoria para o produto.' };
  const result = await callRpc(db, 'gerente_criar_produto', {
    p_nome: cleanName,
    p_preco: price,
    p_categoria_id: Number(categoria_id),
    p_owner: ownerUserId,
    p_controlar_estoque: controlar_estoque === true,
    p_estoque_atual: Math.max(0, Math.floor(Number(estoque_atual) || 0)),
  });
  if (!result.ok) return result;
  return { ...result, before: null, after: { produto_id: result.data.id } };
}

export async function alterarPreco(db, ownerUserId, { produto_id, preco }) {
  if (!Number.isFinite(Number(produto_id))) return { ok: false, error: 'Preciso do produto certo antes de alterar o preço.' };
  const price = Number(preco);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' };
  const result = await callRpc(db, 'gerente_alterar_preco', { p_produto_id: Number(produto_id), p_preco: price, p_owner: ownerUserId });
  if (!result.ok) return result;
  return { ...result, before: { preco: Number(result.data.preco_anterior) }, after: { preco: Number(result.data.preco) } };
}
