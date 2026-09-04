import Dexie from 'dexie';
import { createClientSaleId } from './finance/saleOps.js';
import { isNetworkError } from './netStatus.js';

export const db = new Dexie('ZeloPDVDB');

// v1 — schema original
db.version(1).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, data, total, status', // status: 'aguardando'
    categorias: 'id, nome'
});

// v2 — adiciona tipo_pedido e taxa_entrega
db.version(2).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, data, total, status',
    categorias: 'id, nome'
});

// v3 — vendas_pendentes agora armazena { payload, createdAt, status }
//      payload é o JSON enviado direto pra RPC criar_venda_completa.
db.version(3).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, createdAt, status',
    categorias: 'id, nome'
});

// v4 — contextualiza a fila offline por owner/operator para replay seguro com subusuários
db.version(4).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, createdAt, status, ownerUserId, operatorUserId',
    categorias: 'id, nome'
});

// v5 — leitura offline-first: persiste subcategorias também, para que o filtro
//      de categoria/subcategoria funcione no cold-start sem rede.
db.version(5).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, createdAt, status, ownerUserId, operatorUserId',
    categorias: 'id, nome',
    subcategorias: 'id, id_categoria'
});

/**
 * Salva uma venda na fila de sincronização.
 *
 * Aceita formato novo: { payload } onde payload é o JSON pronto para a RPC
 * `criar_venda_completa`. Caller deve construir o payload via
 * `buildVendaPayload` em `$lib/finance/saleOps`.
 *
 * Para backward compat, ainda aceita o formato antigo (campos planos +
 * itens/pagamentos), guardando como veio. O sync detecta automaticamente
 * o formato e converte se necessário.
 */
export async function salvarVendaOffline(venda) {
    return await db.vendas_pendentes.add(prepareVendaOfflineRecord(venda));
}

export function prepareVendaOfflineRecord(venda) {
    const createdAt = venda?.createdAt || new Date().toISOString();
    const payload = venda?.payload
        ? { ...venda.payload, client_sale_id: venda.payload.client_sale_id || createClientSaleId() }
        : venda?.payload;
    return {
        ...venda,
        payload,
        ownerUserId: venda?.ownerUserId || venda?.payload?.owner_user_id || null,
        operatorUserId: venda?.operatorUserId || venda?.payload?.operador_id || null,
        createdAt,
        // Mantém `data` para leitura de registros legados.
        data: createdAt,
        status: 'aguardando'
    };
}

/**
 * Decide se uma falha ao chamar a RPC de venda deve entrar na fila offline.
 *
 * Importante: erros de regra de negócio do Supabase/Postgres (estoque
 * insuficiente, RLS, FK, payload inválido etc.) não podem virar venda offline.
 * A fila offline é só para falhas compatíveis com conexão/timeout.
 */
export function shouldQueueVendaOffline(error) {
    return isNetworkError(error);
}

/**
 * Obtém todas as vendas que ainda não foram sincronizadas
 */
export async function getVendasPendentes() {
    return await db.vendas_pendentes.where('status').equals('aguardando').toArray();
}

/**
 * Cache de produtos para busca offline.
 * Grava o objeto completo (inclui o join `categorias` e `estoque_atual`), então
 * o snapshot de estoque para validação offline vem junto de graça.
 */
export async function atualizarCacheProdutos(produtos, ownerUserId) {
    return replaceCatalogCache(db.produtos, produtos, ownerUserId);
}

async function replaceCatalogCache(table, rows, ownerUserId) {
    if (!ownerUserId) throw new Error('Titular obrigatório para salvar o catálogo offline.');
    return db.transaction('rw', table, async () => {
        await table.clear();
        await table.bulkAdd(rows.map((row) => ({ ...row, _cacheOwnerUserId: ownerUserId })));
    });
}

async function readCatalogCache(table, ownerUserId) {
    if (!ownerUserId) return [];
    // Legacy rows without a known owner must be refreshed online first.
    return table.filter((row) => row._cacheOwnerUserId === ownerUserId).toArray();
}

/**
 * Cache de categorias para render offline do filtro do PDV.
 */
export async function atualizarCacheCategorias(categorias, ownerUserId) {
    return replaceCatalogCache(db.categorias, categorias, ownerUserId);
}

/**
 * Cache de subcategorias para render offline do filtro do PDV.
 */
export async function atualizarCacheSubcategorias(subcategorias, ownerUserId) {
    return replaceCatalogCache(db.subcategorias, subcategorias, ownerUserId);
}

/**
 * Lê categorias do cache local (fallback offline).
 */
export async function buscarCategoriasLocal(ownerUserId) {
    return readCatalogCache(db.categorias, ownerUserId);
}

/**
 * Lê subcategorias do cache local (fallback offline).
 */
export async function buscarSubcategoriasLocal(ownerUserId) {
    return readCatalogCache(db.subcategorias, ownerUserId);
}

/**
 * Conta vendas aguardando sincronização (para indicador no PDV).
 */
export async function contarVendasPendentes(ownerUserId) {
    if (!ownerUserId) return 0;
    return db.vendas_pendentes.where('status').equals('aguardando')
        .and((row) => row.ownerUserId === ownerUserId).count();
}

/**
 * Constrói payload da RPC a partir do formato antigo (pré-v3) — best effort.
 * Retorna null se não tem dados mínimos.
 */
function legacyToPayload(record) {
    if (!record || record.payload) return null; // já é v3
    if (!record.itens?.length) return null;

    const pagamentos = (record.pagamentos || [])
        .map((p) => ({
            forma_pagamento: p.forma_pagamento || p.forma,
            valor: Number(p.valor || 0)
        }))
        .filter((p) => p.valor > 0);

    // Estoque: lista todos os itens com id_produto; o RPC filtra por controlar_estoque.
    const estoque = (record.itens || [])
        .filter((i) => i.id_produto)
        .map((i) => ({
            id_produto: i.id_produto,
            quantidade: Number(i.quantidade || 1)
        }));

    // Fiado: legacy não tinha esse campo separado, então inferimos.
    const fiados = [];
    if (record.forma_pagamento === 'fiado' && record.id_cliente && Number(record.valor_total || 0) > 0) {
        fiados.push({ id_pessoa: record.id_cliente, valor: Number(record.valor_total) });
    } else if (record.forma_pagamento === 'multiplo') {
        const fiadoRow = (record.pagamentos || []).find((p) => (p.forma_pagamento || p.forma) === 'fiado');
        if (fiadoRow?.pessoaId && Number(fiadoRow.valor || 0) > 0) {
            fiados.push({ id_pessoa: fiadoRow.pessoaId, valor: Number(fiadoRow.valor) });
        }
    }

    return {
        client_sale_id: record.client_sale_id || createClientSaleId(),
        valor_total: Number(record.valor_total || 0),
        forma_pagamento: record.forma_pagamento || 'dinheiro',
        valor_recebido: record.valor_recebido ?? null,
        valor_troco: Number(record.valor_troco || 0),
        valor_desconto: Number(record.valor_desconto || 0),
        desconto_tipo: record.desconto_tipo || null,
        tipo_pedido: record.tipo_pedido || 'retirada',
        taxa_entrega: Number(record.taxa_entrega || 0),
        id_caixa: record.id_caixa ?? null,
        id_cliente: record.id_cliente ?? null,
        itens: (record.itens || []).map((i) => ({
            id_produto: i.id_produto ?? null,
            quantidade: Number(i.quantidade || 1),
            nome_produto_na_venda: i.nome_produto_na_venda || i.nome || '',
            preco_unitario_na_venda: Number(i.preco_unitario_na_venda || i.preco || 0),
            ...(Array.isArray(i.modifiers) && i.modifiers.length ? { modifiers: i.modifiers } : {})
        })),
        pagamentos,
        estoque,
        fiados,
        created_at: record.data || record.createdAt
    };
}

/**
 * Sincroniza vendas pendentes via RPC atômica `criar_venda_completa`.
 * Cada venda vira UMA chamada que insere venda + itens + pagamentos +
 * decremento de estoque + débito de fiado em uma única transação Postgres.
 *
 * Vantagens vs. inserts manuais:
 *  - Atomicidade: rollback completo se qualquer passo falhar
 *  - Estoque e fiado são aplicados (eram pulados no fluxo antigo)
 *  - Caixa fechado tem fallback automático no servidor (atribui ao caixa
 *    aberto atual do usuário, ou null se nenhum aberto)
 *
 * Registros sincronizados com sucesso são deletados do IndexedDB.
 * Registros com falha permanecem como 'aguardando' para nova tentativa.
 */
export async function syncVendasPendentes(supabase, context = {}) {
    const ownerFilter = context?.ownerUserId || null;
    const operatorFallback = context?.operatorUserId || null;
    const pendentes = await getVendasPendentes();
    const logs = { success: 0, fail: 0, skipped: 0 };

    for (const vendaPendente of pendentes) {
        try {
            if (!ownerFilter || vendaPendente.ownerUserId !== ownerFilter) {
                logs.skipped++;
                continue;
            }

            // Compat: se for registro v1/v2, converte; v3 já tem .payload pronto.
            const originalPayload = vendaPendente.payload || legacyToPayload(vendaPendente);

            if (!originalPayload) {
                console.warn('[Sync] Venda pendente sem payload válido — pulando:', vendaPendente.id);
                logs.fail++;
                continue;
            }

            // Persist before sending: a timeout may occur after the server commits.
            // The transaction also makes concurrent tabs reuse the same key.
            const payload = await db.transaction('rw', db.vendas_pendentes, async () => {
                const current = await db.vendas_pendentes.get(vendaPendente.id);
                if (!current) return null;
                const stable = { ...(current.payload || originalPayload) };
                stable.client_sale_id ||= current.client_sale_id || createClientSaleId();
                await db.vendas_pendentes.update(current.id, { payload: stable });
                return stable;
            });
            if (!payload) { logs.skipped++; continue; }

            // Garante que created_at preserve a data original da venda offline
            if (!payload.created_at) {
                payload.created_at = vendaPendente.createdAt || vendaPendente.data;
            }
            if (!payload.client_sale_id) {
                payload.client_sale_id = vendaPendente.client_sale_id || createClientSaleId();
            }
            if (!payload.operador_id && (vendaPendente.operatorUserId || operatorFallback)) {
                payload.operador_id = vendaPendente.operatorUserId || operatorFallback;
            }

            const { data, error } = await supabase.rpc('criar_venda_completa', {
                p_payload: payload
            });
            if (error) throw error;
            if (!data?.id) throw new Error('RPC retornou sem ID — venda não persistida.');

            await db.vendas_pendentes.delete(vendaPendente.id);
            logs.success++;
        } catch (err) {
            console.error('Falha ao sincronizar venda offline:', err);
            logs.fail++;
        }
    }

    return logs;
}

/**
 * Busca produtos no cache local
 */
export async function buscarProdutosLocal(termo = '', ownerUserId) {
    const rows = await readCatalogCache(db.produtos, ownerUserId);
    const t = termo.toLowerCase();
    return t ? rows.filter((p) => String(p.nome || '').toLowerCase().includes(t)) : rows;
}
