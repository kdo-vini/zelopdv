import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813080000_sales_payment_cash_read_rbac.sql'),
  'utf8',
);

describe('sales payment/cash movement SELECT RBAC migration', () => {
  it('removes anonymous reads and gates the two financial tables', () => {
    expect(migration).toContain('public.vendas_pagamentos');
    expect(migration).toContain('public.caixa_movimentacoes');
    expect(migration).toContain('from anon');
    expect(migration).toContain('alter policy vendas_pagamentos_actor_select');
    expect(migration).toContain('alter policy caixa_movs_actor_select');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain("fiado_actor_can('pdv.acessar'");
    expect(migration).toContain("fiado_actor_can('caixa.movimentar'");
    expect(migration).toContain("fiado_actor_can('relatorios.ver'");
  });

  it('does not rewrite tables or write policies', () => {
    expect(migration).not.toMatch(/drop\s+(table|policy)/iu);
    expect(migration).not.toMatch(/grant\s+/iu);
  });
});
