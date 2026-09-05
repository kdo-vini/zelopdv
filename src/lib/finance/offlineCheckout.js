import { canonicalJSON } from '../offline/operations.js';
import { pizzaStockRequirements } from '../pizza.js';
import { somarQuantidadePorEstoque } from '../stock.js';
import { extractEffectiveQty } from './saleOps.js';

export function validateLocalCartStock(items, products) {
    const all = new Map();
    for (const p of products) {
        all.set(p.id, p);
        for (const linked of p.pizzaStockProducts || []) all.set(linked.id, linked);
        for (const group of p.modifierGroups || []) for (const option of group.options || []) if (option.linkedProduct) all.set(option.linkedProduct.id, option.linkedProduct);
    }
    const requirements = items.flatMap(item => pizzaStockRequirements({ productId: item.id_produto, quantity: extractEffectiveQty(item), pizza: item.pizza, modifiers: item.modifiers }));
    if (requirements.some(r => !all.has(r.id_produto))) return 'Produto não disponível no catálogo preparado. Atualize o catálogo antes de confirmar.';
    const insufficient = somarQuantidadePorEstoque(requirements, [...all.values()]).find(r => r.quantidade > r.disponivel);
    return insufficient ? `Estoque insuficiente para ${insufficient.nome}. Disponível neste aparelho: ${insufficient.disponivel}.` : '';
}

export function selectCheckoutSubmission(candidate, existing) {
    if (existing && canonicalJSON(candidate.payload) !== canonicalJSON(existing.payload)) throw new Error('Há uma confirmação pendente desta venda. Mantenha os dados originais para repetir a confirmação e conferir o resultado.');
    return existing || candidate;
}
