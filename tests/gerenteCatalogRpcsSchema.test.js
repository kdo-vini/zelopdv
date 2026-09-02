import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('supabase/migrations/20260902131000_gerente_catalog_rpcs.sql');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase() : '';
const compact = sql.replace(/\s+/g, ' ');

describe('gerente catalog RPCs migration', () => {
  it('define as seis funções com security definer e search_path fixo', () => {
    for (const fn of ['gerente_resolve_owner', 'gerente_set_menu_pause', 'gerente_set_ocultar_pdv', 'gerente_criar_categoria', 'gerente_criar_produto', 'gerente_alterar_preco']) {
      expect(sql).toContain(`create or replace function public.${fn}(`);
    }
    expect((sql.match(/security definer/g) || []).length).toBeGreaterThanOrEqual(6);
    expect((sql.match(/set search_path = public, pg_temp/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('detecta service_role pelo GUC role e exige produtos.gerenciar para usuários', () => {
    expect(compact).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
    expect(sql).not.toContain('auth.role()');
    expect(sql).not.toContain('request.jwt.claim.role');
    expect(compact).toContain("fiado_actor_can('produtos.gerenciar', v_owner)");
    expect(compact).toContain("message = 'service_role_owner_required'");
  });

  it('pausar no cardápio só toca zelomenu_product_publications.pausado_manualmente', () => {
    const pauseBody = sql.slice(sql.indexOf('function public.gerente_set_menu_pause('), sql.indexOf('function public.gerente_set_ocultar_pdv('));
    expect(pauseBody).toContain('update public.zelomenu_product_publications');
    expect(pauseBody).toContain('set pausado_manualmente = p_pausado');
    expect(pauseBody).not.toContain('ocultar_no_pdv');
    expect(pauseBody).not.toContain('visivel_online =');
    expect(pauseBody).toContain("message = 'produto_nao_publicado'");
  });

  it('criar categoria é idempotente por nome e criar produto rejeita duplicado', () => {
    expect(compact).toContain("lower(trim(nome)) = lower(trim(p_nome))");
    expect(sql).toContain("'created', false");
    expect(compact).toContain("message = 'produto_duplicado'");
    expect(compact).toContain("message = 'categoria_nao_encontrada'");
    expect(compact).toContain("pg_advisory_xact_lock(hashtext(v_owner::text || ':categoria:' || lower(trim(p_nome))))");
    expect(compact).toContain("pg_advisory_xact_lock(hashtext(v_owner::text || ':produto:' || lower(trim(p_nome))))");
  });

  it('grants: authenticated e service_role executam; anon não', () => {
    for (const sig of [
      'gerente_set_menu_pause(bigint, boolean, uuid)',
      'gerente_set_ocultar_pdv(bigint, boolean, uuid)',
      'gerente_criar_categoria(text, uuid)',
      'gerente_criar_produto(text, numeric, bigint, uuid, boolean, integer)',
      'gerente_alterar_preco(bigint, numeric, uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${sig} to authenticated, service_role`);
    }
    expect(sql).not.toMatch(/grant execute on function public\.gerente_\w+\([^)]*\) to anon/);
  });
});
