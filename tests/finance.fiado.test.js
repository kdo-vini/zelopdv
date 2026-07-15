import { describe, expect, test } from 'vitest';
import { buildFiadoStatement, getFiadoState } from '../src/lib/finance/fiado.js';

describe('getFiadoState', () => {
  test('distingue dívida, crédito e ficha quitada', () => {
    expect(getFiadoState(18.5)).toMatchObject({ key: 'devedor', label: 'Em aberto', value: 18.5 });
    expect(getFiadoState(-7)).toMatchObject({ key: 'credor', label: 'Crédito disponível', value: 7 });
    expect(getFiadoState(0)).toMatchObject({ key: 'neutro', label: 'Sem saldo', value: 0 });
  });
});

describe('buildFiadoStatement', () => {
  test('calcula o saldo progressivo e devolve o extrato mais recente primeiro', () => {
    const statement = buildFiadoStatement([
      { id: 1, natureza: 'saldo_inicial', valor: 20, created_at: '2026-07-15T10:00:00Z' },
      { id: 2, natureza: 'pagamento', valor: -8, created_at: '2026-07-15T11:00:00Z' },
      { id: 3, natureza: 'pagamento', valor: -20, created_at: '2026-07-15T12:00:00Z' }
    ]);

    expect(statement.map((entry) => entry.id)).toEqual([3, 2, 1]);
    expect(statement[0].balanceAfter).toBe(-8);
    expect(statement[1].balanceAfter).toBe(12);
    expect(statement[2].balanceAfter).toBe(20);
  });
});
