import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_sales_and_reversals\.sql$/.test(name))
  .sort()
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n').toLowerCase();
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_sales_and_reversals.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();
const repairMigrationName = readdirSync(migrationDir)
  .find((name) => /^\d+_fix_ifood_sale_materialization\.sql$/.test(name));
const repairSql = repairMigrationName
  ? readFileSync(resolve(migrationDir, repairMigrationName), 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';

const rpcSignatures = [
  'materialize_ifood_sale_v1(text, text)',
  'reverse_ifood_sale_v1(text, text, text)'
];

describe('iFood sales materialization and reversal schema', () => {
  it('makes the sale numbering trigger safe under the iFood RPC empty search path and reconciles missed sales', () => {
    expect(repairSql).toContain('create or replace function public.set_numero_venda()');
    expect(repairSql).toContain("set search_path = ''");
    expect(repairSql).toContain('from public.vendas');
    expect(repairSql).toContain('public.materialize_ifood_sale_v1');
    expect(repairSql).toContain('set local role service_role');
  });
  it('uses a CLI-generated forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('hardens every new RPC the same way as the Task 12 product-mapping migration', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).toContain("raise exception 'forbidden'");
    for (const signature of rpcSignatures) {
      const functionName = signature.split('(')[0];
      expect(sql).toContain(`create or replace function public.${functionName}`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toMatch(/grant execute[\s\S]+to (?:anon|authenticated)/);
  });

  it('adds vendas.canal_origem with the exact channel enum and an owner/date/channel index', () => {
    expect(sql).toContain('add column if not exists canal_origem text');
    expect(sql).toContain('vendas_canal_origem_check');
    expect(sql).toContain("check (canal_origem = any (array[\n    'pdv'::text, 'zelomenu'::text, 'zelochat'::text,\n    'mesa'::text, 'manual'::text, 'ifood'::text\n  ]));");
    expect(sql).toContain('idx_vendas_usuario_created_canal');
    expect(sql).toContain('on public.vendas (id_usuario, created_at, canal_origem)');
  });

  it('backfills canal_origem from zelo_orders.sale_id first, mapping legacy sources, and defaults to pdv', () => {
    expect(sql).toContain("from public.zelo_orders as zo");
    expect(sql).toContain('zo.sale_id = v.id');
    expect(sql).toContain("when 'whatsapp' then 'zelochat'");
    expect(sql).toContain("when 'legacy_zelochat' then 'zelochat'");
    expect(sql).toContain("when 'legacy_pedido' then 'pdv'");
    expect(sql).toContain("set canal_origem = 'pdv'\nwhere canal_origem is null;");
  });

  it('creates vendas_estornos with a unique event_id and at most one applied row per sale', () => {
    expect(sql).toContain('create table if not exists public.vendas_estornos');
    expect(sql).toContain('vendas_estornos_status_check');
    expect(sql).toContain("check (status in ('applied', 'pending_review'))");
    expect(sql).toContain('vendas_estornos_event_id_unique unique (event_id)');
    expect(sql).toContain('idx_vendas_estornos_applied_per_venda');
    expect(sql).toContain("on public.vendas_estornos (id_venda)\n  where status = 'applied';");
    expect(sql).toContain('alter table public.vendas_estornos enable row level security');
    expect(sql).toContain('revoke all on table public.vendas_estornos from public, anon;');
  });

  it('materializes only id_caixa null, coerces fiado to outro, and never touches vendas_taxas_plataforma', () => {
    expect(sql).toContain("v_order.status <> 'delivered'");
    expect(sql).toContain("outcome := 'not_delivered'");
    expect(sql).toContain('null, v_client_sale_id, coalesce(v_order.total, 0)');
    expect(sql).toContain("when v_declared = 'fiado' then 'outro'");
    expect(sql).toContain("when v_method_id = 'fiado' then 'outro'");
    expect(sql).toContain("'zelo-order:' || v_order.id");
    expect(sql).toContain('from public.zelo_order_items as i');
    expect(sql).toContain('coalesce(i.modifiers');
    expect(sql).not.toContain('vendas_taxas_plataforma');
    expect(sql).not.toContain('pessoas');
  });

  it('reversal keeps the venda, dedupes by event_id and one-applied-per-sale, and marks ambiguity as pending_review', () => {
    expect(sql).toContain("outcome := 'duplicate'");
    expect(sql).toContain("outcome := 'no_sale'");
    expect(sql).toContain("v_status := 'pending_review'");
    expect(sql).toContain("v_status := 'applied'");
    expect(sql).toContain("v_order.status <> 'cancelled'");
    expect(sql).toContain('v_order.total is distinct from v_venda.valor_total');
    expect(sql).not.toMatch(/delete\s+from\s+public\.vendas\b/);
  });

  it('replaces ensure_zelo_order_sale to delegate iFood to materialize and stamp canal_origem for other sources', () => {
    expect(sql).toContain('create or replace function public.ensure_zelo_order_sale');
    expect(sql).toContain("if v_order.source = 'ifood' then");
    expect(sql).toContain("if v_order.status <> 'delivered' then");
    expect(sql).toContain('ifood_internal.order_refs as r');
    expect(sql).toContain('r.zelo_order_id = v_order.id');
    expect(sql).toContain('public.materialize_ifood_sale_v1(v_ifood_merchant_id, v_ifood_external_order_id)');
    expect(sql).toContain('v_canal_origem := case v_order.source');
    expect(sql).toContain("when 'zelomenu' then 'zelomenu'");
    expect(sql).toContain("when 'manual' then 'manual'");
  });

  it('transactionally verifies materialize/reverse behaviour across two companies', () => {
    for (const marker of [
      'browser role can execute',
      'materialize_ifood_sale_v1',
      'reverse_ifood_sale_v1',
      'id_caixa is null',
      'already_exists',
      'not_delivered',
      'duplicate',
      'no_sale',
      'pending_review',
      'applied',
      'canal_origem',
      'cross-tenant',
      'rollback;'
    ]) {
      expect(verificationSql).toContain(marker);
    }
    expect(verificationSql).toContain('set local role service_role');
  });
});
