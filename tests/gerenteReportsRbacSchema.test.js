import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813043000_gerente_reports_rbac.sql'),
  'utf8',
);

describe('Gerente intelligence report RBAC', () => {
  it('adds the existing reports capability to both reads and signal acknowledgements', () => {
    expect(migration).toContain('alter policy business_signals_select_owner');
    expect(migration).toContain('alter policy business_signals_update_read');
    expect(migration).toContain('alter policy business_snapshots_select_owner');
    expect(migration.match(/fiado_actor_can\('relatorios\.ver', user_id\)/g)).toHaveLength(4);
    expect(migration).not.toMatch(/grant\s+/i);
    expect(migration).not.toMatch(/revoke\s+/i);
    expect(migration).not.toMatch(/drop\s+(table|policy)/i);
  });
});
