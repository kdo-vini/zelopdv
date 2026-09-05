// Diagnostic characterization, NOT acceptance tests for working offline UX.
// Execute original function ASTs with simulated network boundaries; no DB writes.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parse } from 'svelte/compiler';
import { describe, it, expect, vi } from 'vitest';

function loadFunction(path, name, state) {
  const source = readFileSync(path, 'utf8');
  const node = parse(source).instance.content.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  if (!node) throw new Error(`Function missing: ${name}`);
  const ctx = createContext(state);
  runInContext(source.slice(node.start, node.end), ctx);
  return { ctx, call: (...args) => ctx[name](...args) };
}

function query(result) {
  const q = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'maybeSingle', 'single']) q[method] = () => q;
  return q;
}

describe('offline audit — reproductions of current limitations', () => {
  it('cash refresh adopts the newly discovered shift without retargeting an inflight checkout', async () => {
    const state = {
      caixaAberto: true, idCaixaAberto: 4, modalAbrirCaixaAberto: false, ownerUserId: 'owner',
      salvandoVenda: false, checkoutSubmission: null, getOfflineContext: () => ({ enabled: true }), supabase: {},
      loadCashSnapshot: async () => ({ caixa: { id: 5 }, vendas: [], pagamentos: [], movs: [] }),
      calculatePaymentSummary: () => ({ dinheiro: 0 }), calculateMovementSummary: () => ({ sangria: 0, suprimento: 0 }), calculateExpectedDrawer: () => 0,
    };
    const {ctx, call} = loadFunction('src/routes/app/+page.svelte', 'atualizarSaldoCaixa', state);
    await call(); expect(ctx.idCaixaAberto).toBe(5);
    ctx.idCaixaAberto = 4; ctx.salvandoVenda = true;
    await call(); expect(ctx.idCaixaAberto).toBe(4);
  });
  it('duplicate checkout events cannot enter payment persistence twice', async () => {
    const { call } = loadFunction('src/routes/app/+page.svelte', 'confirmarVenda', { salvandoVenda: true });
    await expect(call()).resolves.toBeUndefined();
  });
  it('enabled Mesa close saves locally without calling remote writes, and ignores another close', async () => {
    const localCommand = vi.fn(async () => ({ operation: { operationId: '12345678-stable-key' } }));
    const state = {
      closing: false, getOfflineContext: () => ({ enabled: true }),
      readSnapshot: async () => null, ownerUserId: 'owner',
      comanda: { id: 'c', status: 'aberta', num_pessoas: 1 }, mesa: { numero: 1 },
      itens: [{ nome_produto: 'Lanche', quantidade: 1, preco_unitario: 10 }], pagamentosParciais: [],
      saldoMesa: 10, total: 10, subtotal: 10, multiPag: false, formaPagamento: 'dinheiro', valorRecebido: 10,
      pessoaFiadoId: null, pagamentos: [], desconto: 0, couvert: 0, taxaPct: 0, taxaValor: 0,
      idCaixaAberto: 1, troco: 0, trocoMulti: 0, nomeEmpresa: 'Loja', localCommand,
      newMesaPayments: () => [{ forma_pagamento: 'dinheiro', valor: 10 }],
      addToast: vi.fn(), supabase: { rpc: vi.fn(), from: vi.fn() },
    };
    const { ctx, call } = loadFunction('src/routes/app/mesas/[id]/+page.svelte', 'fecharMesa', state);
    await call();
    expect(ctx.recibo.numero_venda).toBe('LOCAL-12345678');
    expect(ctx.supabase.rpc).not.toHaveBeenCalled();
    ctx.comanda.status = 'fechada'; await call();
    expect(localCommand).toHaveBeenCalledTimes(1);
  });
  it('network failure resumes the cached open caixa of the same owner', async () => {
    const { ctx, call } = loadFunction('src/routes/app/+page.svelte', 'verificarCaixaAberto', {
      caixaAberto: true, idCaixaAberto: 42, modalAbrirCaixaAberto: false,
      readSnapshot: async () => ({ id: 42 }), saveSnapshot: vi.fn(), getOfflineContext: () => null,
      isNetworkError: () => true,
      addToast: vi.fn(), supabase: { from: () => query({ data: null, error: { message: 'Failed to fetch' } }) },
    });
    await call('owner-a');
    expect(ctx.caixaAberto).toBe(true);
    expect(ctx.idCaixaAberto).toBe(42);
    expect(ctx.modalAbrirCaixaAberto).toBe(false);
  });

  it('opening a locally known mesa navigates without a network write', async () => {
    const goto = vi.fn();
    const { ctx, call } = loadFunction('src/routes/app/mesas/+page.svelte', 'abrirMesa', {
      opening: null, ownerUserId: 'owner-a', goto, addToast: vi.fn(),
      getOfflineContext: () => ({ enabled: true }),
      loadMesaState: async () => ({ details: { 1: { comanda: { id: 'c1', status: 'aberta' } } } }),
      submitMesaOperation: vi.fn(),
      supabase: { from: () => query({ data: null, error: { message: 'Failed to fetch' } }) },
    });
    await call({ id: 1 });
    expect(goto).toHaveBeenCalledWith('/app/mesas/1');
    expect(ctx.opening).toBeNull();
    expect(ctx.submitMesaOperation).not.toHaveBeenCalled();
  });

  it('online close retries the same atomic intention after an uncertain response', async () => {
    const offlineRequest = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const state = {
      closing: false, getOfflineContext: () => ({ enabled: false }),
      comanda: { id: 'stable-comanda', status: 'aberta', offline_revision: 4 }, mesa: { numero: 1 },
      itens: [{ nome_produto: 'Lanche', quantidade: 1, preco_unitario: 10 }], pagamentosParciais: [],
      saldoMesa: 10, total: 10, subtotal: 10, multiPag: false, formaPagamento: 'dinheiro', valorRecebido: 10,
      pessoaFiadoId: null, pagamentos: [], desconto: 0, couvert: 0, taxaPct: 0, taxaValor: 0,
      idCaixaAberto: 1, troco: 0, trocoMulti: 0, nomeEmpresa: 'Loja', offlineRequest,
      newMesaPayments: () => [{ forma_pagamento: 'dinheiro', valor: 10 }],
      errorMessageFrom: error => error.message,
      addToast: vi.fn(), supabase: { rpc: vi.fn(), from: vi.fn() },
    };
    const { ctx, call } = loadFunction('src/routes/app/mesas/[id]/+page.svelte', 'fecharMesa', state);
    await call(); await call();
    expect(offlineRequest).toHaveBeenCalledTimes(2);
    expect(offlineRequest.mock.calls.map(([, options]) => JSON.parse(options.body).clientOperationId)).toEqual(['stable-comanda', 'stable-comanda']);
    expect(ctx.supabase.from).not.toHaveBeenCalled();
    expect(ctx.recibo).toBeUndefined();
  });
});
