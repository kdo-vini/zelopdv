import Dexie from 'dexie';

export const db = new Dexie('ZeloPDVDB');

// Define o esquema do banco de dados local
db.version(1).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, data, total, status', // status: 'aguardando' | 'sincronizado'
    categorias: 'id, nome'
});

/**
 * Salva uma venda na fila de sincronização
 */
export async function salvarVendaOffline(venda) {
    return await db.vendas_pendentes.add({
        ...venda,
        data: new Date().toISOString(),
        status: 'aguardando'
    });
}

/**
 * Obtém todas as vendas que ainda não foram sincronizadas
 */
export async function getVendasPendentes() {
    return await db.vendas_pendentes.where('status').equals('aguardando').toArray();
}

/**
 * Marca uma venda como sincronizada
 */
export async function marcarComoSincronizada(id) {
    return await db.vendas_pendentes.update(id, { status: 'sincronizado' });
}

/**
 * Cache de produtos para busca offline
 */
export async function atualizarCacheProdutos(produtos) {
    await db.produtos.clear();
    return await db.produtos.bulkAdd(produtos);
}

/**
 * Sincroniza vendas pendentes com o Supabase
 */
export async function syncVendasPendentes(supabase) {
    const pendentes = await getVendasPendentes();
    const logs = { success: 0, fail: 0 };

    for (const vendaPendente of pendentes) {
        try {
            // 1. Inserir a venda
            const { data: venda, error: vendaError } = await supabase
                .from('vendas')
                .insert({
                    valor_total: vendaPendente.valor_total,
                    forma_pagamento: vendaPendente.forma_pagamento,
                    valor_recebido: vendaPendente.valor_recebido,
                    valor_troco: vendaPendente.valor_troco,
                    id_usuario: vendaPendente.id_usuario,
                    id_caixa: vendaPendente.id_caixa,
                    id_cliente: vendaPendente.id_cliente,
                    created_at: vendaPendente.data // Preserva a data original da venda offline
                })
                .select('id')
                .single();

            if (vendaError) throw vendaError;

            // 2. Inserir os itens
            const itens = vendaPendente.itens.map(i => ({
                ...i,
                id_venda: venda.id
            }));
            const { error: itensError } = await supabase.from('vendas_itens').insert(itens);
            if (itensError) throw itensError;

            // 3. Inserir pagamentos (se houver)
            if (vendaPendente.pagamentos && vendaPendente.pagamentos.length > 0) {
                const pags = vendaPendente.pagamentos.map(p => ({
                    ...p,
                    id_venda: venda.id
                }));
                const { error: pagsError } = await supabase.from('vendas_pagamentos').insert(pags);
                if (pagsError) throw pagsError;
            }

            // 4. Marcar como sincronizada
            await marcarComoSincronizada(vendaPendente.id);
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
export async function buscarProdutosLocal(termo = '') {
    if (!termo) return await db.produtos.toArray();

    const t = termo.toLowerCase();
    return await db.produtos
        .filter(p => p.nome.toLowerCase().includes(t))
        .toArray();
}
