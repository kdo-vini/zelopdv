-- Preserve the separate estoque.ajustar capability while catalog writes are
-- restricted to produtos.gerenciar.  The RPCs expose only the stock columns;
-- a stock-only role cannot use them to rename products or change prices.

create or replace function public.ajustar_estoque_produto(
  p_produto_id bigint,
  p_estoque integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result integer;
begin
  if p_estoque is null or p_estoque < 0 then
    raise exception 'Estoque inválido' using errcode = '22023';
  end if;

  if auth.role() = 'service_role' then
    update public.produtos
       set estoque_atual = p_estoque
     where id = p_produto_id
     returning estoque_atual into v_result;
  else
    if v_actor is null then
      raise exception 'Não autorizado' using errcode = '42501';
    end if;

    v_owner := public.get_owner_user_id(v_actor);
    if v_actor <> v_owner and not exists (
      select 1
        from public.access_users au
        join public.access_roles ar
          on ar.id = au.role_id
         and ar.owner_user_id = au.owner_user_id
       where au.auth_user_id = v_actor
         and au.owner_user_id = v_owner
         and au.status = 'active'
         and ar.permissions @> '{"estoque.ajustar": true}'::jsonb
    ) then
      raise exception 'Sem permissão para ajustar estoque' using errcode = '42501';
    end if;

    update public.produtos
       set estoque_atual = p_estoque
     where id = p_produto_id
       and id_usuario = v_owner
     returning estoque_atual into v_result;
  end if;

  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.ajustar_estoque_categoria(
  p_categoria_id bigint,
  p_estoque integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result integer;
begin
  if p_estoque is null or p_estoque < 0 then
    raise exception 'Estoque inválido' using errcode = '22023';
  end if;

  if auth.role() = 'service_role' then
    update public.categorias
       set estoque_compartilhado_atual = p_estoque
     where id = p_categoria_id
     returning estoque_compartilhado_atual into v_result;
  else
    if v_actor is null then
      raise exception 'Não autorizado' using errcode = '42501';
    end if;

    v_owner := public.get_owner_user_id(v_actor);
    if v_actor <> v_owner and not exists (
      select 1
        from public.access_users au
        join public.access_roles ar
          on ar.id = au.role_id
         and ar.owner_user_id = au.owner_user_id
       where au.auth_user_id = v_actor
         and au.owner_user_id = v_owner
         and au.status = 'active'
         and ar.permissions @> '{"estoque.ajustar": true}'::jsonb
    ) then
      raise exception 'Sem permissão para ajustar estoque' using errcode = '42501';
    end if;

    update public.categorias
       set estoque_compartilhado_atual = p_estoque
     where id = p_categoria_id
       and id_usuario = v_owner
     returning estoque_compartilhado_atual into v_result;
  end if;

  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.ajustar_estoque_produto(bigint, integer) from public, anon;
revoke all on function public.ajustar_estoque_categoria(bigint, integer) from public, anon;
grant execute on function public.ajustar_estoque_produto(bigint, integer) to authenticated, service_role;
grant execute on function public.ajustar_estoque_categoria(bigint, integer) to authenticated, service_role;
