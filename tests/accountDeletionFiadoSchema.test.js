import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/baselines/20260813091000/schema.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('account deletion fiado dependency', () => {
  it('purges the tenant ledger before deleting people and auth users', () => {
    const ledgerDelete = migration.indexOf('delete from fiado_lancamentos');
    const peopleDelete = migration.indexOf('delete from pessoas');
    const authDelete = migration.indexOf('delete from auth.users');

    expect(ledgerDelete).toBeGreaterThanOrEqual(0);
    expect(peopleDelete).toBeGreaterThan(ledgerDelete);
    expect(authDelete).toBeGreaterThan(peopleDelete);
    expect(migration).toContain('where id_usuario = p_user_id');
  });
});
