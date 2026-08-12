import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260812195032_products_role_rbac.sql', import.meta.url);

describe('catalog role RBAC migration', () => {
  it('keeps owners and requires product-management permission for sub-users', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('produtos.gerenciar');
    expect(migration).toContain('(select auth.uid()) = id_usuario');
    for (const policy of [
      'usuario_gerencia_seus_produtos_insert',
      'produtos_actor_update',
      'produtos_actor_delete',
      'usuario_gerencia_suas_categorias_insert',
      'categorias_actor_update',
      'categorias_actor_delete',
      'subcats_insert_own',
      'subcategorias_actor_update',
      'subcategorias_actor_delete',
    ]) {
      expect(migration).toContain(`drop policy if exists ${policy}`);
    }
    expect(migration.match(/create policy .*_actor_(insert|update|delete)/g)).toHaveLength(9);
  });

  it('does not remove or rewrite catalog data', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+public\.(produtos|categorias|subcategorias)/);
    expect(migration.toLowerCase()).not.toMatch(/truncate\s+public\.(produtos|categorias|subcategorias)/);
    expect(migration.toLowerCase()).not.toMatch(/alter\s+table\s+public\.(produtos|categorias|subcategorias)\s+drop/);
  });
});
