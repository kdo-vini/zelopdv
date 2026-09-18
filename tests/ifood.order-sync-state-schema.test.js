import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^20260917004212_ifood_order_sync_state\.sql$/.test(name))
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationPath = resolve('supabase/verification/ifood_order_sync_state.sql');
const verificationSql = existsSync(verificationPath)
  ? readFileSync(verificationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';

const signature = 'get_ifood_order_sync_state_v1(uuid, uuid[])';

describe('iFood order sync-state schema', () => {
  it('defines the hardened service-role-only RPC in the pre-generated migration', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain(`create or replace function public.get_ifood_order_sync_state_v1`);
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('returns only the sanitized tenant-scoped sync-state columns', () => {
    for (const column of [
      'zelo_order_id uuid',
      'external_status text',
      'last_event_at timestamptz',
      'connection_status text',
      'command_intent text',
      'command_status text',
      'command_updated_at timestamptz',
      'command_error_code text',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('r.empresa_id = p_empresa_id');
    expect(sql).toContain('r.zelo_order_id = any(p_order_ids)');
    expect(sql).toContain('left join lateral');
    expect(sql).toContain("'queued'");
    expect(sql).toContain("'sending'");
    expect(sql).toContain("'accepted_http'");
    expect(sql).toContain("'failed_retryable'");
    expect(sql).not.toContain('payload');
    expect(sql).not.toContain('response');
    expect(sql).not.toContain('lease');
    expect(sql).not.toContain('idempotency_key');
    expect(sql).not.toContain('last_error ');
  });

  it('handles array bounds and null or empty requests explicitly', () => {
    expect(sql).toContain('cardinality(p_order_ids) > 200');
    expect(sql).toContain("raise exception 'too_many_order_ids'");
    expect(sql).toContain('p_order_ids is null');
    expect(sql).toContain('cardinality(p_order_ids) = 0');
  });

  it('verifies authorization, tenant isolation, command ranking, null commands, and the limit transactionally', () => {
    for (const marker of [
      'browser role can execute',
      'owner company',
      'other company',
      'live command preferred',
      'no command',
      'too_many_order_ids',
      'rollback;',
    ]) {
      expect(verificationSql).toContain(marker);
    }
    expect(verificationSql).toContain('project_ifood_order_event_v1');
    expect(verificationSql).toContain('enqueue_ifood_order_command_v1');
    expect(verificationSql).toContain('set local role service_role');
  });
});
