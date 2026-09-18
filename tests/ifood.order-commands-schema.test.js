import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_order_commands\.sql$/.test(name))
  .sort()
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_order_commands.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const rpcSignatures = [
  'enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text)',
  'confirm_ifood_order_commands_v1(text, text, text)',
  'expire_ifood_accepted_commands_v1(integer)',
  'get_ifood_order_ref_v1(uuid, uuid)',
];

describe('iFood asynchronous order-command schema', () => {
  it('uses a CLI-generated forward migration with hardened service-role-only RPCs', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    expect(sql).not.toMatch(/alter\s+table\s+ifood_internal\.(?:connections|order_refs|order_commands)/);
  });

  it('defines every required RPC signature and revokes browser execution', () => {
    for (const signature of rpcSignatures) {
      const functionName = signature.split('(')[0];
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('keeps the command status and intent vocabulary aligned with the foundation table', () => {
    for (const status of ['queued', 'sending', 'accepted_http', 'confirmed_event', 'failed_retryable', 'failed_terminal', 'expired']) {
      expect(sql).toContain(`'${status}'`);
    }
    for (const intent of ['confirm', 'start_preparation', 'ready_to_pickup', 'dispatch', 'cancel']) {
      expect(sql).toContain(`'${intent}'`);
    }
    expect(sql).toContain('unique_violation');
    expect(sql).toContain("outcome := 'duplicate'");
    expect(sql).toContain('expected_external_revision');
  });

  it('documents the transition matrix, cancellation validation, revision CAS, and no optimistic status write', () => {
    expect(sql).toContain('pending_review');
    expect(sql).toContain("deliveredby");
    expect(sql).toContain("fulfillment->>'type'");
    expect(sql).toContain("= 'delivery'");
    expect(sql).toContain("'ifood'");
    expect(sql).toContain("invalid_transition");
    expect(sql).toContain("invalid_payload");
    expect(sql).toMatch(/for\s+update/);
    expect(sql).toContain('revision_conflict');
    expect(sql).toContain("connection_unavailable");
    expect(sql).not.toMatch(/update\s+public\.zelo_orders[\s\S]+status\s*=/);
  });

  it('transactionally verifies authorization, tenant isolation, idempotency, transitions, correlation and expiry', () => {
    for (const marker of [
      'browser role can execute',
      'not_found',
      'connection_unavailable',
      'revision_conflict',
      'duplicate',
      'invalid_transition',
      'invalid_payload',
      'confirmed_event',
      'expired',
      'zelo_orders.status',
      'rollback;',
    ]) {
      expect(verificationSql).toContain(marker);
    }
    expect(verificationSql).toContain('project_ifood_order_event_v1');
    expect(verificationSql).toContain('set local role service_role');
  });
});
