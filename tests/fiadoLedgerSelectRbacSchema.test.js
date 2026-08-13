import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813034000_fiado_ledger_select_rbac.sql'),
  'utf8',
);

describe('fiado ledger SELECT RBAC', () => {
  it('adds the existing fiado.visualizar capability without changing grants or writes', () => {
    expect(migration).toContain(
      'alter policy fiado_lancamentos_select_owner\n  on public.fiado_lancamentos',
    );
    expect(migration).toContain("fiado_actor_can('fiado.visualizar', id_usuario)");
    expect(migration).toContain('id_usuario = get_owner_user_id(auth.uid())');
    expect(migration).not.toMatch(/grant\s+/i);
    expect(migration).not.toMatch(/revoke\s+/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/drop\s+policy/i);
  });
});
