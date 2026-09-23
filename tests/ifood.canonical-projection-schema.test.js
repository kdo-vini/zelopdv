import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_canonical_order_projection\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const sql = migrationPath
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_canonical_order_projection.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const contractsSource = readFileSync(
  resolve('src/lib/server/ifood/contracts.js'),
  'utf8'
).replace(/\r\n/g, '\n');
const eventHandlerSource = readFileSync(
  resolve('src/lib/server/ifood/eventHandler.js'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('iFood canonical order projection migration', () => {
  it('generates the migration via the CLI and defines a hardened service-role-only function', () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain('create or replace function public.project_ifood_order_event_v1');
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("current_setting('role', true) = 'service_role'");
    expect(sql).toContain("raise exception 'forbidden'");
  });

  it('locks grants down to service_role only', () => {
    expect(sql).toContain(
      'revoke all on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) to service_role;'
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*project_ifood_order_event_v1[\s\S]*to (?:anon|authenticated)/);
  });

  it('resolves merchant_id to a non-revoked connection and never trusts an empresa_id from the caller', () => {
    expect(sql).toMatch(/from ifood_internal\.connections as c\s+where c\.merchant_id = p_merchant_id\s+and c\.status <> 'revoked'/);
    expect(sql).toContain("outcome := 'unknown_merchant'");
    expect(sql).not.toMatch(/p_empresa_id/);
  });

  it('never reuses create_zelo_order or transition_zelo_order for iFood projection', () => {
    expect(sql).not.toContain('public.create_zelo_order(');
    expect(sql).not.toContain('public.transition_zelo_order(');
  });

  it('folds additionalFees into delivery_fee and computes total from already-rounded columns, never trusting orderAmount directly', () => {
    expect(sql).toMatch(/delivery_fee\s*:=\s*coalesce\(\(p_order#>>'\{totals,deliveryfee\}'\)::numeric, 0\)\s*\+\s*coalesce\(\(p_order#>>'\{totals,additionalfees\}'\)::numeric, 0\)/);
    expect(sql).toContain('v_discount := coalesce((p_order#>>\'{totals,benefits}\')::numeric, 0);');
    expect(sql).toContain('v_total := v_subtotal + v_delivery_fee - v_discount;');
    expect(sql).not.toMatch(/v_total\s*:=\s*coalesce\(\(p_order#>>'\{totals,orderamount\}'\)/);
  });

  it('locks the order_refs and zelo_orders rows before deciding, so the RPC is race-safe on its own', () => {
    expect(sql).toContain('from ifood_internal.order_refs\n   where merchant_id = p_merchant_id\n     and external_order_id = p_external_order_id\n   for update;');
    expect(sql).toContain('from public.zelo_orders where id = v_ref.zelo_order_id for update;');
  });

  it('mirrors eventPolicy.js terminal-vs-terminal handling: ambiguous/non-newer is quarantined, strictly newer overrides', () => {
    expect(sql).toContain("v_decision := 'quarantined_terminal_conflict';");
    expect(sql).toMatch(/v_ref\.external_status in \('concluded', 'cancelled'\) and p_external_status in \('concluded', 'cancelled'\)/);
  });

  it('does not touch or re-insert zelo_order_items on a status-only update', () => {
    const updateOrdersIndex = sql.indexOf('update public.zelo_orders as zo set');
    const secondItemsInsertIndex = sql.indexOf('insert into public.zelo_order_items', updateOrdersIndex);
    expect(updateOrdersIndex).toBeGreaterThan(-1);
    expect(secondItemsInsertIndex).toBe(-1);
  });

  it('verifies creation, duplicate no-op, later-event advance, unknown merchant, and tenant isolation transactionally', () => {
    expect(verificationSql).toContain("outcome <> 'applied'");
    expect(verificationSql).toContain("ignored_duplicate");
    expect(verificationSql).toContain("ignored_stale");
    expect(verificationSql).toContain('unknown_merchant');
    expect(verificationSql).toContain('empresa_id must be resolved from the connection');
    expect(verificationSql).toContain('zelo_orders_total_consistent arithmetic mismatch');
    expect(verificationSql).toContain('rollback;');
  });
});

describe('iFood informational event codes (Task 8 requirement observed live 2026-09-16)', () => {
  it('contracts.js exports the informational code set and a matcher helper', () => {
    expect(contractsSource).toContain('IFOOD_INFORMATIONAL_EVENT_CODES');
    expect(contractsSource).toContain('DELIVERY_DROP_CODE_REQUESTED');
    expect(contractsSource).toContain('DELIVERY_DROP_CODE_VALIDATION_SUCCESS');
    expect(contractsSource).toContain('CANCELLATION_REQUESTED');
    expect(contractsSource).toContain('export function isIfoodInformationalEventCode');
  });

  it('eventHandler.js short-circuits informational codes before any RPC or detail fetch', () => {
    expect(eventHandlerSource).toContain('isIfoodInformationalEventCode');
    const informationalCheckIndex = eventHandlerSource.indexOf('isIfoodInformationalEventCode(candidate)');
    const detailFetchIndex = eventHandlerSource.indexOf('await integration.getOrderDetail(');
    const rpcCallIndex = eventHandlerSource.indexOf('await repository.projectOrderEvent(');
    expect(informationalCheckIndex).toBeGreaterThan(-1);
    expect(detailFetchIndex).toBeGreaterThan(informationalCheckIndex);
    expect(rpcCallIndex).toBeGreaterThan(informationalCheckIndex);
  });
});
