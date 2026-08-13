import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813041000_access_audit_logs_tenant_guard.sql'),
  'utf8',
);

describe('access audit log tenant guard', () => {
  it('tightens only the existing INSERT policy to actor plus resolved owner', () => {
    expect(migration).toContain(
      'alter policy access_audit_logs_insert\n  on public.access_audit_logs',
    );
    expect(migration).toContain('operator_user_id = auth.uid()');
    expect(migration).toContain('owner_user_id = get_owner_user_id(auth.uid())');
    expect(migration).not.toMatch(/grant\s+/i);
    expect(migration).not.toMatch(/revoke\s+/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(migration).not.toMatch(/drop\s+policy/i);
  });
});
