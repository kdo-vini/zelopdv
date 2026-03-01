import Dexie from 'dexie';

export const db = new Dexie('ZeloPDVDB');

// v1 — schema original
db.version(1).stores({
    produtos: 'id, nome, preco, categoria_id',
    vendas_pendentes: '++id, data, total, status', // status: 'aguardando'
    categorias: 'id, nome'
});

// Como adicionar versões futuras:
//
// db.version(2).stores({
//     vendas_pendentes: '++id, data, total, status, novo_campo'
// }).upgrade(tx => {
//     return tx.table('vendas_pendentes').toCollection().modify(v => {
//         v.novo_campo = valorPadrao;
//     });
// });

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
 * Cache de produtos para busca offline
 */
export async function atualizarCacheProdutos(produtos) {
    await db.produtos.clear();
    return await db.produtos.bulkAdd(produtos);
}

/**
 * Sincroniza vendas pendentes com o Supabase.
 * Registros sincronizados com sucesso são deletados do IndexedDB.
 * Registros com falha permanecem como 'aguardando' para nova tentativa.
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

            // 4. Deletar do IndexedDB — o registro oficial agora está no Supabase
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
 * Remove vendas pendentes mais antigas que `diasMaximos` que nunca foram sincronizadas.
 * Use como limpeza de segurança para registros presos (ex.: caixa deletado no servidor).
 */
export async function limparVendasAntigas(diasMaximos = 30) {
    const limite = new Date();
    limite.setDate(limite.getDate() - diasMaximos);
    const limiteISO = limite.toISOString();

    return await db.vendas_pendentes
        .where('data')
        .below(limiteISO)
        .delete();
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
