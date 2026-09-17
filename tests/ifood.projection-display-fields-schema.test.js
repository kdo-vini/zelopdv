import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  'supabase/migrations/20260917005456_ifood_projection_display_fields.sql'
);
const migrationSql = readFileSync(migrationPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .toLowerCase();
const compactMigrationSql = migrationSql
  .replace(/\s+/g, ' ')
  .replace(/\(\s+/g, '(')
  .replace(/\s+\)/g, ')');
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_projection_display_fields.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

describe('iFood projection display fields migration', () => {
  it('recreates the canonical projection with the nested ifood fulfillment block', () => {
    expect(migrationSql).toContain(
      'create or replace function public.project_ifood_order_event_v1('
    );
    expect(migrationSql).toMatch(
      /v_fulfillment\s*:=\s*coalesce\(p_order->'fulfillment', '\{\}'::jsonb\)\s*\|\|\s*jsonb_build_object\(\s*'ifood',\s*jsonb_build_object\(/
    );
    expect(migrationSql).toContain("'displayid', p_order->>'displayid'");
    expect(migrationSql).toContain("'externalorderid', p_external_order_id");
    expect(migrationSql).toContain("'preparationstartat', p_order->>'preparationstartat'");
    expect(migrationSql).toContain("'scheduled', coalesce((p_order->>'scheduled')::boolean, false)");
    expect(compactMigrationSql).toContain(
      "'schedulestart', coalesce(p_order#>>'{fulfillment,schedule,start}', p_order#>>'{fulfillment,schedule,deliverydatetimestart}')"
    );
    expect(compactMigrationSql).toContain(
      "'scheduleend', coalesce(p_order#>>'{fulfillment,schedule,end}', p_order#>>'{fulfillment,schedule,deliverydatetimeend}')"
    );
    expect(migrationSql).toContain("'pickupcode', p_order->>'pickupcode'");
    expect(migrationSql).toContain("'deliverycode', p_order->>'deliverycode'");
    expect(migrationSql).toContain('v_customer, v_fulfillment, v_payment');
    expect(migrationSql).toContain('fulfillment = v_fulfillment');
  });

  it('keeps the service-role hardening and grants', () => {
    expect(migrationSql).toContain('security definer');
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain("current_setting('role', true) = 'service_role'");
    expect(migrationSql).toContain("raise exception 'forbidden'");
    expect(migrationSql).toContain(
      'revoke all on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;'
    );
    expect(migrationSql).toContain(
      'grant execute on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) to service_role;'
    );
    expect(migrationSql).not.toMatch(/grant execute[\s\S]*project_ifood_order_event_v1[\s\S]*to (?:anon|authenticated)/);
  });

  it('includes transactional assertions for refresh, null defaults and browser denial', () => {
    expect(verificationSql).toContain('begin;');
    expect(verificationSql).toContain('rollback;');
    expect(verificationSql).toContain("'display-id-fixture'");
    expect(verificationSql).toContain('pickup-code-fixture');
    expect(verificationSql).toContain('delivery-code-fixture');
    expect(verificationSql).toContain('2026-09-17t10:30:00z');
    expect(verificationSql).toContain('2026-09-17t11:00:00z');
    expect(verificationSql).toContain('2026-09-17t11:30:00z');
    expect(verificationSql).toContain("v_ifood->>'scheduled' <> 'false'");
    expect(verificationSql).toContain('jsonb_typeof');
    expect(verificationSql).toContain('browser role can execute the projection rpc');
  });
});
