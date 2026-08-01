-- Produtos montáveis no PDV: snapshot da montagem em comandas e vendas.
-- A migration é aditiva: itens antigos continuam usando modifiers = [].

begin;

alter table public.comanda_itens
  add column if not exists modifiers jsonb not null default '[]'::jsonb,
  add column if not exists nome_produto_na_venda text;

alter table public.vendas_itens
  add column if not exists modifiers jsonb not null default '[]'::jsonb;

create index if not exists comanda_itens_montagem_idx
  on public.comanda_itens (id_comanda, id_produto);

comment on column public.comanda_itens.modifiers is
  'Snapshot dos grupos/opções selecionados no momento em que a linha entrou na comanda.';
comment on column public.comanda_itens.nome_produto_na_venda is
  'Nome do produto no momento da inclusão; usado quando o catálogo muda depois.';
comment on column public.vendas_itens.modifiers is
  'Snapshot estruturado dos grupos/opções selecionados na venda.';

create or replace function public.comanda_modifier_stock_requirements(
  p_id_produto bigint,
  p_modifiers jsonb,
  p_item_quantity integer
)
returns table (id_produto bigint, quantidade integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p_id_produto, greatest(coalesce(p_item_quantity, 1), 1)
  union all
  select
    links.id_produto,
    sum(
      greatest(
        case
          when (option_json->>'quantity') ~ '^[0-9]+$'
            then (option_json->>'quantity')::integer
          else 1
        end,
        1
      ) * greatest(coalesce(p_item_quantity, 1), 1)
    )::integer
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) as group_json
  cross join lateral jsonb_array_elements(coalesce(group_json->'selectedOptions', '[]'::jsonb)) as option_json
  join public.zelomenu_modifier_option_products links
    on links.id_opcao = case
      when (option_json->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (option_json->>'optionId')::uuid
      else null
    end
  group by links.id_produto;
$$;

comment on function public.comanda_modifier_stock_requirements(bigint, jsonb, integer) is
  'Expande o produto-base e as opções vinculadas em requisitos de estoque para uma linha de comanda.';

create or replace function public.comanda_aplicar_delta_item(
  p_id_comanda uuid,
  p_id_produto integer,
  p_delta integer,
  p_preco_unitario numeric default null,
  p_modifiers jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
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
  if v_usuario is null then
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

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;

  select p.id, p.nome, p.preco, p.controlar_estoque, coalesce(p.estoque_atual, 0) as estoque_atual
    into v_produto
    from public.produtos p
   where p.id = p_id_produto
     and p.id_usuario = v_usuario
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
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_usuario
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_usuario
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
            join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
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
                 join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
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
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_usuario;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_usuario;
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

-- A assinatura de cinco argumentos usa defaults para permanecer compatível
-- com clientes antigos que ainda enviam apenas produto + delta. Não criar uma
-- segunda sobrecarga de três argumentos: o PostgREST considera as duas
-- assinaturas ambíguas quando os defaults entram na resolução da RPC.

create or replace function public.comanda_cancelar_com_estoque(p_id_comanda uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_usuario is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select id, id_mesa
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
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
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_usuario;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_usuario;
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
     and id_usuario = v_usuario;

  update public.mesas
     set status = 'livre'
   where id = v_comanda.id_mesa
     and id_usuario = v_usuario;
end;
$$;

create or replace function public.comanda_garantir_estoque_baixado(p_id_comanda uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_usuario is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select id
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
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
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_usuario
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_usuario
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_usuario
           and coalesce(estoque_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      end if;
    end loop;

    update public.comanda_itens
       set estoque_baixado = true
     where id = v_linha.id;
  end loop;
end;
$$;

revoke all on function public.comanda_modifier_stock_requirements(bigint, jsonb, integer) from public, anon, authenticated;
revoke all on function public.comanda_aplicar_delta_item(uuid, integer, integer, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.comanda_cancelar_com_estoque(uuid) from public, anon, authenticated;
revoke all on function public.comanda_garantir_estoque_baixado(uuid) from public, anon, authenticated;
grant execute on function public.comanda_modifier_stock_requirements(bigint, jsonb, integer) to authenticated, service_role;
grant execute on function public.comanda_aplicar_delta_item(uuid, integer, integer, numeric, jsonb) to authenticated, service_role;
grant execute on function public.comanda_cancelar_com_estoque(uuid) to authenticated, service_role;
grant execute on function public.comanda_garantir_estoque_baixado(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
