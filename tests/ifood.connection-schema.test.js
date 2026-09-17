import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_self_service_connection\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n').toLowerCase();
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_self_service_connection.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const rpcSignatures = [
  'get_ifood_connection_v1(uuid)',
  'upsert_ifood_connection_v1(uuid, text, text)',
  'count_ifood_active_orders_v1(uuid)'
];

describe('iFood self-service connection RPC migration', () => {
  it('is a forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('hardens every RPC the same way as the rest of ifood_internal', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    for (const signature of rpcSignatures) {
      const functionName = signature.split('(')[0];
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('never lets upsert_ifood_connection_v1 raise a raw unique violation to the caller', () => {
    expect(sql).toContain('exception when unique_violation then');
    expect(sql).toContain("outcome := 'merchant_taken'");
  });

  it('rejects switching merchant_id on a live (non-revoked) connection instead of silently reassigning it', () => {
    expect(sql).toContain("v_existing.status <> 'revoked'");
    expect(sql).toContain("outcome := 'conflict_other_merchant'");
  });

  it('only counts non-terminal internal statuses as active orders', () => {
    expect(sql).toContain('from ifood_internal.order_refs as r');
    expect(sql).toContain('join public.zelo_orders as o on o.id = r.zelo_order_id');
    expect(sql).toContain("and o.status not in ('delivered', 'cancelled', 'rejected')");
  });

  it('validates status and merchant_id shape before touching the table', () => {
    expect(sql).toContain("if p_status not in ('pending', 'active', 'degraded', 'paused', 'revoked') then");
    expect(sql).toContain('raise exception \'invalid_status\'');
    expect(sql).toContain("nullif(btrim(coalesce(p_merchant_id, '')), '') is null");
  });

  it('verifies tenant isolation, idempotent reconnect, and ACL transactionally', () => {
    expect(verificationSql).toContain('merchant_taken');
    expect(verificationSql).toContain('conflict_other_merchant');
    expect(verificationSql).toContain('did not transition the same row to active');
    expect(verificationSql).toContain(
      "has_function_privilege('anon', 'public.upsert_ifood_connection_v1(uuid,text,text)', 'execute')"
    );
    expect(verificationSql).toContain('rollback;');
  });
});
