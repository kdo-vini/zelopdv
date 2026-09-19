import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { resumoFinanceiro } from '../src/lib/server/gerente/tools/financialAnalysis.js';

const now = new Date('2026-09-02T15:00:00Z');

describe('resumoFinanceiro', () => {
  it('separa faturamento, despesas, custo conhecido e margem estimada', async () => {
    const db = makeDb({ tables: {
      vendas: [{ data: [{ id: 1, id_usuario: 'owner-1', valor_total: 100, created_at: '2026-09-02T12:00:00Z' }], error: null }],
      vendas_itens: [{ data: [{ id_venda: 1, id_produto: 7, quantidade: 2, preco_unitario_na_venda: 50 }], error: null }],
      vendas_taxas_plataforma: [{ data: [{ id_venda: 1, valor_taxa: 5 }], error: null }],
      expenses: [{ data: [{ id: 'e1', description: 'Aluguel', amount: 20, category: 'Aluguel', date: '2026-09-02T00:00:00Z' }], error: null }],
      produtos: [{ data: [{ id: 7, nome: 'Pudim', custo_unitario: 15 }], error: null }],
    } });
    const result = await resumoFinanceiro(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(result).toMatchObject({ ok: true, data: {
      faturamento: 100,
      despesas_registradas: 20,
      custo_produtos_conhecido: 30,
      resultado_registrado: 80,
      lucro_estimado: 45,
      margem_estimada: 45,
      cobertura_custos: 'total',
    } });
  });

  it('marca cobertura parcial quando faltam custos', async () => {
    const db = makeDb({ tables: {
      vendas: [{ data: [{ id: 1, id_usuario: 'owner-1', valor_total: 100, created_at: '2026-09-02T12:00:00Z' }], error: null }],
      vendas_itens: [{ data: [{ id_venda: 1, id_produto: 7, quantidade: 1, preco_unitario_na_venda: 50 }, { id_venda: 1, id_produto: 8, quantidade: 1, preco_unitario_na_venda: 50 }], error: null }],
      vendas_taxas_plataforma: [{ data: [], error: null }],
      expenses: [{ data: [], error: null }],
      produtos: [{ data: [{ id: 7, nome: 'Pudim', custo_unitario: 10 }], error: null }],
    } });
    const result = await resumoFinanceiro(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(result.data).toMatchObject({ cobertura_custos: 'parcial', quantidade_com_custo: 1, quantidade_sem_custo: 1, lucro_estimado: 90 });
  });

  it('não fabrica lucro estimado quando nenhum custo está cadastrado', async () => {
    const db = makeDb({ tables: {
      vendas: [{ data: [{ id: 1, id_usuario: 'owner-1', valor_total: 100, created_at: '2026-09-02T12:00:00Z' }], error: null }],
      vendas_itens: [{ data: [{ id_venda: 1, id_produto: 7, quantidade: 1, preco_unitario_na_venda: 100 }], error: null }],
      vendas_taxas_plataforma: [{ data: [], error: null }],
      expenses: [{ data: [], error: null }],
      produtos: [{ data: [{ id: 7, nome: 'Pudim', custo_unitario: null }], error: null }],
    } });
    const result = await resumoFinanceiro(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(result.data).toMatchObject({ cobertura_custos: 'nenhum', resultado_registrado: 100, lucro_estimado: null, margem_estimada: null });
  });
});
