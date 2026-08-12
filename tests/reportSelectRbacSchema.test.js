import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813010000_reports_select_rbac.sql'),
  'utf8',
);

describe('report SELECT RBAC migration', () => {
  it('requires the report capability while preserving owner scoping', () => {
    expect(migration).toContain('create policy caixa_fechamentos_actor_select');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('public.get_owner_user_id(auth.uid()) = id_usuario');
    expect(migration).toContain("public.fiado_actor_can('relatorios.ver', id_usuario)");
  });

  it('removes the unused anonymous table grant', () => {
    expect(migration).toContain('revoke all on table public.caixa_fechamentos from anon');
  });

  it('does not alter shared operational tables or write paths', () => {
    expect(migration).not.toContain('vendas_actor_select');
    expect(migration).not.toContain('caixas_actor_select');
    expect(migration).not.toContain('create policy caixa_fechamentos_actor_insert');
  });
});
