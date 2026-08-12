import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260812202400_pessoas_role_rbac.sql', import.meta.url);

describe('pessoas role RBAC migration', () => {
  it('requires pessoas.gerenciar for direct authenticated writes', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('to authenticated');
    expect(migration).toContain("fiado_actor_can('pessoas.gerenciar', id_usuario)");
    expect(migration).toContain('get_owner_user_id(auth.uid()) = id_usuario');
    for (const policy of ['pessoas_actor_delete', 'pessoas_actor_update', 'pessoas_insert_own']) {
      expect(migration).toContain(`drop policy if exists "${policy}"`);
    }
    expect(migration).toContain('create policy "pessoas_actor_insert"');
    expect(migration).toContain('create policy "pessoas_actor_update"');
    expect(migration).toContain('create policy "pessoas_actor_delete"');
  });

  it('does not change reads or delete fiado data', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).not.toContain('pessoas_actor_select');
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from\s+public\.(pessoas|fiado_lancamentos)/);
    expect(migration.toLowerCase()).not.toMatch(/truncate\s+public\.(pessoas|fiado_lancamentos)/);
  });

  it('writes new people under the tenant owner from the browser page', async () => {
    const page = await readFile(new URL('../src/routes/gestao/pessoas/+page.svelte', import.meta.url), 'utf8');
    expect(page).toContain("import { getAccessContext } from '$lib/accessControl'");
    expect(page).toContain('ownerUserId = accessContext?.ownerUserId || uid');
    expect(page).toContain('payload.id_usuario = ownerUserId || uid');
  });
});
