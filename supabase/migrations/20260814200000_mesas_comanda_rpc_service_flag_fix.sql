-- Hotfix: restore Mesa comanda mutations broken by a three-valued service flag.
--
-- 20260812234500_mesas_operational_rpc_rbac.sql introduced
--   v_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
-- PostgREST stopped populating the legacy per-claim GUCs (request.jwt.claim.*)
-- in v9; Supabase only sets request.jwt.claims. current_setting therefore
-- returns NULL, so v_service is NULL rather than false and:
--   * `if not v_service then v_owner := get_owner_user_id(v_actor); end if;`
--     never runs, leaving v_owner NULL;
--   * `and (v_service or id_usuario = v_owner)` evaluates to NULL, matching no
--     row, so every caller hit 'Comanda aberta nao encontrada'.
-- This blocked adding items, closing and cancelling comandas for owners and
-- sub-users alike.
--
-- The fix keeps the exact same authorization contract and only makes the
-- service-role probe two-valued. Detection now prefers current_setting('role'),
-- the pattern already adopted in 20260813095000: SECURITY DEFINER changes
-- current_user to postgres but preserves the caller's SET ROLE, which PostgREST
-- derives from the JWT. The legacy GUC is kept as a fallback for maintenance
-- sessions that still set it. v_owner is now asserted non-null before it can
-- reach a predicate, so a future resolution failure raises instead of silently
-- matching nothing.
-- Forward-only: never rewrite an applied migration.

create or replace function public.comanda_aplicar_delta_item(
  p_id_comanda uuid,
  p_id_produto integer,
  p_delta integer,
  p_preco_unitario numeric default null,
  p_modifiers jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  v_comanda record;
  v_produto record;
  v_item record;
  v_qtd_atual integer;
  v_qtd_delta integer;
  v_qtd_devolver integer;
  v_unit_price numeric(10,2);
  v_modifiers jsonb := coalesce(p_modifiers, '[]'::jsonb);
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if p_delta is null or p_delta = 0 then
    return;
  end if;
  if p_id_produto is null then
    raise exception 'Produto obrigatorio';
  end if;
  if jsonb_typeof(v_modifiers) <> 'array' then
    raise exception 'Montagem invalida';
  end if;

  if not v_service then
    v_owner := public.get_owner_user_id(v_actor);
    if v_owner is null then
      raise exception 'Usuario nao autenticado';
    end if;
  end if;

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;

  if not v_service and not public.fiado_actor_can('mesas.editar_itens', v_owner) then
    raise exception 'Voce nao tem permissao para editar itens da mesa.' using errcode = '42501';
  end if;

  select p.id, p.nome, p.preco, p.controlar_estoque, coalesce(p.estoque_atual, 0) as estoque_atual
    into v_produto
    from public.produtos p
   where p.id = p_id_produto
     and p.id_usuario = v_owner
   for update;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  v_unit_price := round(coalesce(p_preco_unitario, v_produto.preco)::numeric, 2);
  if v_unit_price < 0 then
    raise exception 'Preco invalido';
  end if;

  select *
    into v_item
    from public.comanda_itens
   where id_comanda = p_id_comanda
     and id_produto = p_id_produto
     and coalesce(modifiers, '[]'::jsonb) = v_modifiers
   for update;

  if p_delta > 0 then
    v_qtd_delta := p_delta;

    for v_stock in
      select requirements.id_produto,
             products.nome,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner
           and coalesce(estoque_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      end if;
    end loop;

    if v_item.id is null then
      insert into public.comanda_itens (
        id_comanda, id_produto, quantidade, preco_unitario, observacao,
        estoque_baixado, modifiers, nome_produto_na_venda
      ) values (
        p_id_comanda, p_id_produto, v_qtd_delta, v_unit_price, null,
        exists (
          select 1
            from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
            join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
            left join public.categorias categories on categories.id = products.id_categoria
           where coalesce(products.controlar_estoque, false)
              or coalesce(categories.controlar_estoque_compartilhado, false)
        ),
        v_modifiers,
        v_produto.nome
      );
    else
      update public.comanda_itens
         set quantidade = greatest(1, round(coalesce(quantidade, 0))::integer) + v_qtd_delta,
             preco_unitario = v_unit_price,
             estoque_baixado = estoque_baixado or exists (
               select 1
                 from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
                 join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
                 left join public.categorias categories on categories.id = products.id_categoria
                where coalesce(products.controlar_estoque, false)
                   or coalesce(categories.controlar_estoque_compartilhado, false)
             )
       where id = v_item.id;
    end if;
    return;
  end if;

  if v_item.id is null then
    raise exception 'Item nao encontrado na comanda';
  end if;

  v_qtd_atual := greatest(0, round(coalesce(v_item.quantidade, 0))::integer);
  v_qtd_devolver := least(abs(p_delta), v_qtd_atual);
  if v_qtd_devolver <= 0 then
    return;
  end if;

  if coalesce(v_item.estoque_baixado, false) then
    for v_stock in
      select requirements.id_produto,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_devolver) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner;
      end if;
    end loop;
  end if;

  if v_qtd_atual - v_qtd_devolver <= 0 then
    delete from public.comanda_itens where id = v_item.id;
  else
    update public.comanda_itens
       set quantidade = v_qtd_atual - v_qtd_devolver
     where id = v_item.id;
  end if;
end;
$$;

create or replace function public.comanda_cancelar_com_estoque(p_id_comanda uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if not v_service then
    v_owner := public.get_owner_user_id(v_actor);
    if v_owner is null then
      raise exception 'Usuario nao autenticado';
    end if;
  end if;

  select id, id_mesa, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;
  if not v_service and not public.fiado_actor_can('mesas.cancelar', v_owner) then
    raise exception 'Voce nao tem permissao para cancelar a comanda.' using errcode = '42501';
  end if;

  for v_linha in
    select id_produto, modifiers, greatest(1, round(coalesce(quantidade, 0))::integer) as quantidade
      from public.comanda_itens
     where id_comanda = p_id_comanda
       and coalesce(estoque_baixado, false) = true
  loop
    for v_stock in
      select requirements.id_produto,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(v_linha.id_produto, v_linha.modifiers, v_linha.quantidade) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner;
      end if;
    end loop;
  end loop;

  update public.comanda_itens
     set estoque_baixado = false
   where id_comanda = p_id_comanda
     and coalesce(estoque_baixado, false) = true;
  update public.comandas
     set status = 'cancelada', fechada_em = now()
   where id = p_id_comanda
     and id_usuario = v_owner;
  update public.mesas
     set status = 'livre'
   where id = v_comanda.id_mesa
     and id_usuario = v_owner;
end;
$$;

create or replace function public.comanda_garantir_estoque_baixado(p_id_comanda uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if not v_service then
    v_owner := public.get_owner_user_id(v_actor);
    if v_owner is null then
      raise exception 'Usuario nao autenticado';
    end if;
  end if;

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;
  if not v_service and not public.fiado_actor_can('mesas.fechar', v_owner) then
    raise exception 'Voce nao tem permissao para fechar a mesa.' using errcode = '42501';
  end if;

  for v_linha in
    select id, id_produto, modifiers,
           greatest(1, round(coalesce(quantidade, 0))::integer) as quantidade
      from public.comanda_itens
     where id_comanda = p_id_comanda
       and coalesce(estoque_baixado, false) = false
  loop
    for v_stock in
      select requirements.id_produto,
             products.nome,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(v_linha.id_produto, v_linha.modifiers, v_linha.quantidade) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then raise exception 'Estoque insuficiente para "%".', v_stock.nome; end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner
           and coalesce(estoque_atual, 0) >= v_stock.quantidade;
        if not found then raise exception 'Estoque insuficiente para "%".', v_stock.nome; end if;
      end if;
    end loop;

    update public.comanda_itens set estoque_baixado = true where id = v_linha.id;
  end loop;
end;
$$;

revoke all on function public.comanda_aplicar_delta_item(uuid, integer, integer, numeric, jsonb) from public, anon;
revoke all on function public.comanda_cancelar_com_estoque(uuid) from public, anon;
revoke all on function public.comanda_garantir_estoque_baixado(uuid) from public, anon;
grant execute on function public.comanda_aplicar_delta_item(uuid, integer, integer, numeric, jsonb) to authenticated, service_role;
grant execute on function public.comanda_cancelar_com_estoque(uuid) to authenticated, service_role;
grant execute on function public.comanda_garantir_estoque_baixado(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
