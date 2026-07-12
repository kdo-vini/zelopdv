/**
 * @file Fetchers — interface with Supabase for the intelligence engine.
 * All functions accept a supabaseAdmin client and return plain objects.
 * No business logic. No signal detection. Just I/O.
 */

import { SIGNAL_THRESHOLDS } from './config.js';
import { isSubscriptionActiveStrict } from '../../subscriptionStatus.js';

/**
 * @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient
 */

/** PostgREST corta resultados em 1000 rows — toda leitura potencialmente grande pagina. */
const PAGE_SIZE = 1000;
/** Tamanho de lote para filtros .in() (limite de URL do PostgREST). */
const IN_CHUNK_SIZE = 500;

/**
 * Executa uma query paginada até esgotar (padrão de relatorios/+page.svelte:740).
 * @param {function(number, number): any} buildQuery - (from, to) → query Supabase
 * @returns {Promise<Array>}
 */
async function fetchAllPages(buildQuery) {
  const out = [];
  let page = 0;
  for (;;) {
    const { data, error } = await buildQuery(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

/**
 * Busca todas as linhas de uma tabela dependente por id_venda,
 * em chunks de .in() e paginando cada chunk.
 * @param {SupabaseClient} db
 * @param {string} table
 * @param {string} columns
 * @param {number[]} vendaIds
 * @returns {Promise<Array>}
 */
async function fetchAllByVendaIds(db, table, columns, vendaIds) {
  if (vendaIds.length === 0) return [];
  const out = [];
  for (let i = 0; i < vendaIds.length; i += IN_CHUNK_SIZE) {
    const chunk = vendaIds.slice(i, i + IN_CHUNK_SIZE);
    const rows = await fetchAllPages((from, to) =>
      db.from(table).select(columns).in('id_venda', chunk).order('id_venda').range(from, to)
    );
    out.push(...rows);
  }
  return out;
}

/**
 * Lista empresas com intelligence habilitado.
 * @param {SupabaseClient} db
 * @returns {Promise<Array<{id: string, nome_exibicao?: string, razao_social?: string}>>}
 */
export async function fetchIntelligenceEnabledCompanies(db) {
  // empresa_perfil chaveia o owner por `user_id` (não `id_usuario`, que é a
  // convenção das tabelas operacionais). Ver discovery §1.7.
  const enabledRows = await fetchAllPages((from, to) => db
    .from('empresa_perfil')
    .select('user_id, nome_exibicao, razao_social')
    .not('intelligence_enabled_at', 'is', null)
    .order('user_id')
    .range(from, to));
  const enabledIds = enabledRows.map((row) => row.user_id);
  if (enabledIds.length === 0) return [];

  // Universo prometido pelo plano: flag ligada E assinatura ativa/trial.
  // "Última linha vence" em subscriptions — qualquer linha ativa conta.
  const subscriptions = [];
  for (let i = 0; i < enabledIds.length; i += IN_CHUNK_SIZE) {
    const userIds = enabledIds.slice(i, i + IN_CHUNK_SIZE);
    const rows = await fetchAllPages((from, to) => db
      .from('subscriptions')
      .select('user_id, status, current_period_end, manually_extended_until, updated_at')
      .in('user_id', userIds)
      .order('user_id')
      .order('updated_at', { ascending: false })
      .range(from, to));
    subscriptions.push(...rows);
  }

  const enabledProfiles = new Map(enabledRows.map((row) => [row.user_id, row]));
  return selectEligibleCompanyIds(enabledIds, subscriptions).map(({ id }) => {
    const profile = enabledProfiles.get(id) || {};
    return { id, nome_exibicao: profile.nome_exibicao, razao_social: profile.razao_social };
  });
}

/**
 * Selects companies whose latest subscription is active according to the
 * canonical entitlement rule. Kept pure so historical-row regressions are
 * covered without relying on PostgREST mocks.
 */
export function selectEligibleCompanyIds(enabledIds, subscriptions, now = new Date()) {
  const latestByUser = new Map();
  for (const subscription of subscriptions) {
    const existing = latestByUser.get(subscription.user_id);
    if (!existing || new Date(subscription.updated_at || 0) > new Date(existing.updated_at || 0)) {
      latestByUser.set(subscription.user_id, subscription);
    }
  }

  return enabledIds
    .filter((id) => isSubscriptionActiveStrict(latestByUser.get(id), now))
    .map((id) => ({ id }));
}

/**
 * Checagem barata de atividade: a empresa teve ao menos 1 venda desde sinceIso?
 * Usada como gate para pular empresas mortas antes do pipeline completo.
 * @param {SupabaseClient} db
 * @param {string} userId
 * @param {string} sinceIso
 * @returns {Promise<boolean>}
 */
export async function hasRecentSales(db, userId, sinceIso) {
  const { data, error } = await db
    .from('vendas')
    .select('id')
    .eq('id_usuario', userId)
    .gte('created_at', sinceIso)
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
}

/**
 * Busca vendas de uma empresa em um range de datas (UTC).
 * Vendas excluídas não precisam de filtro: o app faz HARD DELETE (não existe
 * coluna de soft delete em `vendas` — discovery §1.1); exclusões dentro da
 * janela de recompute D-3..D-1 são absorvidas pelo upsert do snapshot.
 * @param {SupabaseClient} db
 * @param {string} userId
 * @param {string} startIso
 * @param {string} endIso
 * @returns {Promise<Array>}
 */
export async function fetchVendas(db, userId, startIso, endIso) {
  return fetchAllPages((from, to) =>
    db
      .from('vendas')
      .select('id, id_usuario, valor_total, forma_pagamento, created_at, valor_desconto, tipo_pedido, taxa_entrega')
      .eq('id_usuario', userId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('id', { ascending: true })
      .range(from, to)
  );
}

/**
 * @param {SupabaseClient} db
 * @param {number[]} vendaIds
 * @returns {Promise<Array>}
 */
export async function fetchVendasItens(db, vendaIds) {
  return fetchAllByVendaIds(
    db,
    'vendas_itens',
    'id_venda, id_produto, nome_produto_na_venda, quantidade, preco_unitario_na_venda',
    vendaIds
  );
}

/**
 * @param {SupabaseClient} db
 * @param {number[]} vendaIds
 * @returns {Promise<Array>}
 */
export async function fetchVendasPagamentos(db, vendaIds) {
  return fetchAllByVendaIds(db, 'vendas_pagamentos', 'id_venda, forma_pagamento, forma, valor', vendaIds);
}

/**
 * @param {SupabaseClient} db
 * @param {number[]} vendaIds
 * @returns {Promise<Array>}
 */
export async function fetchVendasTaxas(db, vendaIds) {
  return fetchAllByVendaIds(db, 'vendas_taxas_plataforma', 'id_venda, plataforma_id, valor_taxa, valor_bruto', vendaIds);
}

/**
 * @param {SupabaseClient} db
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchCaixaFechamentos(db, userId) {
  const { data, error } = await db
    .from('caixa_fechamentos')
    .select('data_fechamento, diferenca')
    .eq('id_usuario', userId)
    .order('data_fechamento', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

/**
 * @param {SupabaseClient} db
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchProdutosEstoque(db, userId) {
  const { data, error } = await db
    .from('produtos')
    .select('id, nome, estoque_atual, controlar_estoque')
    .eq('id_usuario', userId);

  if (error) throw error;
  return data || [];
}

/**
 * @param {SupabaseClient} db
 * @param {string} userId
 * @returns {Promise<Array<{id: number, data_abertura: string, valor_inicial: number|null}>>}
 */
export async function fetchCaixasAbertos(db, userId) {
  const { data, error } = await db
    .from('caixas')
    .select('id, data_abertura, valor_inicial')
    .eq('id_usuario', userId)
    .is('data_fechamento', null);

  if (error) throw error;
  return data || [];
}

/**
 * @param {SupabaseClient} db
 * @param {string} userId
 * @returns {Promise<Array<{nome: string, saldo_fiado: number}>>}
 */
export async function fetchTopDevedores(db, userId) {
  const { data, error } = await db
    .from('pessoas')
    .select('nome, saldo_fiado')
    .eq('id_usuario', userId)
    .gt('saldo_fiado', 0)
    .order('saldo_fiado', { ascending: false })
    .limit(3);

  if (error) throw error;
  return data || [];
}

/**
 * Soma o saldo de fiado em aberto de TODOS os clientes da empresa.
 * Não confundir com fetchTopDevedores (limit 3, só para o evidence):
 * o snapshot `fiado_saldo_total` precisa do total real.
 * Paginado (default do PostgREST é 1000 rows).
 * @param {SupabaseClient} db
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function fetchSaldoFiadoTotal(db, userId) {
  const pageSize = 1000;
  let total = 0;
  let page = 0;
  for (;;) {
    const { data, error } = await db
      .from('pessoas')
      .select('saldo_fiado')
      .eq('id_usuario', userId)
      .gt('saldo_fiado', 0)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    for (const row of rows) total += Number(row.saldo_fiado) || 0;
    if (rows.length < pageSize) break;
    page++;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Upsert de snapshot diário (único por user x date).
 * @param {SupabaseClient} db
 * @param {Object} snapshot
 * @returns {Promise<void>}
 */
export async function upsertSnapshot(db, snapshot) {
  const { error } = await db
    .from('business_daily_snapshots')
    .upsert(snapshot, { onConflict: 'user_id,snapshot_date' });

  if (error) throw error;
}

/**
 * Busca snapshots existentes para uma empresa (para baseline).
 * @param {SupabaseClient} db
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function fetchSnapshots(db, userId, limit = 56) {
  const { data, error } = await db
    .from('business_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Busca snapshots a partir de uma data (para recompute).
 * @param {SupabaseClient} db
 * @param {string} userId
 * @param {string} sinceDate
 * @returns {Promise<Array>}
 */
export async function fetchSnapshotsSince(db, userId, sinceDate) {
  const { data, error } = await db
    .from('business_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Insere sinais em lote (com user_id e signal_date).
 * Usa insert ignorando conflitos (onConflict dedupe_key).
 * @param {SupabaseClient} db
 * @param {Array} signals
 * @returns {Promise<{inserted: number, errors: number}>}
 */
export async function insertSignals(db, signals) {
  if (signals.length === 0) return { inserted: 0, errors: 0 };

  // .select('id') com ignoreDuplicates retorna só as linhas realmente inseridas —
  // sem ele, re-execuções supercontariam signals_created.
  const { data, error } = await db
    .from('business_signals')
    .upsert(signals, {
      onConflict: 'user_id,signal_date,dedupe_key',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    console.error('[intelligence] Erro ao inserir sinais:', error.message);
    return { inserted: 0, errors: signals.length };
  }
  return { inserted: (data || []).length, errors: 0 };
}

/**
 * Busca a data do último sinal para cada dedupe_key de uma empresa.
 * @param {SupabaseClient} db
 * @param {string} userId
 * @param {string[]} dedupeKeys
 * @returns {Promise<Map<string, string>>} dedupe_key → signal_date
 */
export async function fetchLastSignalDates(db, userId, dedupeKeys) {
  if (dedupeKeys.length === 0) return new Map();

  const rows = [];
  for (let i = 0; i < dedupeKeys.length; i += IN_CHUNK_SIZE) {
    const keys = dedupeKeys.slice(i, i + IN_CHUNK_SIZE);
    const chunkRows = await fetchAllPages((from, to) => db
      .from('business_signals')
      .select('dedupe_key, signal_date')
      .eq('user_id', userId)
      .in('dedupe_key', keys)
      .order('dedupe_key')
      .order('signal_date', { ascending: false })
      .range(from, to));
    rows.push(...chunkRows);
  }

  // Pega a primeira (mais recente) de cada key
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.dedupe_key)) {
      map.set(row.dedupe_key, row.signal_date);
    }
  }
  return map;
}

/**
 * Cria um registro de execução.
 * @param {SupabaseClient} db
 * @param {Object} run
 * @returns {Promise<number|null>} run id
 */
export async function insertIntelligenceRun(db, run) {
  const { data, error } = await db
    .from('business_intelligence_runs')
    .insert(run)
    .select('id')
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Atualiza um registro de execução (finaliza).
 * @param {SupabaseClient} db
 * @param {number} runId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateIntelligenceRun(db, runId, updates) {
  const { error } = await db
    .from('business_intelligence_runs')
    .update(updates)
    .eq('id', runId);

  if (error) throw error;
}
