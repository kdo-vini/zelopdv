import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813032000_billing_payments_server_insert_only.sql'),
  'utf8',
);

describe('billing payments client-insert containment', () => {
  it('revokes only client INSERT privileges', () => {
    expect(migration).toContain('revoke insert on table public.billing_payments from anon, authenticated;');
    expect(migration).not.toMatch(/revoke\s+all/i);
    expect(migration).not.toMatch(/drop\s+policy/i);
    expect(migration).not.toMatch(/grant\s+insert/i);
  });
});
