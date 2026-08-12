import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260812214518_caixa_role_rbac.sql'),
  'utf8',
);

describe('cash-box RBAC migration', () => {
  it('requires the existing open/close capabilities for cash-box writes', () => {
    expect(migration).toContain("fiado_actor_can('caixa.abrir'");
    expect(migration).toContain("fiado_actor_can('caixa.fechar'");
    expect(migration).toContain('id_usuario = public.get_owner_user_id(auth.uid())');
    expect(migration).toContain('to authenticated');
  });

  it('requires caixa.movimentar for movement inserts', () => {
    expect(migration).toContain("fiado_actor_can('caixa.movimentar'");
    expect(migration).toContain('c.data_fechamento is null');
    expect(migration).toContain('drop policy if exists caixa_movs_actor_insert');
  });

  it('keeps cash-box deletion owner-only', () => {
    expect(migration).toContain('drop policy if exists caixas_actor_delete');
    expect(migration).toContain('using (id_usuario = auth.uid())');
  });

  it('moves closing history to the same close capability', () => {
    expect(migration).toContain('drop policy if exists insert_own_fechamentos');
    expect(migration).toContain('create policy caixa_fechamentos_actor_insert');
  });
});
