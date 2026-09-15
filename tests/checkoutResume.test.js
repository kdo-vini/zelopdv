import { expect, it, describe } from 'vitest';
import { buildVendaPayload, createClientSaleId } from '../src/lib/finance/saleOps.js';
import { selectCheckoutSubmission, restoreCheckoutFormState } from '../src/lib/finance/offlineCheckout.js';

/**
 * Mirrors the candidate construction confirmarVenda() does in
 * src/routes/app/+page.svelte (lines ~1260-1278): builds the payload via the
 * real buildVendaPayload and attaches the same formState shape that gets
 * persisted to the draft. Test-only glue — no payload logic is reimplemented
 * here, it all comes from buildVendaPayload/selectCheckoutSubmission.
 */
function buildCandidateFromState(state, { checkoutIntent, existingSubmission, operadorId = 'operador-1' }) {
  const candidate = buildVendaPayload({
    clientSaleId: checkoutIntent,
    createdAt: existingSubmission?.payload?.created_at || '2026-09-15T12:00:00.000Z',
    formaPagamento: state.multiPag ? 'multiplo' : state.formaPagamento,
    valorRecebido: state.valorRecebido,
    pagamentos: state.pagamentos,
    totalFinal: state.totalFinalVenda,
    valorDesconto: state.valorDescontoVenda,
    descontoTipo: state.descontoTipoVenda,
    taxaEntrega: state.tipoPedido === 'delivery' ? Number(state.taxaEntregaInput || 0) : 0,
    tipoPedido: state.tipoPedido,
    idCaixa: state.idCaixaAberto,
    idCliente: !state.multiPag && state.formaPagamento === 'fiado' ? state.pessoaFiadoId : null,
    itens: state.items,
    taxasPlataforma: state.taxasPlataformaVenda,
    operadorId
  });
  candidate.formState = structuredClone({
    items: state.items,
    formaPagamento: state.formaPagamento,
    valorRecebido: state.valorRecebido,
    multiPag: state.multiPag,
    pagamentos: state.pagamentos,
    pessoaFiadoId: state.pessoaFiadoId,
    totalFinalVenda: state.totalFinalVenda,
    valorDescontoVenda: state.valorDescontoVenda,
    descontoTipoVenda: state.descontoTipoVenda,
    tipoPedido: state.tipoPedido,
    taxaEntregaInput: state.taxaEntregaInput,
    taxasPlataformaVenda: state.taxasPlataformaVenda
  });
  return candidate;
}

/** Turns a restoreCheckoutFormState() result back into the shape confirmarVenda() reads from page state. */
function stateFromRestored(restored) {
  return {
    items: restored.items,
    formaPagamento: restored.formaPagamento,
    valorRecebido: restored.valorRecebido,
    multiPag: restored.multiPag,
    pagamentos: restored.pagamentos,
    pessoaFiadoId: restored.pessoaFiadoId,
    totalFinalVenda: restored.totalFinalVenda,
    valorDescontoVenda: restored.valorDescontoVenda,
    descontoTipoVenda: restored.descontoTipoVenda,
    tipoPedido: restored.tipoPedido,
    taxaEntregaInput: restored.taxaEntregaInput,
    taxasPlataformaVenda: restored.taxasPlataformaVenda,
    idCaixaAberto: restored.idCaixaAberto
  };
}

/** Simulates the draft round-trip through IndexedDB/sessionStorage (structural clone via JSON). */
function roundTripThroughDraft(submission) {
  return JSON.parse(JSON.stringify(submission));
}

describe('restoreCheckoutFormState', () => {
  it('returns null when the submission carries no formState (legacy draft)', () => {
    expect(restoreCheckoutFormState(null)).toBeNull();
    expect(restoreCheckoutFormState(undefined)).toBeNull();
    expect(restoreCheckoutFormState({ payload: { id_caixa: 1 }, settlement: {} })).toBeNull();
  });

  it('defaults imprimirRecibo to false — it is never read from formState', () => {
    const checkoutIntent = createClientSaleId();
    const candidate = buildCandidateFromState(
      {
        items: [{ id_produto: 1, nome: 'Produto A', preco: 10, quantidade: 1 }],
        formaPagamento: 'dinheiro',
        valorRecebido: 10,
        multiPag: false,
        pagamentos: [],
        pessoaFiadoId: '',
        totalFinalVenda: 10,
        valorDescontoVenda: 0,
        descontoTipoVenda: null,
        tipoPedido: 'retirada',
        taxaEntregaInput: 0,
        taxasPlataformaVenda: [],
        idCaixaAberto: 1
      },
      { checkoutIntent, existingSubmission: null }
    );
    const restored = restoreCheckoutFormState(candidate);
    expect(restored.imprimirRecibo).toBe(false);
  });
});

describe('resuming a pending checkout after reload', () => {
  it('single payment: restored state rebuilds the identical payload, selectCheckoutSubmission does not throw', () => {
    const checkoutIntent = createClientSaleId();
    const initialState = {
      items: [{ id_produto: 1, nome: 'Produto A', preco: 10, quantidade: 2 }],
      formaPagamento: 'dinheiro',
      valorRecebido: 25,
      multiPag: false,
      pagamentos: [],
      pessoaFiadoId: '',
      totalFinalVenda: 20,
      valorDescontoVenda: 0,
      descontoTipoVenda: null,
      tipoPedido: 'retirada',
      taxaEntregaInput: 0,
      taxasPlataformaVenda: [],
      idCaixaAberto: 42
    };

    // 1. confirmarVenda() builds the first candidate and it becomes checkoutSubmission.
    const firstCandidate = buildCandidateFromState(initialState, { checkoutIntent, existingSubmission: null });
    const checkoutSubmission = selectCheckoutSubmission(firstCandidate, null);
    expect(checkoutSubmission).toBe(firstCandidate);

    // 2. Reload: the draft (comanda + checkoutSubmission) comes back through Dexie/sessionStorage.
    const submissionAfterReload = roundTripThroughDraft(checkoutSubmission);

    // 3. abrirModalPagamento() restores page state from formState via the pure helper.
    const restored = restoreCheckoutFormState(submissionAfterReload);
    expect(restored).not.toBeNull();
    expect(restored.idCaixaAberto).toBe(42);
    expect(restored.formaPagamento).toBe('dinheiro');
    expect(restored.items).toEqual(initialState.items);
    // Cloned, not aliased, per the task's structuredClone requirement for items/pagamentos.
    expect(restored.items).not.toBe(submissionAfterReload.formState.items);

    // 4. confirmarVenda() runs again from the restored state (same checkoutIntent, carried
    //    separately via draft.intent — not part of formState, exactly like production).
    const retryState = stateFromRestored(restored);
    const retryCandidate = buildCandidateFromState(retryState, {
      checkoutIntent,
      existingSubmission: submissionAfterReload
    });

    // 5. selectCheckoutSubmission must NOT throw and must return the original pending submission.
    const finalSubmission = selectCheckoutSubmission(retryCandidate, submissionAfterReload);
    expect(finalSubmission).toBe(submissionAfterReload);
    expect(finalSubmission.payload.client_sale_id).toBe(checkoutSubmission.payload.client_sale_id);
    expect(finalSubmission.payload.client_sale_id).toBe(checkoutIntent);
  });

  it('multi-payment with fiado: restored pagamentos/fiado are preserved and selectCheckoutSubmission does not throw', () => {
    const checkoutIntent = createClientSaleId();
    const initialState = {
      items: [{ id_produto: 5, nome: 'Produto B', preco: 30, quantidade: 1 }],
      formaPagamento: null,
      valorRecebido: 0,
      multiPag: true,
      pagamentos: [
        { forma: 'dinheiro', valor: 10 },
        { forma: 'fiado', valor: 20, pessoaId: 'pessoa-1' }
      ],
      pessoaFiadoId: '',
      totalFinalVenda: 30,
      valorDescontoVenda: 0,
      descontoTipoVenda: null,
      tipoPedido: 'retirada',
      taxaEntregaInput: 0,
      taxasPlataformaVenda: [],
      idCaixaAberto: 7
    };

    const firstCandidate = buildCandidateFromState(initialState, { checkoutIntent, existingSubmission: null });
    const checkoutSubmission = selectCheckoutSubmission(firstCandidate, null);

    // Sanity: the fiado debit and multi-pay row landed in the original payload.
    expect(checkoutSubmission.payload.forma_pagamento).toBe('multiplo');
    expect(checkoutSubmission.payload.id_cliente).toBe('pessoa-1');
    expect(checkoutSubmission.payload.fiados).toEqual([{ id_pessoa: 'pessoa-1', valor: 20 }]);
    expect(checkoutSubmission.payload.pagamentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forma_pagamento: 'dinheiro', valor: 10 }),
        expect.objectContaining({ forma_pagamento: 'fiado', valor: 20 })
      ])
    );

    const submissionAfterReload = roundTripThroughDraft(checkoutSubmission);
    const restored = restoreCheckoutFormState(submissionAfterReload);

    expect(restored.multiPag).toBe(true);
    expect(restored.pagamentos).toEqual(initialState.pagamentos);
    expect(restored.pagamentos).not.toBe(submissionAfterReload.formState.pagamentos);
    expect(restored.idCaixaAberto).toBe(7);

    const retryState = stateFromRestored(restored);
    const retryCandidate = buildCandidateFromState(retryState, {
      checkoutIntent,
      existingSubmission: submissionAfterReload
    });

    const finalSubmission = selectCheckoutSubmission(retryCandidate, submissionAfterReload);
    expect(finalSubmission).toBe(submissionAfterReload);
    expect(finalSubmission.payload.fiados).toEqual([{ id_pessoa: 'pessoa-1', valor: 20 }]);
    expect(finalSubmission.payload.client_sale_id).toBe(checkoutIntent);
  });

  it('choosing a different payment on resume would diverge and must still be rejected (guards against a stale retry)', () => {
    const checkoutIntent = createClientSaleId();
    const initialState = {
      items: [{ id_produto: 1, nome: 'Produto A', preco: 10, quantidade: 1 }],
      formaPagamento: 'dinheiro',
      valorRecebido: 10,
      multiPag: false,
      pagamentos: [],
      pessoaFiadoId: '',
      totalFinalVenda: 10,
      valorDescontoVenda: 0,
      descontoTipoVenda: null,
      tipoPedido: 'retirada',
      taxaEntregaInput: 0,
      taxasPlataformaVenda: [],
      idCaixaAberto: 1
    };
    const firstCandidate = buildCandidateFromState(initialState, { checkoutIntent, existingSubmission: null });
    const checkoutSubmission = selectCheckoutSubmission(firstCandidate, null);
    const submissionAfterReload = roundTripThroughDraft(checkoutSubmission);

    // Simulate the bug this fix prevents: the modal opened empty and the person picked "pix" instead.
    const divergentState = { ...stateFromRestored(restoreCheckoutFormState(submissionAfterReload)), formaPagamento: 'pix', valorRecebido: 0 };
    const divergentCandidate = buildCandidateFromState(divergentState, { checkoutIntent, existingSubmission: submissionAfterReload });

    expect(() => selectCheckoutSubmission(divergentCandidate, submissionAfterReload)).toThrow('confirmação pendente');
  });
});
