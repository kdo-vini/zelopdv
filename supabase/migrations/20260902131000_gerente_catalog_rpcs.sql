-- supabase/migrations/20260902131000_gerente_catalog_rpcs.sql
-- RPCs owner-scoped usadas pelo Zelinho Gerente (servidor, service_role com p_owner)
-- e reutilizáveis pela UI (authenticated, capability produtos.gerenciar).
-- Fronteira de visibilidade: pausar no cardápio nunca toca produtos.ocultar_no_pdv.

create or replace function public.gerente_resolve_owner(p_owner uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false);
  v_actor uuid := auth.uid();
  v_owner uuid;
begin
  if v_service then
    if p_owner is null then
      raise exception using errcode = '22023', message = 'SERVICE_ROLE_OWNER_REQUIRED';
    end if;
    return p_owner;
  end if;

  if v_actor is null then
    raise exception using errcode = '28000', message = 'NAO_AUTENTICADO';
  end if;
  v_owner := public.get_owner_user_id(v_actor);
  if v_owner is null or not public.fiado_actor_can('produtos.gerenciar', v_owner) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO_PRODUTOS';
  end if;
  return v_owner;
end;
$$;

create or replace function public.gerente_set_menu_pause(
  p_produto_id bigint,
  p_pausado boolean,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text;
  v_anterior boolean;
  v_visivel boolean;
  v_atual boolean;
begin
  if p_pausado is null then
    raise exception using errcode = '22023', message = 'PAUSADO_INVALIDO';
  end if;

  select nome into v_nome
    from public.produtos
   where id = p_produto_id and id_usuario = v_owner;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
  end if;

  select pausado_manualmente, visivel_online into v_anterior, v_visivel
    from public.zelomenu_product_publications
   where id_usuario = v_owner and id_produto = p_produto_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_PUBLICADO';
  end if;

  update public.zelomenu_product_publications
     set pausado_manualmente = p_pausado,
         updated_at = now()
   where id_usuario = v_owner and id_produto = p_produto_id
   returning pausado_manualmente into v_atual;

  return jsonb_build_object(
    'produto_id', p_produto_id,
    'nome', v_nome,
    'pausado_anterior', v_anterior,
    'pausado_manualmente', v_atual,
    'visivel_online', v_visivel
  );
end;
$$;

create or replace function public.gerente_set_ocultar_pdv(
  p_produto_id bigint,
  p_ocultar boolean,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text;
  v_anterior boolean;
  v_atual boolean;
begin
  if p_ocultar is null then
    raise exception using errcode = '22023', message = 'OCULTAR_INVALIDO';
  end if;

  select nome, ocultar_no_pdv into v_nome, v_anterior
    from public.produtos
   where id = p_produto_id and id_usuario = v_owner
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
  end if;

  update public.produtos
     set ocultar_no_pdv = p_ocultar
   where id = p_produto_id and id_usuario = v_owner
   returning ocultar_no_pdv into v_atual;

  return jsonb_build_object(
    'produto_id', p_produto_id,
    'nome', v_nome,
    'ocultar_anterior', v_anterior,
    'ocultar_no_pdv', v_atual
  );
end;
$$;

create or replace function public.gerente_criar_categoria(
  p_nome text,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text := trim(coalesce(p_nome, ''));
  v_id bigint;
  v_ordem integer;
  v_existente record;
begin
  if length(v_nome) < 2 or length(v_nome) > 60 then
    raise exception using errcode = '22023', message = 'NOME_INVALIDO';
  end if;

  select id, nome, ordem into v_existente
    from public.categorias
   where id_usuario = v_owner
     and lower(trim(nome)) = lower(trim(p_nome))
   order by id
   limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'nome', v_existente.nome, 'ordem', v_existente.ordem, 'created', false);
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from public.categorias
   where id_usuario = v_owner;

  insert into public.categorias (id_usuario, nome, ordem)
  values (v_owner, v_nome, v_ordem)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nome', v_nome, 'ordem', v_ordem, 'created', true);
end;
$$;

create or replace function public.gerente_criar_produto(
  p_nome text,
  p_preco numeric,
  p_categoria_id bigint,
  p_owner uuid default null,
  p_controlar_estoque boolean default false,
  p_estoque_atual integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text := trim(coalesce(p_nome, ''));
  v_categoria record;
  v_controlar boolean := coalesce(p_controlar_estoque, false);
  v_estoque integer := greatest(coalesce(p_estoque_atual, 0), 0);
  v_id bigint;
begin
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception using errcode = '22023', message = 'NOME_INVALIDO';
  end if;
  if p_preco is null or p_preco < 0 or p_preco > 99999 then
    raise exception using errcode = '22023', message = 'PRECO_INVALIDO';
  end if;

  select id, nome, controlar_estoque_compartilhado into v_categoria
    from public.categorias
   where id = p_categoria_id and id_usuario = v_owner;
  if not found then
    raise exception using errcode = 'P0002', message = 'CATEGORIA_NAO_ENCONTRADA';
  end if;

  if exists (
    select 1 from public.produtos
     where id_usuario = v_owner and lower(trim(nome)) = lower(trim(p_nome))
  ) then
    raise exception using errcode = '23505', message = 'PRODUTO_DUPLICADO';
  end if;

  -- Categoria com estoque compartilhado controla o estoque; o produto não.
  if v_categoria.controlar_estoque_compartilhado then
    v_controlar := false;
    v_estoque := 0;
  end if;

  insert into public.produtos (id_usuario, nome, preco, id_categoria, controlar_estoque, estoque_atual, eh_item_por_unidade, ocultar_no_pdv)
  values (v_owner, v_nome, round(p_preco, 2), p_categoria_id, v_controlar, v_estoque, false, false)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'nome', v_nome,
    'preco', round(p_preco, 2),
    'id_categoria', p_categoria_id,
    'categoria_nome', v_categoria.nome
  );
end;
$$;

create or replace function public.gerente_alterar_preco(
  p_produto_id bigint,
  p_preco numeric,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text;
  v_anterior numeric;
  v_atual numeric;
begin
  if p_preco is null or p_preco < 0 or p_preco > 99999 then
    raise exception using errcode = '22023', message = 'PRECO_INVALIDO';
  end if;

  select nome, preco into v_nome, v_anterior
    from public.produtos
   where id = p_produto_id and id_usuario = v_owner
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
  end if;

  update public.produtos
     set preco = round(p_preco, 2)
   where id = p_produto_id and id_usuario = v_owner
   returning preco into v_atual;

  return jsonb_build_object(
    'produto_id', p_produto_id,
    'nome', v_nome,
    'preco_anterior', v_anterior,
    'preco', v_atual
  );
end;
$$;

revoke all on function public.gerente_resolve_owner(uuid) from public, anon, authenticated;
grant execute on function public.gerente_resolve_owner(uuid) to authenticated, service_role;

revoke all on function public.gerente_set_menu_pause(bigint, boolean, uuid) from public, anon, authenticated;
grant execute on function public.gerente_set_menu_pause(bigint, boolean, uuid) to authenticated, service_role;

revoke all on function public.gerente_set_ocultar_pdv(bigint, boolean, uuid) from public, anon, authenticated;
grant execute on function public.gerente_set_ocultar_pdv(bigint, boolean, uuid) to authenticated, service_role;

revoke all on function public.gerente_criar_categoria(text, uuid) from public, anon, authenticated;
grant execute on function public.gerente_criar_categoria(text, uuid) to authenticated, service_role;

revoke all on function public.gerente_criar_produto(text, numeric, bigint, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.gerente_criar_produto(text, numeric, bigint, uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.gerente_alterar_preco(bigint, numeric, uuid) from public, anon, authenticated;
grant execute on function public.gerente_alterar_preco(bigint, numeric, uuid) to authenticated, service_role;
