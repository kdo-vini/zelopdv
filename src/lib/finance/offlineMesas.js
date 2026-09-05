export const MESA_SNAPSHOT = 'mesas:state';

/** Pure projection used inside the same IndexedDB transaction as its durable command. */
export function projectMesaOperation(snapshot, type, payload, operationId) {
    const state = structuredClone(snapshot || { mesas: [], details: {} });
    if (type === 'mesa.open') {
        if (state.details[payload.mesaId]?.comanda?.status === 'aberta') throw new Error('Esta mesa já possui uma comanda neste aparelho.');
        const mesa = state.mesas.find(m => String(m.id) === String(payload.mesaId));
        if (!mesa) throw new Error('Mesa não preparada neste aparelho.');
        mesa.status = 'ocupada';
        state.details[payload.mesaId] = { mesa: { ...mesa }, comanda: { id: payload.comandaId, id_mesa: payload.mesaId, status: 'aberta', num_pessoas: 1, aberta_em: new Date().toISOString(), offline_revision: 1 }, itens: [], pagamentos: [], lastOperationId: operationId };
        return state;
    }
    const entry = Object.entries(state.details).find(([, d]) => d.comanda?.id === payload.comandaId);
    if (!entry || entry[1].comanda.status !== 'aberta') throw new Error('Comanda não está aberta neste aparelho.');
    const [mesaId, detail] = entry;
    if (type === 'mesa.item.add' || type === 'mesa.item.delta') {
        const existing = detail.itens.find(i => i.id === payload.itemId);
        const quantity = Number(existing?.quantidade || 0) + Number(payload.delta);
        const paid = detail.pagamentos.flatMap(p => p.itens_alocados || []).filter(i => i.id_comanda_item === payload.itemId).reduce((sum, i) => sum + Number(i.quantidade), 0);
        if (quantity < paid || quantity < 0) throw new Error('A quantidade não pode ser menor que os itens já pagos.');
        if (existing) { existing.quantidade = quantity; detail.itens = detail.itens.filter(i => i.quantidade > 0); }
        else if (quantity > 0) detail.itens.push({ id: payload.itemId, id_comanda: payload.comandaId, id_produto: payload.produtoId, quantidade: quantity, preco_unitario: payload.precoUnitario, nome_produto: payload.nome, nome_produto_na_venda: payload.nome, modifiers: payload.modifiers || [], ...(payload.pizza ? { pizza: payload.pizza } : {}), observacao: payload.observacao || '', created_at: new Date().toISOString() });
    } else if (type === 'mesa.payment.add') {
        detail.pagamentos.push({ id: payload.paymentId, id_comanda: payload.comandaId, id_caixa: payload.id_caixa || null, forma_pagamento: payload.forma_pagamento, valor: payload.valor, id_pessoa: payload.id_pessoa, itens_alocados: (payload.allocations || []).map(row => ({ ...row, id_comanda_item: row.itemId || row.id_comanda_item })), created_at: new Date().toISOString() });
    } else if (type === 'mesa.payment.remove') detail.pagamentos = detail.pagamentos.filter(p => p.id !== payload.paymentId);
    else if (type === 'mesa.update') Object.assign(detail.comanda, payload.changes);
    else if (type === 'mesa.close' || type === 'mesa.cancel') {
        if (type === 'mesa.cancel' && detail.pagamentos.length) throw new Error('Confira os pagamentos antes de cancelar a comanda.');
        detail.comanda.status = type === 'mesa.close' ? 'fechada' : 'cancelada';
        detail.mesa.status = 'livre';
        state.mesas.find(m => String(m.id) === String(mesaId)).status = 'livre';
    } else if (type === 'mesa.transfer') {
        const dest = state.mesas.find(m => String(m.id) === String(payload.mesaId || payload.mesaDestinoId));
        if (!dest || dest.status !== 'livre') throw new Error('Mesa de destino não está livre neste aparelho.');
        state.mesas.find(m => String(m.id) === String(mesaId)).status = 'livre';
        dest.status = 'ocupada';
        detail.mesa = { ...dest }; detail.comanda.id_mesa = dest.id;
        state.details[dest.id] = detail; delete state.details[mesaId];
    } else throw new Error('Operação de mesa desconhecida.');
    detail.lastOperationId = operationId;
    detail.comanda.offline_revision = Number(detail.comanda.offline_revision || 0) + 1;
    return state;
}
