import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260812193009_expenses_role_rbac.sql', import.meta.url);

describe('expenses role RBAC migration', () => {
  it('keeps owners and enforces the existing expense permissions for sub-users', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain("despesas.visualizar");
    expect(migration).toContain("despesas.gerenciar");
    expect(migration).toContain('(select auth.uid()) = user_id');
    expect(migration).toContain('drop policy if exists expenses_actor_select');
    expect(migration).toContain('drop policy if exists expenses_actor_insert');
    expect(migration).toContain('drop policy if exists expenses_actor_update');
    expect(migration).toContain('drop policy if exists expenses_actor_delete');
  });

  it('does not remove or rewrite expense data', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+public\.expenses/);
    expect(migration.toLowerCase()).not.toMatch(/truncate\s+public\.expenses/);
    expect(migration.toLowerCase()).not.toMatch(/alter\s+table\s+public\.expenses\s+drop/);
  });
});
