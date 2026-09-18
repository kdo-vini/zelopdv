import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_connection_print_owner\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n').toLowerCase();
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_connection_print_owner.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const signature = 'set_ifood_connection_print_owner_v1(uuid, text)';

describe('iFood connection print_owner RPC migration', () => {
  it('is a forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('hardens the RPC the same way as the rest of ifood_internal', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    expect(sql).toContain('create or replace function public.set_ifood_connection_print_owner_v1');
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('validates print_owner shape before touching the row', () => {
    expect(sql).toContain("if p_print_owner not in ('zelo', 'external') then");
    expect(sql).toContain("raise exception 'invalid_print_owner'");
  });

  it('returns a distinguishable outcome instead of a raw error when there is no connection yet', () => {
    expect(sql).toContain("outcome := 'not_connected'");
    expect(sql).toContain("outcome := 'updated'");
  });

  it('verifies the not_connected outcome, the write path and the ACL transactionally', () => {
    expect(verificationSql).toContain('not_connected');
    expect(verificationSql).toContain("'external'");
    expect(verificationSql).toContain(
      "has_function_privilege('anon', 'public.set_ifood_connection_print_owner_v1(uuid,text)', 'execute')"
    );
    expect(verificationSql).toContain('invalid_print_owner');
    expect(verificationSql).toContain('rollback;');
  });
});
