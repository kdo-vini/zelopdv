import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve('.ai/migrations/canonical_online_orders_2026_07_12.sql'), 'utf8')
  .replace(/\r\n/g, '\n').toLowerCase();

describe('canonical online orders migration', () => {
  it('creates the canonical aggregate, audit trail and durable outbox', () => {
    for (const table of ['zelo_orders', 'zelo_order_items', 'zelo_order_events', 'zelo_order_outbox']) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });
  it('enforces idempotency and optimistic concurrency', () => {
    expect(sql).toContain('zelo_orders_session_uidx');
    expect(sql).toContain('zelo_orders_idempotency_uidx');
    expect(sql).toContain("message='revision_conflict'");
    expect(sql).toContain('for update');
    expect(sql).toContain("coalesce(v_item->'selectedmodifiers',v_item->'modifiers','[]')");
  });
  it('provides transitions and controlled grants', () => {
    for (const fn of ['create_zelo_order', 'transition_zelo_order', 'accept_zelo_order', 'reject_zelo_order', 'close_zelo_order']) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect(sql).toContain('to authenticated,service_role');
    expect(sql).toContain('outbox is deliberately service-role only');
  });
  it('enforces role permissions for every authenticated transition', () => {
    expect(sql).toContain('function public.zelo_order_has_permission');
    expect(sql).toContain("au.status='active'");
    expect(sql).toContain("'pedidos.cancelar'");
    expect(sql).toContain("'pedidos.receber'");
    expect(sql).toContain("'pedidos.cozinha'");
    expect(sql).toContain("'pedidos.acessar'");
    expect(sql).toContain("message='order_permission_denied'");
    expect(sql).toContain("public.zelo_order_has_permission(o.empresa_id,'pedidos.receber')");
  });
  it('backfills deterministically without deleting legacy rows', () => {
    expect(sql).toContain('from public.zelochat_orders z');
    expect(sql).toContain("p.origem in ('zelomenu','zelochat')");
    expect(sql).toContain('on conflict (legacy_zelochat_order_id)');
    expect(sql).not.toMatch(/delete\s+from\s+public\.(zelochat_orders|pedidos)/);
  });
});

describe('canonical legacy totals repair', () => {
  const repairSql = readFileSync(resolve('.ai/migrations/canonical_online_orders_legacy_totals_fix_2026_07_12.sql'), 'utf8');

  it('allocates rounding residue deterministically and aborts on mismatched totals', () => {
    expect(repairSql).toContain('rn=line_count');
    expect(repairSql).toContain('CANONICAL_LEGACY_ITEM_TOTAL_MISMATCH');
    expect(repairSql).toContain('legacy_zelochat_order_id is not null');
  });
});
