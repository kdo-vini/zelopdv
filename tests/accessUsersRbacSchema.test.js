import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve('supabase/migrations/20260812204706_access_users_self_write_containment.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('access_users RBAC containment migration', () => {
  it('replaces the owner-or-self ALL policy with owner CRUD', () => {
    expect(migration).toContain('drop policy if exists access_users_owner_or_self');
    expect(migration).toContain('create policy access_users_owner');
    expect(migration).toContain('for all');
    expect(migration).toContain('(select auth.uid()) = owner_user_id');
  });

  it('keeps owner writes exclusive to users who resolve to themselves', () => {
    const ownerGuardMigration = fs.readFileSync(
      path.resolve('supabase/migrations/20260812205010_access_users_owner_guard.sql'),
      'utf8',
    );
    expect(ownerGuardMigration).toContain('public.get_owner_user_id((select auth.uid())) = (select auth.uid())');
    expect(ownerGuardMigration).toContain('with check');
  });

  it('preserves a self-scoped authenticated SELECT for sub-user context reads', () => {
    expect(migration).toContain('create policy access_users_self_select');
    expect(migration).toContain('for select');
    expect(migration).toContain('(select auth.uid()) = auth_user_id');
  });

  it('does not grant a new anonymous or service-role policy', () => {
    expect(migration).not.toMatch(/to anon/i);
    expect(migration).not.toMatch(/to service_role/i);
  });
});
