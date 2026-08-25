import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260825123000_customer_order_links.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const compactMigration = migration.replace(/\s+/g, ' ');

const peoplePage = readFileSync(
  resolve('src/routes/gestao/pessoas/+page.svelte'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('vínculos de cliente no pedido canônico', () => {
  it('adiciona pessoa_id com FK anulável e índice por empresa, pessoa e data', () => {
    expect(migration).toContain('add column if not exists pessoa_id uuid');
    expect(migration).toMatch(
      /pessoa_id uuid[^;]*references public\.pessoas\(id\) on delete set null/,
    );
    expect(compactMigration).toContain(
      'zelo_orders_empresa_pessoa_created_idx on public.zelo_orders (empresa_id, pessoa_id, created_at desc)',
    );
  });

  it('valida o proprietário da pessoa e mantém o snapshot do cliente obrigatório', () => {
    expect(migration).toContain('p_pessoa_id uuid default null');
    expect(migration).toMatch(
      /insert into public\.zelo_orders[\s\S]{0,600}pessoa_id[\s\S]{0,600}p_pessoa_id/,
    );
    expect(migration).toContain('p.id_usuario = ep.user_id');
    expect(migration).toContain("column_name = 'customer_snapshot'");
    expect(migration).toContain("is_nullable = 'no'");
    expect(compactMigration).toContain("coalesce(p_snapshots->'customer', '{}'::jsonb)");
  });

  it('preserva o contrato canônico de Mesa sem overload ambíguo e com grants restritos', () => {
    expect(migration).toContain("s.context not in ('public_order', 'table_order')");
    expect(migration).toContain("'source', v_source");
    expect(migration).toContain("v_source = 'mesa'");
    expect(migration).toContain("message = 'comanda_closed'");
    expect(migration).toContain("message = 'table_session_expired'");
    expect(migration).not.toContain('create or replace function public.create_zelo_order(\n  p_session_id uuid,\n  p_expected_revision integer,\n  p_idempotency_key text,\n  p_snapshots jsonb\n)');
    expect(migration).toContain('drop function if exists public.create_zelo_order(uuid, integer, text, jsonb);');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain('to service_role');
  });

  it('desvincula vendas e pedidos antes da exclusão, sem apagar histórico', () => {
    const unlinkSales = migration.indexOf('update public.vendas');
    const unlinkOrders = migration.indexOf('update public.zelo_orders');
    const deletePeople = migration.indexOf('delete from public.pessoas');

    expect(unlinkSales).toBeGreaterThanOrEqual(0);
    expect(unlinkOrders).toBeGreaterThan(unlinkSales);
    expect(deletePeople).toBeGreaterThan(unlinkOrders);
    expect(migration).toContain('set id_cliente = null');
    expect(migration).toContain('set pessoa_id = null');
    expect(migration).toContain('update public.fiado_lancamentos');
    expect(migration).not.toMatch(/delete\s+from\s+public\.fiado_lancamentos/);
    expect(migration).toContain('coalesce(v_pessoa.saldo_fiado, 0) <> 0');
    expect(migration).not.toMatch(/delete\s+from\s+public\.(vendas|zelo_orders)/);
  });

  it('explica que vendas e pedidos continuam sem vínculo após a exclusão', () => {
    expect(peoplePage).toContain('vendas e pedidos permanecem sem vínculo');
  });
});
