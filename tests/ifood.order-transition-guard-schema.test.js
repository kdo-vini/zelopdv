import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_order_transition_guard\.sql$/.test(name))
  .sort()
  .at(-1);

const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n');
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_order_transition_guard.sql'),
  'utf8'
).replace(/\r\n/g, '\n');

const GUARD_LINE = "  if o.source = 'ifood' then raise exception using errcode='ZL409',message='IFOOD_ORDER_REQUIRES_COMMAND'; end if;";
const NOT_FOUND_LINE = "  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;";
const AUTH_LINE = "  if auth.role()<>'service_role' then";

describe('transition_zelo_order/close_zelo_order iFood guard migration', () => {
  it('is a forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('replaces both functions exactly once', () => {
    expect(sql.match(/create or replace function "public"\."close_zelo_order"/gi)).toHaveLength(1);
    expect(sql.match(/create or replace function "public"\."transition_zelo_order"/gi)).toHaveLength(1);
  });

  it('adds the guard immediately after ORDER_NOT_FOUND and before the service_role branch, in both functions', () => {
    const guardCount = sql.split(GUARD_LINE).length - 1;
    expect(guardCount).toBe(2);

    for (const fnStart of [
      sql.indexOf('CREATE OR REPLACE FUNCTION "public"."close_zelo_order"'),
      sql.indexOf('CREATE OR REPLACE FUNCTION "public"."transition_zelo_order"')
    ]) {
      const fnBody = sql.slice(fnStart, fnStart + 2000);
      const notFoundIdx = fnBody.indexOf(NOT_FOUND_LINE);
      const guardIdx = fnBody.indexOf(GUARD_LINE);
      const authIdx = fnBody.indexOf(AUTH_LINE);
      expect(notFoundIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeGreaterThan(notFoundIdx);
      expect(authIdx).toBeGreaterThan(guardIdx);
    }
  });

  it('leaves the pre-existing mesa guard in close_zelo_order untouched', () => {
    expect(sql).toContain("MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED");
  });

  it('does not touch the stock, sale, outbox, or event-log logic of either function', () => {
    // A handful of lines that must survive byte-for-byte from the previously
    // applied body — if any of these break, something beyond the guard changed.
    expect(sql).toContain('v_sale:=public.criar_venda_completa(v_sale_payload);');
    expect(sql).toContain("return public.transition_zelo_order(o.id,o.revision,'deliver',p_actor_id,jsonb_build_object('saleId',v_sale->>'id'));");
    expect(sql).toContain("insert into public.zelo_order_events(order_id,empresa_id,event_type,from_status,to_status,actor_id,detail)");
    expect(sql).toContain("insert into public.zelo_order_outbox(order_id,empresa_id,topic,payload,idempotency_key)");
    expect(sql).toContain("PRODUCT_STOCK_EXCEEDED");
  });

  it('verifies the guard blocks iFood orders, leaves manual/mesa orders working, transactionally', () => {
    expect(verificationSql).toContain('IFOOD_ORDER_REQUIRES_COMMAND');
    expect(verificationSql).toContain("'ifood'");
    expect(verificationSql).toContain("'manual'");
    expect(verificationSql).toContain('MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED');
    expect(verificationSql).toContain('rollback;');
  });
});
