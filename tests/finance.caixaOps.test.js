import { describe, expect, test } from 'vitest';
import { abrirCaixaIdempotente, buscarCaixaAberto } from '../src/lib/finance/caixaOps.js';

/**
 * Mock mínimo do client Supabase para a tabela `caixas`.
 * `state.abertos` alimenta as buscas por caixa aberto; `state.insert`
 * controla o resultado do insert (para simular corrida com índice único).
 */
function buildSupabaseMock(state) {
  return {
    from(table) {
      if (table !== 'caixas') throw new Error(`tabela inesperada: ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        order() { return this; },
        insert(row) {
          state.inserted = (state.inserted || []).concat([row]);
          return {
            select() { return this; },
            async single() { return state.insert; }
          };
        },
        async limit() {
          const batch = state.abertos.shift() ?? { data: [], error: null };
          return batch;
        }
      };
    }
  };
}

describe('buscarCaixaAberto', () => {
  test('retorna o caixa aberto quando existe', async () => {
    const supabase = buildSupabaseMock({
      abertos: [{ data: [{ id: 7, data_abertura: '2026-07-06T08:00:00Z' }], error: null }]
    });
    const { caixa, error } = await buscarCaixaAberto(supabase, 'owner-1');
    expect(error).toBeNull();
    expect(caixa?.id).toBe(7);
  });

  test('propaga erro da consulta', async () => {
    const supabase = buildSupabaseMock({
      abertos: [{ data: null, error: { message: 'rede caiu' } }]
    });
    const { caixa, error } = await buscarCaixaAberto(supabase, 'owner-1');
    expect(caixa).toBeNull();
    expect(error?.message).toBe('rede caiu');
  });
});

describe('abrirCaixaIdempotente', () => {
  test('adota caixa já aberto em vez de inserir outro', async () => {
    const state = {
      abertos: [{ data: [{ id: 3, data_abertura: '2026-07-06T08:00:00Z' }], error: null }]
    };
    const supabase = buildSupabaseMock(state);

    const result = await abrirCaixaIdempotente(supabase, {
      ownerUserId: 'owner-1', operadorUserId: 'op-1', valorInicial: 50
    });

    expect(result.error).toBeNull();
    expect(result.jaExistia).toBe(true);
    expect(result.caixa.id).toBe(3);
    expect(state.inserted).toBeUndefined();
  });

  test('insere caixa novo quando não há aberto', async () => {
    const state = {
      abertos: [{ data: [], error: null }],
      insert: { data: { id: 10 }, error: null }
    };
    const supabase = buildSupabaseMock(state);

    const result = await abrirCaixaIdempotente(supabase, {
      ownerUserId: 'owner-1', operadorUserId: 'op-1', valorInicial: 25
    });

    expect(result.error).toBeNull();
    expect(result.jaExistia).toBe(false);
    expect(result.caixa.id).toBe(10);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      id_usuario: 'owner-1',
      id_operador: 'op-1',
      valor_inicial: 25
    });
  });

  test('em corrida (23505), adota o caixa que venceu a abertura', async () => {
    const state = {
      abertos: [
        { data: [], error: null }, // pré-checagem: nada aberto ainda
        { data: [{ id: 42, data_abertura: '2026-07-06T08:00:01Z' }], error: null } // re-busca pós-conflito
      ],
      insert: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    };
    const supabase = buildSupabaseMock(state);

    const result = await abrirCaixaIdempotente(supabase, {
      ownerUserId: 'owner-1', operadorUserId: 'op-1', valorInicial: 0
    });

    expect(result.error).toBeNull();
    expect(result.jaExistia).toBe(true);
    expect(result.caixa.id).toBe(42);
  });

  test('propaga erro de insert que não é conflito de unicidade', async () => {
    const state = {
      abertos: [{ data: [], error: null }],
      insert: { data: null, error: { code: '500', message: 'boom' } }
    };
    const supabase = buildSupabaseMock(state);

    const result = await abrirCaixaIdempotente(supabase, {
      ownerUserId: 'owner-1', operadorUserId: 'op-1', valorInicial: 0
    });

    expect(result.caixa).toBeNull();
    expect(result.error?.message).toBe('boom');
  });
});
