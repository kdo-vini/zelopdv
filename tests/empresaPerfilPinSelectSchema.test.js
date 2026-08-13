import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813060000_empresa_perfil_pin_select_containment.sql'),
  'utf8',
);

describe('empresa_perfil PIN column containment', () => {
  it('removes client table SELECT and grants only non-PIN columns', () => {
    expect(migration).toContain(
      'revoke select on table public.empresa_perfil\nfrom anon, authenticated',
    );
    const grantColumns = migration.match(/grant select \(([\s\S]*?)\)\s*on table/iu)?.[1] || '';
    expect(grantColumns).toContain('nome_exibicao');
    expect(grantColumns).not.toContain('pin_admin');
    expect(migration).toContain('to authenticated');
  });

  it('keeps browser profile reads explicit instead of requesting the PIN wildcard', () => {
    for (const file of [
      'src/routes/app/+page.svelte',
      'src/routes/app/pedidos/+page.svelte',
    ]) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source).not.toMatch(/from\(['"]empresa_perfil['"]\)[\s\S]{0,120}select\(['"]\*['"]\)/u);
    }
  });
});
