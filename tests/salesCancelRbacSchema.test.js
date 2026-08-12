import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve('supabase/migrations/20260812210856_sales_cancel_rbac.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('sales cancellation RBAC migration', () => {
  it('requires pdv.cancelar for completed sale mutation', () => {
    expect(migration).toContain("fiado_actor_can('pdv.cancelar'");
    expect(migration).toContain('drop policy if exists vendas_actor_delete');
    expect(migration).toContain('drop policy if exists vendas_actor_update');
  });

  it('covers sale children that can alter financial history', () => {
    expect(migration).toContain('drop policy if exists vendas_itens_actor_delete');
    expect(migration).toContain('drop policy if exists vendas_pagamentos_actor_delete');
    expect(migration).toContain('drop policy if exists vendas_taxas_actor_delete');
  });

  it('keeps the Mesa failure rollback narrowly bounded', () => {
    expect(migration).toContain('vendas_actor_can_delete');
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain('not exists');
    expect(migration).toContain('vendas_itens');
    expect(migration).toContain('vendas_pagamentos');
  });

  it('does not grant anonymous execution', () => {
    expect(migration).toContain('revoke all on function public.vendas_actor_can_delete(bigint) from public');
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
    const grants = fs.readFileSync(
      path.resolve('supabase/migrations/20260812211428_sales_cancel_helper_grant_fix.sql'),
      'utf8',
    );
    expect(grants).toContain('revoke execute on function public.vendas_actor_can_delete(bigint) from anon');
    expect(grants).not.toMatch(/grant execute[^;]*to anon/i);
  });
});
