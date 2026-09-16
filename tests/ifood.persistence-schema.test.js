import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_mvp_foundation\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_mvp_foundation.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const tableNames = [
  'connections',
  'event_inbox',
  'order_refs',
  'order_commands',
  'product_mappings',
  'stock_commitments'
];

describe('iFood persistence foundation migration', () => {
  it('creates the generated migration and keeps integration tables in a private schema', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('create schema if not exists ifood_internal');

    for (const table of tableNames) {
      expect(sql).toContain(`create table if not exists ifood_internal.${table}`);
      expect(sql).toContain(`alter table ifood_internal.${table} enable row level security`);
    }
  });

  it('declares provider and canonical identities plus foreign keys and queue indexes', () => {
    expect(sql).toMatch(/unique\s*\(\s*merchant_id\s*\)/);
    expect(sql).toMatch(/unique\s*\(\s*event_id\s*\)/);
    expect(sql).toMatch(/unique\s*\(\s*merchant_id\s*,\s*external_order_id\s*\)/);
    expect(sql).toMatch(/unique\s*\(\s*zelo_order_id\s*\)/);
    expect(sql).toMatch(/unique\s*\(\s*connection_id\s*,\s*external_order_id\s*,\s*intent\s*,\s*expected_external_revision\s*\)/);
    expect(sql).toContain('references public.empresa_perfil');
    expect(sql).toContain('references public.zelo_orders');
    expect(sql).toContain('references ifood_internal.connections');
    expect(sql).toContain('references ifood_internal.order_refs');
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]+event_inbox/);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]+order_commands/);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]+stock_commitments/);
    expect(sql).toContain(
      'create index if not exists ifood_order_commands_empresa_idx\n  on ifood_internal.order_commands (empresa_id);'
    );
    expect(sql).toContain(
      'create index if not exists ifood_product_mappings_empresa_idx\n  on ifood_internal.product_mappings (empresa_id);'
    );
    expect(sql).toContain(
      'create index if not exists ifood_stock_commitments_empresa_idx\n  on ifood_internal.stock_commitments (empresa_id);'
    );
  });

  it('bounds raw payloads, errors, retries and retention', () => {
    expect(sql).toMatch(/octet_length\s*\(\s*payload::text\s*\)\s*<=\s*262144/);
    expect(sql).toMatch(/retention|purge|expires_at|payload_retained_until/);
    expect(sql).toMatch(/length\s*\(\s*last_error\s*\)\s*<=\s*500/);
    expect(sql).toMatch(/attempts\s*>=\s*0/);
    expect(sql).toMatch(/dead[_ -]?letter|dead_letter|failed_terminal/);
  });

  it('exposes queue RPCs with non-blocking leases and CAS finishes', () => {
    for (const fn of [
      'enqueue_ifood_event_v1',
      'claim_ifood_events_v1',
      'finish_ifood_event_v1',
      'claim_ifood_commands_v1',
      'finish_ifood_command_v1'
    ]) {
      expect(sql).toContain(`function public.${fn}`);
      expect(sql).toContain(`revoke all on function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql).toContain('for update skip locked');
    expect(sql).toMatch(/lease[_a-z]*_until|leased_until|lease_expires_at/);
    expect(sql.match(/if p_lease_id is null/g)).toHaveLength(2);
    expect(sql).toContain("raise exception 'invalid_lease_id'");
    expect(sql).not.toContain('is not distinct from p_lease_id');
    expect(sql).toMatch(/and p_lease_id is not null\s+and e\.lease_id = p_lease_id/);
    expect(sql).toMatch(/and p_lease_id is not null\s+and c\.lease_id = p_lease_id/);
    expect(sql).toContain(
      'on conflict on constraint ifood_event_inbox_event_unique do nothing'
    );
  });

  it('permits iFood as a canonical order source without granting browser access', () => {
    expect(sql).toContain("'ifood'");
    expect(sql).toMatch(/zelo_orders[\s\S]+source/);
    expect(sql).toMatch(/revoke all on table ifood_internal\./);
    expect(sql).toMatch(/from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete)[\s\S]+to (?:anon|authenticated)/);
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('lets the service-role verifier read its pre-role-switch fixture', () => {
    expect(verificationSql).toContain(
      'grant select on ifood_verification_fixture to service_role;'
    );
    expect(verificationSql.indexOf('grant select on ifood_verification_fixture'))
      .toBeLessThan(verificationSql.indexOf('set local role service_role;'));
  });
});
