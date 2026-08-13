import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813070000_vendas_taxas_select_rbac.sql'),
  'utf8',
);

describe('vendas_taxas_plataforma SELECT RBAC migration', () => {
  it('requires a financial-report capability for authenticated reads', () => {
    expect(migration).toContain('revoke select on table public.vendas_taxas_plataforma');
    expect(migration).toContain('from anon');
    expect(migration).toContain('alter policy vendas_taxas_actor_select');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain("fiado_actor_can('caixa.ver'");
    expect(migration).toContain("fiado_actor_can('relatorios.ver'");
  });

  it('does not alter the existing write policies or broaden scope', () => {
    expect(migration).not.toMatch(/drop\s+(table|policy)/iu);
    expect(migration).not.toMatch(/grant\s+/iu);
    expect(migration).toContain('get_owner_user_id(auth.uid()) = id_usuario');
  });
});
