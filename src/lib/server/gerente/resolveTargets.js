/**
 * @file O servidor resolve o alvo de uma ferramenta de escrita; o modelo nunca
 * escolhe o id definitivo. O modelo pode mandar um produto_id/categoria_id
 * inventado, desatualizado ou 0 — aqui confirmamos contra o banco, sempre
 * escopado por owner, e devolvemos o par (id, nome) verdadeiro. Quando não dá
 * para resolver com segurança, devolvemos um motivo em português para o
 * modelo perguntar de novo em vez de arriscar o id errado.
 */
import { normalizeText } from './tools/catalog.js';

const PRODUCT_TOOLS = new Set(['pausar_no_cardapio', 'ocultar_no_pdv', 'alterar_preco']);
// Mesmo teto de buscarProduto em tools/catalog.js: o filtro por nome roda em JS
// para ignorar acento e não tratar % ou _ do nome como curinga do ilike.
const MAX_ROWS = 500;

const PRODUTO_MESSAGES = {
  semNome: 'Preciso do nome exato do produto. Chame buscar_produto antes.',
  zero: (nome) => `Não encontrei o produto "${nome}" no catálogo deste dono. Chame buscar_produto de novo com outro termo ou peça o nome exato antes de preparar a mudança.`,
  ambiguo: (nome, nomes) => `Mais de um produto combina com "${nome}": ${nomes}. Pergunte ao dono qual é antes de preparar a mudança.`,
};

const CATEGORIA_MESSAGES = {
  semNome: 'Preciso saber em qual categoria cadastrar. Chame listar_categorias antes.',
  zero: (nome) => `A categoria "${nome}" não existe. Crie a categoria antes ou peça ao dono para escolher uma das existentes.`,
  ambiguo: (nome, nomes) => `Mais de uma categoria combina com "${nome}": ${nomes}. Pergunte ao dono qual é antes de preparar a mudança.`,
};

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function throwIfError(error) {
  if (error) throw new Error(error.message || String(error));
}

/**
 * Resolve um alvo (produto ou categoria) por id ou nome, escopado por owner.
 * 1. Se o id sugerido for um inteiro > 0 e existir na tabela, aceita — desde
 *    que o nome sugerido (quando houver) bata com o nome real.
 * 2. Senão, busca por nome (parcial); prioriza casamento exato; só aceita
 *    quando sobra exatamente um candidato.
 */
async function resolveEntity(db, ownerUserId, { table, id, name, messages }) {
  const trimmedName = String(name || '').trim();

  if (id !== null) {
    const { data, error } = await db
      .from(table)
      .select('id, nome')
      .eq('id_usuario', ownerUserId)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    if (data && (!trimmedName || normalizeText(data.nome) === normalizeText(trimmedName))) {
      return { ok: true, id: data.id, nome: data.nome };
    }
  }

  if (!trimmedName) {
    return { ok: false, motivo: messages.semNome };
  }

  const { data, error } = await db
    .from(table)
    .select('id, nome')
    .eq('id_usuario', ownerUserId)
    .order('nome')
    .limit(MAX_ROWS);
  throwIfError(error);
  const rows = data || [];
  const needle = normalizeText(trimmedName);
  const tokens = needle.split(' ').filter(Boolean);
  const exact = rows.filter((row) => normalizeText(row.nome) === needle);
  const partial = rows.filter((row) => {
    const name = normalizeText(row.nome);
    return tokens.length > 0 && tokens.every((token) => name.includes(token));
  });
  const candidates = exact.length ? exact : partial;

  if (candidates.length === 0) return { ok: false, motivo: messages.zero(trimmedName) };
  if (candidates.length === 1) return { ok: true, id: candidates[0].id, nome: candidates[0].nome };
  const nomes = candidates.slice(0, 3).map((row) => row.nome).join(', ');
  return { ok: false, motivo: messages.ambiguo(trimmedName, nomes) };
}

/**
 * @param {*} db cliente Supabase (service role)
 * @param {string} ownerUserId
 * @param {string} toolName
 * @param {object} args argumentos brutos sugeridos pelo modelo
 * @returns {Promise<{ ok: true, args: object } | { ok: false, motivo: string }>}
 */
export async function resolveWriteTargets(db, ownerUserId, toolName, args) {
  if (PRODUCT_TOOLS.has(toolName)) {
    const resolved = await resolveEntity(db, ownerUserId, {
      table: 'produtos',
      id: toPositiveInt(args.produto_id),
      name: args.nome_produto,
      messages: PRODUTO_MESSAGES,
    });
    if (!resolved.ok) return resolved;
    return { ok: true, args: { ...args, produto_id: resolved.id, nome_produto: resolved.nome } };
  }

  if (toolName === 'criar_produto') {
    const resolved = await resolveEntity(db, ownerUserId, {
      table: 'categorias',
      id: toPositiveInt(args.categoria_id),
      name: args.nome_categoria,
      messages: CATEGORIA_MESSAGES,
    });
    if (!resolved.ok) return resolved;
    return { ok: true, args: { ...args, categoria_id: resolved.id, nome_categoria: resolved.nome } };
  }

  return { ok: true, args };
}
