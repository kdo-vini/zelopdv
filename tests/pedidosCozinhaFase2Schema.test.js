import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceMesaSql = readFileSync(
  resolve('.ai/migrations/pedidos_cozinha_source_mesa_and_drop_2026_07_28.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

const entitlementSql = readFileSync(
  resolve('.ai/migrations/pedidos_cozinha_entitlement_columns_drop_2026_07_28.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('fase 2A — pedidos/cozinha e source mesa', () => {
  it('keeps the legacy drop and delete_account replacement in one transaction', () => {
    expect(sourceMesaSql.indexOf('begin;')).toBeGreaterThanOrEqual(0);
    expect(sourceMesaSql.indexOf('delete_account')).toBeLessThan(sourceMesaSql.indexOf('drop table public.pedidos'));
    expect(sourceMesaSql).toContain("pg_get_functiondef('public.delete_account(uuid,text)'::regprocedure)");
    expect(sourceMesaSql).toContain('execute v_definition;');
    expect(sourceMesaSql).toContain('drop table public.pedido_itens;');
    expect(sourceMesaSql).toContain('drop table public.pedidos;');
    expect(sourceMesaSql).toContain('drop function public.proximo_numero_pedido(uuid);');
    expect(sourceMesaSql).toContain('commit;');
  });

  it('routes table orders to the canonical aggregate and preserves function ACLs', () => {
    expect(sourceMesaSql).toContain("'table_order'");
    expect(sourceMesaSql).toContain("'source','mesa'");
    expect(sourceMesaSql).toContain('public.create_zelo_order(');
    expect(sourceMesaSql).toContain("message='comanda_closed'");
    expect(sourceMesaSql).toContain("message='table_session_expired'");
    expect(sourceMesaSql).not.toMatch(/insert into public\.pedidos/);
    expect(sourceMesaSql).not.toMatch(/insert into public\.pedido_itens/);
    expect(sourceMesaSql).not.toMatch(/drop function public\.confirm_zelomenu_cart/);
  });

  it('distinguishes QR table stock from a comanda item already reserved by the PDV', () => {
    expect(sourceMesaSql).toContain("v_source='mesa'\n      and nullif(p_snapshots#>>'{fulfillment,comandaitemid}','') is not null");
    expect(sourceMesaSql).toContain("case when v_stock_already_committed then now() else null end");
    expect(sourceMesaSql).toContain("o.source <> ''mesa'' or o.fulfillment->>''comandaitemid'' is null");
    expect(sourceMesaSql).toContain("v_order.source = ''mesa''");
    expect(sourceMesaSql).toContain('mesa_order_financial_close_not_allowed');
  });
});

describe('fase 2B — remoção das flags de addon legado', () => {
  it('rebuilds user_entitlements without the removed flag before dropping columns', () => {
    expect(entitlementSql).toContain('drop view public.user_entitlements;');
    expect(entitlementSql).toContain('create view public.user_entitlements as');
    expect(entitlementSql).toContain('has_mesas_addon');
    expect(entitlementSql).toContain('has_acessos_addon');
    const viewSql = entitlementSql.slice(
      entitlementSql.indexOf('create view public.user_entitlements as'),
      entitlementSql.indexOf('revoke all on public.user_entitlements'),
    );
    expect(viewSql).not.toContain('has_pedidos_addon');
    expect(entitlementSql).toContain('alter table public.subscriptions drop column has_pedidos_addon;');
    expect(entitlementSql).toContain('alter table public.billing_payments drop column has_pedidos_addon;');
    expect(entitlementSql).toContain('grant select, insert, update, delete, truncate, references, trigger');
  });
});
