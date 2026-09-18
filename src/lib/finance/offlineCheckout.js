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

/**
 * Reconstrói o estado de formulário do PDV a partir de uma confirmação de
 * venda pendente (`checkoutSubmission`) retomada de um rascunho (reload,
 * outra aba). Usada por `abrirModalPagamento` em `src/routes/app/+page.svelte`
 * para retomar a MESMA intenção de pagamento em vez de deixar a pessoa
 * escolher um pagamento diferente — o que geraria um payload distinto e
 * `selectCheckoutSubmission` lançaria "Há uma confirmação pendente...".
 *
 * Retorna `null` quando a submission não carrega `formState` (rascunho
 * legado, gravado antes deste campo existir) — nesse caso o chamador deve
 * preservar o comportamento antigo (abrir o modal vazio).
 *
 * `imprimirRecibo` não é restaurado a partir do formState (o payload da RPC
 * não depende dele e ele nunca foi gravado ali); a retomada sempre volta com
 * `false` como default seguro, para não reimprimir um recibo com dados
 * potencialmente obsoletos sem pedido explícito da pessoa.
 */
export function restoreCheckoutFormState(submission) {
    const formState = submission?.formState;
    if (!formState) return null;
    return {
        items: structuredClone(formState.items),
        formaPagamento: formState.formaPagamento,
        valorRecebido: formState.valorRecebido,
        multiPag: formState.multiPag,
        pagamentos: structuredClone(formState.pagamentos),
        pessoaFiadoId: formState.pessoaFiadoId,
        totalFinalVenda: formState.totalFinalVenda,
        valorDescontoVenda: formState.valorDescontoVenda,
        descontoTipoVenda: formState.descontoTipoVenda,
        tipoPedido: formState.tipoPedido,
        taxaEntregaInput: formState.taxaEntregaInput,
        taxasPlataformaVenda: formState.taxasPlataformaVenda,
        idCaixaAberto: submission?.payload?.id_caixa ?? null,
        imprimirRecibo: false
    };
}
