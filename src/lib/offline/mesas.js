import { readSnapshot, saveSnapshot, listOperations } from './operations.js';
import { getOfflineContext, submitOfflineOperation } from './runtime.js';
import { MESA_SNAPSHOT, projectMesaOperation } from '../finance/offlineMesas.js';
import { db } from '../offlineDb.js';

export async function loadMesaState(supabase, ownerUserId) {
    const cached = await readSnapshot(ownerUserId, MESA_SNAPSHOT);
    const initialOperations = await listOperations(ownerUserId);
    const pending = initialOperations.some(op => ['mesa', 'item', 'payment'].includes(op.entityType) && op.status !== 'acked');
    if (cached && (globalThis.navigator?.onLine === false || pending)) return cached;
    async function pages(table, select, filter = q => q) {
        const rows = [];
        for (let from = 0; ; from += 500) {
            const { data, error } = await filter(supabase.from(table).select(select).eq('id_usuario', ownerUserId)).order('id').range(from, from + 499);
            if (error) throw error;
            rows.push(...data); if (data.length < 500) return rows;
        }
    }
    try {
        const [mesas, comandas] = await Promise.all([pages('mesas', '*', q => q.eq('ativa', true)), pages('comandas', '*', q => q.eq('status', 'aberta'))]);
        async function forComandas(table, select) {
            const rows = [];
            for (let offset = 0; offset < comandas.length; offset += 100) rows.push(...await pages(table, select, q => q.in('id_comanda', comandas.slice(offset, offset + 100).map(c => c.id))));
            return rows;
        }
        const [itens, pagamentos, allocations] = await Promise.all([forComandas('comanda_itens', '*, produtos(nome)'), forComandas('comanda_pagamentos', '*'), forComandas('comanda_pagamento_itens', '*')]);
        const state = { mesas, details: {} };
        for (const comanda of comandas) state.details[comanda.id_mesa] = {
            mesa: mesas.find(m => m.id === comanda.id_mesa), comanda,
            itens: itens.filter(i => i.id_comanda === comanda.id).map(i => ({ ...i, nome_produto: i.nome_produto_na_venda || i.produtos?.nome || '(produto removido)' })),
            pagamentos: pagamentos.filter(p => p.id_comanda === comanda.id).map(p => ({ ...p, itens_alocados: allocations.filter(a => a.id_pagamento === p.id) }))
        };
        // A command committed while HTTP was loading must never be overwritten by this snapshot.
        return await db.transaction('rw', db.offline_operations, db.offline_snapshots, async () => {
            const latest = await listOperations(ownerUserId);
            if (latest.some(op => ['mesa', 'item', 'payment'].includes(op.entityType) && (op.status !== 'acked' || !initialOperations.some(old => old.operationId === op.operationId)))) return await readSnapshot(ownerUserId, MESA_SNAPSHOT) || state;
            await saveSnapshot(ownerUserId, MESA_SNAPSHOT, state);
            return state;
        });
    } catch (error) {
        if (cached && !['42501', 'PGRST301'].includes(error.code)) return cached;
        throw error;
    }
}

export async function submitMesaOperation(type, payload) {
    const context = getOfflineContext();
    const state = await readSnapshot(context.ownerUserId, MESA_SNAPSHOT);
    const detail = Object.values(state?.details || {}).find(d => d.comanda.id === payload.comandaId);
    const operations = await listOperations(context.ownerUserId);
    const caixaOpen = payload.id_caixa ? operations.find(op => op.type === 'caixa.open' && op.entityId === String(payload.id_caixa)) : null;
    const operationId = crypto.randomUUID();
    const operation = await submitOfflineOperation(type, payload.comandaId, payload, {
        operationId, entityType: 'mesa', baseRevision: type === 'mesa.open' ? null : Number(detail?.comanda.offline_revision || 0),
        dependencies: [...new Set([detail?.lastOperationId, caixaOpen?.operationId].filter(Boolean))],
        projection: { key: MESA_SNAPSHOT, update: current => projectMesaOperation(current, type, payload, operationId) }
    });
    return { operation, state: await readSnapshot(context.ownerUserId, MESA_SNAPSHOT) };
}
