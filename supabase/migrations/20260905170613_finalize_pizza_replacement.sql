-- Replace a previously sold simple product with a configurable pizza in one
-- transaction. The old identity remains hidden for historical sales while the
-- new identity inherits presentation, modifier groups and sellability.
create or replace function public.replace_product_with_pizza(
  p_source_product_id integer,
  p_config jsonb,
  p_visible_in_pdv boolean,
  p_visible_online boolean,
  p_nome_publico text default null,
  p_descricao_publica text default null,
  p_foto_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_product public.produtos;
  replacement_product_id integer;
  published_config jsonb;
  source_group record;
  source_option record;
  replacement_group_id uuid;
  replacement_option_id uuid;
begin
  select * into source_product
  from public.produtos
  where id = p_source_product_id
  for update;

  if not found
     or auth.uid() is null
     or not coalesce(public.fiado_actor_can('produtos.gerenciar', source_product.id_usuario), false) then
    raise exception 'PIZZA_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if source_product.tipo_produto <> 'simples' then
    raise exception 'PIZZA_SOURCE_MUST_BE_SIMPLE';
  end if;
  if exists (
    select 1 from public.zelomenu_modifier_groups
    where id_produto = source_product.id and modo_preco = 'substituir'
  ) then
    raise exception 'PIZZA_REPLACEMENT_GROUP_UNSUPPORTED';
  end if;

  insert into public.produtos (
    nome, preco, preco_2, preco_3, id_usuario, id_categoria, id_subcategoria,
    eh_item_por_unidade, ocultar_no_pdv, controlar_estoque, estoque_atual
  ) values (
    source_product.nome, 0, null, null, source_product.id_usuario,
    source_product.id_categoria, source_product.id_subcategoria, false,
    true, false, 0
  ) returning id into replacement_product_id;

  for source_group in
    select * from public.zelomenu_modifier_groups
    where id_produto = source_product.id
    order by ordem, id
  loop
    insert into public.zelomenu_modifier_groups (
      id_usuario, id_produto, nome, tipo, min_selecoes, max_selecoes, ativo,
      ordem, modo_preco, permite_quantidade, maximo_por_opcao,
      minimo_total_quantidade, maximo_total_quantidade
    ) values (
      source_product.id_usuario, replacement_product_id, source_group.nome,
      source_group.tipo, source_group.min_selecoes, source_group.max_selecoes,
      source_group.ativo, source_group.ordem, source_group.modo_preco,
      source_group.permite_quantidade, source_group.maximo_por_opcao,
      source_group.minimo_total_quantidade, source_group.maximo_total_quantidade
    ) returning id into replacement_group_id;

    for source_option in
      select * from public.zelomenu_modifier_options
      where id_grupo = source_group.id
      order by ordem, id
    loop
      insert into public.zelomenu_modifier_options (
        id_usuario, id_grupo, nome, price_delta, ativo, ordem
      ) values (
        source_product.id_usuario, replacement_group_id, source_option.nome,
        source_option.price_delta, source_option.ativo, source_option.ordem
      ) returning id into replacement_option_id;

      insert into public.zelomenu_modifier_option_products (
        id_opcao, id_usuario, id_produto, price_override, id_componente
      )
      select replacement_option_id, source_product.id_usuario, id_produto,
             price_override, id_componente
      from public.zelomenu_modifier_option_products
      where id_opcao = source_option.id;
    end loop;
  end loop;

  published_config := public.pizza_publish_config(replacement_product_id, p_config);

  insert into public.zelomenu_product_publications (
    id_usuario, id_produto, nome_publico, descricao_publica, foto_url,
    visivel_online, pausado_manualmente, ordem
  ) values (
    source_product.id_usuario, replacement_product_id, nullif(trim(p_nome_publico), ''),
    nullif(trim(p_descricao_publica), ''), nullif(trim(p_foto_url), ''),
    case when coalesce((published_config->>'archived')::boolean, false)
      then false else coalesce(p_visible_online, false) end,
    false, 0
  );

  update public.produtos
  set ocultar_no_pdv = true,
      nome = case when nome like '% · anterior' then nome else nome || ' · anterior' end
  where id = source_product.id and id_usuario = source_product.id_usuario;

  update public.zelomenu_product_publications
  set visivel_online = false, updated_at = now()
  where id_produto = source_product.id and id_usuario = source_product.id_usuario;

  update public.produtos
  set ocultar_no_pdv = case
    when coalesce((published_config->>'archived')::boolean, false) then true
    else not coalesce(p_visible_in_pdv, false)
  end
  where id = replacement_product_id and id_usuario = source_product.id_usuario;

  return jsonb_build_object(
    'productId', replacement_product_id,
    'config', published_config
  );
end;
$$;

revoke all on function public.replace_product_with_pizza(integer,jsonb,boolean,boolean,text,text,text)
  from public, anon;
grant execute on function public.replace_product_with_pizza(integer,jsonb,boolean,boolean,text,text,text)
  to authenticated, service_role;
