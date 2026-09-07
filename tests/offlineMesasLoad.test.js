import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSnapshot: vi.fn(), listOperations: vi.fn(), saveSnapshot: vi.fn() }));
vi.mock('../src/lib/offline/operations.js', () => ({
  readSnapshot: mocks.readSnapshot,
  saveSnapshot: mocks.saveSnapshot,
  listOperations: mocks.listOperations,
}));
vi.mock('../src/lib/offlineDb.js', () => ({
  db: { transaction: async (_mode, ..._args) => { const cb = _args[_args.length - 1]; return cb(); } },
}));

import { loadMesaState } from '../src/lib/offline/mesas.js';

function fakeSupabase(rowsByTable) {
  const calls = [];
  return {
    from(table) {
      const q = {
        eqCalls: [],
        select() { return q; },
        eq(col, val) { calls.push({ table, col, val }); return q; },
        in(col, val) { calls.push({ table, col, val }); return q; },
        order() { return q; },
        async range() { return { data: rowsByTable[table] || [], error: null }; },
      };
      return q;
    },
    calls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSnapshot.mockResolvedValue(null);
  mocks.listOperations.mockResolvedValue([]);
});

it('loads mesa state without filtering comanda_itens by id_usuario (column does not exist on that table)', async () => {
  const comanda = { id: 'c1', id_mesa: 1, status: 'aberta' };
  const supabase = fakeSupabase({
    mesas: [{ id: 1, numero: 1, ativa: true }],
    comandas: [comanda],
    comanda_itens: [],
    comanda_pagamentos: [],
    comanda_pagamento_itens: [],
  });

  const state = await loadMesaState(supabase, 'owner-1');

  expect(state.mesas).toHaveLength(1);

  const idUsuarioFilters = supabase.calls.filter(c => c.col === 'id_usuario');
  expect(idUsuarioFilters.map(c => c.table).sort()).toEqual(['comandas', 'mesas']);
  expect(idUsuarioFilters.every(c => c.val === 'owner-1')).toBe(true);

  const itemFilters = supabase.calls.filter(c => c.table === 'comanda_itens');
  expect(itemFilters.some(c => c.col === 'id_usuario')).toBe(false);
  expect(itemFilters.some(c => c.col === 'id_comanda')).toBe(true);
});
