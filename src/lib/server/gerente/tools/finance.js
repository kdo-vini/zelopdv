/**
 * @file Ferramentas financeiras do Zelinho Gerente: fiado (leitura) e despesas (CRUD parcial).
 * Escrita exige confirmação do dono via pending action. Owner sempre injetado pelo servidor.
 */
import { addDays, dayRangeUtc, localDateOf } from '../../intelligence/tz.js';
import { normalizeText } from './catalog.js';

export const EXPENSE_CATEGORIES = Object.freeze([
  'Fornecedor',
  'Insumos',
  'Aluguel',
  'Contas fixas',
  'Pessoal',
  'Manutenção',
  'Outros',
]);

const PERIODOS = new Set(['hoje', 'ontem', 'semana', 'mes']);
const MAX_FIADO_ROWS = 200;
const MAX_DESPESA_ROWS = 100;

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function brl(value) {
  return round2(value);
}

function periodBounds(periodo, today) {
  if (periodo === 'hoje') return { inicio: today, fim: today };
  if (periodo === 'ontem') {
    const d = addDays(today, -1);
    return { inicio: d, fim: d };
  }
  if (periodo === 'semana') return { inicio: addDays(today, -6), fim: today };
  return { inicio: `${today.slice(0, 7)}-01`, fim: today };
}

function parseLocalDate(value, fallback) {
  const raw = String(value || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function normalizeCategory(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const exact = EXPENSE_CATEGORIES.find((item) => normalizeText(item) === normalizeText(trimmed));
  return exact || null;
}

function toExpenseSummary(row) {
  return {
    id: row.id,
    descricao: row.description,
    valor: brl(row.amount),
    categoria: row.category || 'Outros',
    data: localDateOf(row.date),
  };
}

/**
 * Resumo do fichário: total em aberto, quantidade de clientes e maiores saldos.
 */
export async function resumoFiado(db, ownerUserId, { limite = 10 } = {}) {
  const limit = Math.min(Math.max(Number(limite) || 10, 1), 30);
  const { data, error } = await db
    .from('pessoas')
    .select('id, nome, saldo_fiado, contato')
    .eq('id_usuario', ownerUserId)
    .gt('saldo_fiado', 0)
    .order('saldo_fiado', { ascending: false })
    .limit(MAX_FIADO_ROWS);
  if (error) return { ok: false, error: 'Não consegui consultar o fiado agora.' };

  const rows = data || [];
  const total = round2(rows.reduce((sum, row) => sum + Number(row.saldo_fiado || 0), 0));
  return {
    ok: true,
    data: {
      clientes_com_saldo: rows.length,
      total_em_aberto: total,
      maiores: rows.slice(0, limit).map((row) => ({
        id: row.id,
        nome: row.nome,
        saldo: brl(row.saldo_fiado),
        contato: row.contato || null,
      })),
    },
  };
}

/**
 * Busca clientes do fichário pelo nome (com ou sem saldo).
 */
export async function buscarFiado(db, ownerUserId, { termo, limite = 8 } = {}) {
  const needle = normalizeText(termo);
  if (needle.length < 2) return { ok: false, error: 'Me diga pelo menos duas letras do nome do cliente.' };
  const limit = Math.min(Math.max(Number(limite) || 8, 1), 20);

  const { data, error } = await db
    .from('pessoas')
    .select('id, nome, saldo_fiado, contato, tipo')
    .eq('id_usuario', ownerUserId)
    .order('nome')
    .limit(MAX_FIADO_ROWS);
  if (error) return { ok: false, error: 'Não consegui consultar o fichário agora.' };

  const tokens = needle.split(' ').filter(Boolean);
  const matches = (data || [])
    .filter((row) => {
      const name = normalizeText(row.nome);
      return tokens.every((token) => name.includes(token));
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      nome: row.nome,
      saldo: brl(row.saldo_fiado),
      contato: row.contato || null,
      tipo: row.tipo || null,
    }));

  return { ok: true, data: { clientes: matches } };
}

/**
 * Lista despesas de um período com total e breakdown por categoria.
 */
export async function listarDespesas(db, ownerUserId, { periodo = 'mes', categoria = null } = {}, { now = new Date() } = {}) {
  if (!PERIODOS.has(periodo)) return { ok: false, error: 'Período inválido. Use hoje, ontem, semana ou mes.' };
  const today = localDateOf(now.toISOString());
  const { inicio, fim } = periodBounds(periodo, today);
  const { startIso } = dayRangeUtc(inicio);
  const { endIso } = dayRangeUtc(fim);

  let query = db
    .from('expenses')
    .select('id, description, amount, category, date')
    .eq('user_id', ownerUserId)
    .gte('date', startIso)
    .lt('date', endIso)
    .order('date', { ascending: false })
    .limit(MAX_DESPESA_ROWS);

  const categoryFilter = categoria ? normalizeCategory(categoria) : null;
  if (categoria && !categoryFilter) {
    return { ok: false, error: `Categoria inválida. Use uma destas: ${EXPENSE_CATEGORIES.join(', ')}.` };
  }
  if (categoryFilter) query = query.eq('category', categoryFilter);

  const { data, error } = await query;
  if (error) return { ok: false, error: 'Não consegui consultar as despesas agora.' };

  const rows = (data || []).map(toExpenseSummary);
  const total = round2(rows.reduce((sum, row) => sum + row.valor, 0));
  const porCategoria = {};
  for (const row of rows) {
    porCategoria[row.categoria] = round2((porCategoria[row.categoria] || 0) + row.valor);
  }

  return {
    ok: true,
    data: {
      periodo,
      inicio,
      fim,
      total,
      quantidade: rows.length,
      por_categoria: porCategoria,
      despesas: rows,
      categorias_validas: [...EXPENSE_CATEGORIES],
    },
  };
}

/**
 * Cadastra despesa. Retorna before/after para auditoria da pending action.
 */
export async function criarDespesa(db, ownerUserId, args, { actorUserId = null, now = new Date() } = {}) {
  const descricao = String(args.descricao || '').trim();
  const valor = Number(args.valor);
  const categoria = normalizeCategory(args.categoria) || 'Outros';
  const today = localDateOf(now.toISOString());
  const dataLocal = parseLocalDate(args.data, today);

  if (descricao.length < 2) return { ok: false, error: 'Informe uma descrição com pelo menos duas letras.' };
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'Informe um valor positivo para a despesa.' };
  if (args.categoria && !normalizeCategory(args.categoria)) {
    return { ok: false, error: `Categoria inválida. Use uma destas: ${EXPENSE_CATEGORIES.join(', ')}.` };
  }

  const { startIso } = dayRangeUtc(dataLocal);
  const payload = {
    user_id: ownerUserId,
    id_operador: actorUserId || null,
    description: descricao.slice(0, 200),
    amount: round2(valor),
    category: categoria,
    date: startIso,
  };

  const { data, error } = await db.from('expenses').insert(payload).select('id, description, amount, category, date').single();
  if (error || !data?.id) return { ok: false, error: 'Não consegui lançar a despesa agora.' };

  const after = toExpenseSummary(data);
  return { ok: true, data: after, before: null, after };
}

/**
 * Altera despesa existente (descrição, valor, categoria e/ou data).
 */
export async function alterarDespesa(db, ownerUserId, args) {
  const despesaId = String(args.despesa_id || '').trim();
  if (!despesaId) return { ok: false, error: 'Preciso do id da despesa. Chame listar_despesas antes.' };

  const { data: current, error: loadError } = await db
    .from('expenses')
    .select('id, description, amount, category, date')
    .eq('user_id', ownerUserId)
    .eq('id', despesaId)
    .maybeSingle();
  if (loadError) return { ok: false, error: 'Não consegui carregar essa despesa agora.' };
  if (!current) return { ok: false, error: 'Não encontrei essa despesa.' };

  const patch = {};
  if (args.descricao != null) {
    const descricao = String(args.descricao).trim();
    if (descricao.length < 2) return { ok: false, error: 'Informe uma descrição com pelo menos duas letras.' };
    patch.description = descricao.slice(0, 200);
  }
  if (args.valor != null) {
    const valor = Number(args.valor);
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'Informe um valor positivo para a despesa.' };
    patch.amount = round2(valor);
  }
  if (args.categoria != null) {
    const categoria = normalizeCategory(args.categoria);
    if (!categoria) return { ok: false, error: `Categoria inválida. Use uma destas: ${EXPENSE_CATEGORIES.join(', ')}.` };
    patch.category = categoria;
  }
  if (args.data != null) {
    const dataLocal = parseLocalDate(args.data, null);
    if (!dataLocal) return { ok: false, error: 'Data inválida. Use o formato AAAA-MM-DD.' };
    patch.date = dayRangeUtc(dataLocal).startIso;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'Diga o que quer alterar: descrição, valor, categoria ou data.' };
  }

  const { data, error } = await db
    .from('expenses')
    .update(patch)
    .eq('user_id', ownerUserId)
    .eq('id', despesaId)
    .select('id, description, amount, category, date')
    .single();
  if (error || !data) return { ok: false, error: 'Não consegui atualizar a despesa agora.' };

  return {
    ok: true,
    data: toExpenseSummary(data),
    before: toExpenseSummary(current),
    after: toExpenseSummary(data),
  };
}

/**
 * Exclui despesa existente. Guarda before para auditoria da pending action.
 */
export async function excluirDespesa(db, ownerUserId, args) {
  const despesaId = String(args.despesa_id || '').trim();
  if (!despesaId) return { ok: false, error: 'Preciso do id da despesa. Chame listar_despesas antes.' };

  const { data: current, error: loadError } = await db
    .from('expenses')
    .select('id, description, amount, category, date')
    .eq('user_id', ownerUserId)
    .eq('id', despesaId)
    .maybeSingle();
  if (loadError) return { ok: false, error: 'Não consegui carregar essa despesa agora.' };
  if (!current) return { ok: false, error: 'Não encontrei essa despesa.' };

  const { data, error } = await db
    .from('expenses')
    .delete()
    .eq('user_id', ownerUserId)
    .eq('id', despesaId)
    .select('id, description, amount, category, date')
    .single();
  if (error || !data) return { ok: false, error: 'Não consegui excluir a despesa agora.' };

  const before = toExpenseSummary(current);
  return { ok: true, data: before, before, after: null };
}
