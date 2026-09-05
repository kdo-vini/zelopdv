import { expect, it } from 'vitest';
import { projectMesaOperation } from '../src/lib/finance/offlineMesas.js';
const state = { mesas: [{ id: 'm1', status: 'livre' }, { id: 'm2', status: 'livre' }], details: {} };
it('opening, adding, payment and transfer preserve local comanda identity and item allocations', () => {
  let s = projectMesaOperation(state, 'mesa.open', { mesaId: 'm1', comandaId: 'c' }, 'op1');
  s = projectMesaOperation(s, 'mesa.item.add', { comandaId: 'c', itemId: 'i', produtoId: 1, delta: 1, precoUnitario: 12, nome: 'Lanche' }, 'op2');
  s = projectMesaOperation(s, 'mesa.payment.add', { comandaId: 'c', paymentId: 'p', valor: 12, forma_pagamento: 'dinheiro', allocations: [{ id_comanda_item: 'i', quantidade: 1 }] }, 'op3');
  s = projectMesaOperation(s, 'mesa.transfer', { comandaId: 'c', mesaDestinoId: 'm2' }, 'op4');
  expect(s.details.m2.comanda.id).toBe('c');
  expect(s.details.m2.pagamentos[0].itens_alocados[0].id_comanda_item).toBe('i');
  expect(s.mesas[0].status).toBe('livre');
  expect(state.details).toEqual({});
});
it('rejects decreasing already paid items and double close', () => {
  let s = projectMesaOperation(state, 'mesa.open', { mesaId: 'm1', comandaId: 'c' }, '1');
  s = projectMesaOperation(s, 'mesa.item.add', { comandaId: 'c', itemId: 'i', delta: 1, precoUnitario: 12 }, '2');
  s = projectMesaOperation(s, 'mesa.payment.add', { comandaId: 'c', paymentId: 'p', allocations: [{ id_comanda_item: 'i', quantidade: 1 }] }, '3');
  expect(() => projectMesaOperation(s, 'mesa.item.delta', { comandaId: 'c', itemId: 'i', delta: -1 }, '4')).toThrow();
  s = projectMesaOperation(s, 'mesa.close', { comandaId: 'c' }, '5');
  expect(() => projectMesaOperation(s, 'mesa.close', { comandaId: 'c' }, '6')).toThrow();
});
