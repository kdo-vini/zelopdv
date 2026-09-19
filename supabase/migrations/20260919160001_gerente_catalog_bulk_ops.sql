-- Operações destrutivas do catálogo em uma única transação. A prévia continua
-- sendo calculada no servidor; esta RPC revalida o histórico no momento da
-- confirmação e nunca recebe owner vindo do modelo sem a fronteira existente.
create or replace function public.gerente_excluir_catalogo(
  p_produto_ids bigint[] default '{}',
  p_categoria_ids bigint[] default '{}',
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_excluidos jsonb := '[]'::jsonb;
  v_arquivados jsonb := '[]'::jsonb;
  v_categorias_excluidas jsonb := '[]'::jsonb;
  v_categorias_bloqueadas jsonb := '[]'::jsonb;
begin
  with vendidos as (
    select distinct vi.id_produto
      from public.vendas_itens vi
      join public.vendas v on v.id = vi.id_venda
     where v.id_usuario = v_owner
       and vi.id_produto = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select distinct ci.id_produto
      from public.comanda_itens ci
      join public.comandas c on c.id = ci.id_comanda
     where c.id_usuario = v_owner
       and ci.id_produto = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select distinct oi.product_id
      from public.zelo_order_items oi
     where oi.product_id = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select p.id
      from public.produtos p
     where p.id_usuario = v_owner
       and p.tipo_produto = 'pizza'
       and p.id = any(coalesce(p_produto_ids, '{}'::bigint[]))
  ), apagados as (
    delete from public.produtos p
     where p.id_usuario = v_owner
       and p.id = any(coalesce(p_produto_ids, '{}'::bigint[]))
       and not exists (select 1 from vendidos v where v.id_produto = p.id)
     returning p.id, p.nome
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome)), '[]'::jsonb)
    into v_excluidos
    from apagados;

  with vendidos as (
    select distinct vi.id_produto
      from public.vendas_itens vi
      join public.vendas v on v.id = vi.id_venda
     where v.id_usuario = v_owner
       and vi.id_produto = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select distinct ci.id_produto
      from public.comanda_itens ci
      join public.comandas c on c.id = ci.id_comanda
     where c.id_usuario = v_owner
       and ci.id_produto = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select distinct oi.product_id
      from public.zelo_order_items oi
     where oi.product_id = any(coalesce(p_produto_ids, '{}'::bigint[]))
    union
    select p.id
      from public.produtos p
     where p.id_usuario = v_owner
       and p.tipo_produto = 'pizza'
       and p.id = any(coalesce(p_produto_ids, '{}'::bigint[]))
  ), atualizados as (
    update public.produtos p
       set ocultar_no_pdv = true
     where p.id_usuario = v_owner
       and p.id in (select id_produto from vendidos)
     returning p.id, p.nome
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome)), '[]'::jsonb)
    into v_arquivados
    from atualizados;

  update public.zelomenu_product_publications pub
     set pausado_manualmente = true,
         updated_at = now()
   where pub.id_usuario = v_owner
     and pub.id_produto in (
       select (item->>'id')::bigint from jsonb_array_elements(v_arquivados) item
     );

  with candidatos as (
    select c.id, c.nome
      from public.categorias c
     where c.id_usuario = v_owner
       and c.id = any(coalesce(p_categoria_ids, '{}'::bigint[]))
  ), apagadas as (
    delete from public.categorias c
     using candidatos x
     where c.id = x.id
       and not exists (select 1 from public.produtos p where p.id_usuario = v_owner and p.id_categoria = c.id)
       and not exists (select 1 from public.subcategorias s where s.id_usuario = v_owner and s.id_categoria = c.id)
       and not exists (
         select 1
           from public.pizza_config_revisions r
           cross join lateral jsonb_each(r.stock_config) bucket
          where r.owner_user_id = v_owner
            and (bucket.value->>'shared')::boolean
            and (bucket.value->>'categoryId')::bigint = c.id
       )
     returning c.id, c.nome
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome)), '[]'::jsonb)
    into v_categorias_excluidas
    from apagadas;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome)), '[]'::jsonb)
    into v_categorias_bloqueadas
    from public.categorias x
   where x.id_usuario = v_owner
     and x.id = any(coalesce(p_categoria_ids, '{}'::bigint[]))
     and not exists (select 1 from jsonb_array_elements(v_categorias_excluidas) item where (item->>'id')::bigint = x.id);

  return jsonb_build_object(
    'excluidos', v_excluidos,
    'arquivados', v_arquivados,
    'categorias_excluidas', v_categorias_excluidas,
    'categorias_bloqueadas', v_categorias_bloqueadas
  );
end;
$$;

revoke all on function public.gerente_excluir_catalogo(bigint[], bigint[], uuid) from public, anon, authenticated;
grant execute on function public.gerente_excluir_catalogo(bigint[], bigint[], uuid) to authenticated, service_role;
