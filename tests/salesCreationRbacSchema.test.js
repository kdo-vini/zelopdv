import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813000000_sales_creation_rbac.sql'),
  'utf8',
);

describe('sales creation RBAC migration', () => {
  it('requires both POS capabilities for RPC and non-Mesa inserts', () => {
    expect(migration).toContain("fiado_actor_can('pdv.vender', v_owner)");
    expect(migration).toContain("fiado_actor_can('pdv.receber', v_owner)");
    expect(migration).toContain("elsif new.tipo_pedido = 'mesa'");
    expect(migration).toContain("fiado_actor_can('mesas.fechar', v_owner)");
  });

  it('distinguishes the SECURITY DEFINER POS/offline RPC from direct Mesa close', () => {
    expect(migration).toContain("if current_user = 'postgres' then");
    expect(migration).toContain('create trigger vendas_insert_rbac_guard');
    expect(migration).toContain("v_claim_role = 'service_role'");
    expect(migration).toContain('drop policy if exists vendas_itens_actor_insert');
    expect(migration).toContain('drop policy if exists vendas_pagamentos_actor_insert');
    expect(migration).toContain("tipo_pedido = 'mesa'");
  });

  it('removes anonymous RPC execution while preserving authenticated/service-role access', () => {
    expect(migration).toContain('revoke all on function public.criar_venda_completa(jsonb) from public, anon');
    expect(migration).toContain('grant execute on function public.criar_venda_completa(jsonb) to authenticated, service_role');
  });
});
