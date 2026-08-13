import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260813094000_canonical_orders_select_rbac.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('canonical orders SELECT RBAC migration', () => {
  it('changes only the three authenticated SELECT policies', () => {
    for (const policy of [
      'zelo_orders_owner_select',
      'zelo_order_items_owner_select',
      'zelo_order_events_owner_select',
    ]) {
      expect(migration).toContain(`alter policy ${policy}`);
    }

    expect(migration.match(/to authenticated/g)).toHaveLength(3);
    expect(migration).not.toMatch(/\b(grant|revoke|create|drop)\b/);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+(?:into|from)?\s*public\./);
  });

  it('preserves owner, queue, and kitchen readers only', () => {
    expect(migration).toContain("ar.permissions ->> 'pedidos.acessar'");
    expect(migration).toContain("ar.permissions ->> 'pedidos.cozinha'");
    expect(migration).not.toContain("ar.permissions ->> 'pedidos.receber'");
    expect(migration).not.toContain("ar.permissions ->> 'pedidos.cancelar'");
    expect(migration).toContain('(select auth.uid()) =');
    expect(migration).toContain('from public.access_users au');
    expect(migration).toContain('join public.access_roles ar');
  });

  it('uses one statement-level permission lookup instead of per-row helpers', () => {
    const parentPolicy = migration.split('alter policy zelo_orders_owner_select')[1]
      .split('alter policy zelo_order_items_owner_select')[0];

    expect(parentPolicy).toContain('select exists');
    expect(parentPolicy).not.toContain('zelo_order_has_permission');
    expect(parentPolicy).not.toContain('fiado_actor_can');
  });

  it('delegates child visibility to the already-gated parent order', () => {
    const itemPolicy = migration.split('alter policy zelo_order_items_owner_select')[1]
      .split('alter policy zelo_order_events_owner_select')[0];
    const eventPolicy = migration.split('alter policy zelo_order_events_owner_select')[1];

    expect(itemPolicy).toContain('from public.zelo_orders o');
    expect(itemPolicy).toContain('o.id = zelo_order_items.order_id');
    expect(itemPolicy).not.toContain('access_roles');

    expect(eventPolicy).toContain('from public.zelo_orders o');
    expect(eventPolicy).toContain('o.id = zelo_order_events.order_id');
    expect(eventPolicy).toContain('o.empresa_id = zelo_order_events.empresa_id');
    expect(eventPolicy).not.toContain('access_roles');
  });
});
