import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_worker_polling\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n').toLowerCase();
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_worker_polling.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const listSignature = 'list_ifood_connections_for_polling_v1(timestamptz, bigint, integer)';
const recordSignature = 'record_ifood_poll_success_v1(uuid, text, timestamptz, timestamptz)';

describe('iFood worker polling RPC migration', () => {
  it('is a forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('hardens both RPCs the same way as the rest of ifood_internal', () => {
    for (const signature of [listSignature, recordSignature]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('polls connected merchants only, never pending or revoked ones', () => {
    expect(sql).toContain("c.status in ('active', 'degraded', 'paused')");
    expect(sql).not.toContain("'pending', 'active'");
  });

  it('honours the per-connection polling floor and a bounded batch', () => {
    expect(sql).toContain('c.last_poll_at is null or c.last_poll_at <= v_now - v_interval');
    expect(sql).toContain('least(greatest(coalesce(p_limit, 1000), 1), 1000)');
  });

  it('records poll success as the token-liveness signal, monotonically', () => {
    expect(sql).toContain('last_poll_at = greatest(c.last_poll_at, v_polled_at)');
    expect(sql).toContain('last_token_at = greatest(c.last_token_at, v_token_at)');
    expect(sql).toContain('worker_heartbeat_at = greatest(c.worker_heartbeat_at, v_polled_at)');
    expect(sql).toContain("c.status <> 'revoked'");
    expect(sql).toContain("outcome := 'unknown_merchant'");
  });

  it('adds no second insert path into event_inbox', () => {
    expect(sql).not.toContain('insert into ifood_internal.event_inbox');
  });

  it('verifies selection, the liveness write and the ACL transactionally', () => {
    expect(verificationSql).toContain(
      "has_function_privilege('anon', 'public.list_ifood_connections_for_polling_v1(timestamptz,bigint,integer)', 'execute')"
    );
    expect(verificationSql).toContain(
      "has_function_privilege('anon', 'public.record_ifood_poll_success_v1(uuid,text,timestamptz,timestamptz)', 'execute')"
    );
    expect(verificationSql).toContain('merchant-polling-pending');
    expect(verificationSql).toContain('unknown_merchant');
    expect(verificationSql).toContain('regressed last_poll_at');
    expect(verificationSql).toContain('rollback;');
  });
});
