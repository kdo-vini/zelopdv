import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_webhook_enqueue\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_webhook_enqueue.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

describe('iFood webhook enqueue RPC migration', () => {
  it('generates the migration via the CLI and defines a hardened service-role-only function', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('create or replace function public.enqueue_ifood_webhook_event_v1');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("current_setting('role', true) = 'service_role'");
    expect(sql).toContain('raise exception \'forbidden\'');
  });

  it('locks grants down to service_role only', () => {
    expect(sql).toContain(
      'revoke all on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) to service_role;'
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*enqueue_ifood_webhook_event_v1[\s\S]*to (?:anon|authenticated)/);
  });

  it('resolves merchant_id to a non-revoked connection without ever raising for an unknown or revoked merchant', () => {
    expect(sql).toMatch(/from ifood_internal\.connections as c\s+where c\.merchant_id = p_merchant_id\s+and c\.status <> 'revoked'/);
    expect(sql).toContain("outcome := 'unknown_merchant'");
    expect(sql).toContain("outcome := 'inserted'");
    expect(sql).toContain("outcome := 'duplicate'");
    // The unknown-merchant branch must return before any insert is attempted.
    const unknownBranchIndex = sql.indexOf("outcome := 'unknown_merchant'");
    const insertIndex = sql.indexOf('insert into ifood_internal.event_inbox');
    expect(unknownBranchIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(unknownBranchIndex);
  });

  it('reuses the same duplicate-safe insert semantics as the foundation enqueue', () => {
    expect(sql).toContain('on conflict on constraint ifood_event_inbox_event_unique do nothing');
    expect(sql).toMatch(/octet_length\s*\(\s*p_payload::text\s*\)\s*>\s*262144/);
  });

  it('verifies the tenant isolation, idempotency, and ACL guarantees transactionally', () => {
    expect(verificationSql).toContain('unknown_merchant');
    expect(verificationSql).toContain("'revoked'");
    expect(verificationSql).toContain('duplicate webhook event was not idempotent');
    expect(verificationSql).toContain(
      "has_function_privilege('anon', 'public.enqueue_ifood_webhook_event_v1(text,text,text,text,bigint,timestamptz,jsonb)', 'execute')"
    );
  });
});
