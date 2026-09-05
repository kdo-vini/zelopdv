-- Pizza configuration is PDV-owned. Historical revisions are immutable and
-- retain modifier prices/stock links for offline sales and cancellation.
begin;
alter table public.produtos add column tipo_produto text not null default 'simples'
  check (tipo_produto in ('simples','pizza'));
alter table public.produtos add column pizza_config jsonb;
alter table public.empresa_perfil add column pizza_pricing_mode text not null default 'highest'
  check (pizza_pricing_mode in ('highest','average'));
alter table public.vendas_itens add column pizza jsonb;
alter table public.comanda_itens add column pizza jsonb;
alter table public.zelo_order_items add column pizza jsonb;

create table public.pizza_config_revisions (
  revision uuid primary key,
  product_id integer not null references public.produtos(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null,
  modifier_config jsonb not null default '[]',
  stock_config jsonb not null default '{}',
  activated boolean not null default false,
  created_at timestamptz not null default now()
);
create index pizza_config_revisions_product on public.pizza_config_revisions(product_id,created_at);
alter table public.pizza_config_revisions enable row level security;
revoke all on public.pizza_config_revisions from public,anon,authenticated,service_role;
grant select on public.pizza_config_revisions to authenticated,service_role;
create policy pizza_revisions_read on public.pizza_config_revisions for select to authenticated
  using (owner_user_id=public.get_owner_user_id((select auth.uid())));

create function public.pizza_modifier_config(p_product_id integer) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('options',(
    select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object(
      'linkedProductId',l.id_produto,'price',coalesce(l.price_override,p.preco,o.price_delta),
      'name',coalesce(p.nome,o.nome)) order by o.ordem,o.id),'[]'::jsonb)
    from public.zelomenu_modifier_options o
    left join public.zelomenu_modifier_option_products l on l.id_opcao=o.id
    left join public.produtos p on p.id=l.id_produto
    where o.id_grupo=g.id
  )) order by g.ordem,g.id),'[]'::jsonb)
  from public.zelomenu_modifier_groups g where g.id_produto=p_product_id;
$$;
revoke all on function public.pizza_modifier_config(integer) from public,anon,authenticated;

create function public.pizza_validate_config(p_product_id integer,p_config jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.produtos; s jsonb; f jsonb; price record; stock_id integer; ids text[]:='{}'; flavors text[]:='{}';
begin
  select * into strict p from public.produtos where id=p_product_id;
  if jsonb_typeof(p_config) is distinct from 'object' or p_config->>'version' is distinct from '1'
     or coalesce(p_config->>'pricingMode','') not in ('highest','average')
     or jsonb_typeof(p_config->'sizes') is distinct from 'array'
     or jsonb_typeof(p_config->'flavors') is distinct from 'array' then
    raise exception 'PIZZA_CONFIG_INVALID';
  end if;
  if p_config ? 'archived' and jsonb_typeof(p_config->'archived')<>'boolean' then raise exception 'PIZZA_CONFIG_INVALID'; end if;
  if jsonb_array_length(p_config->'sizes') not between 1 and 30 or jsonb_array_length(p_config->'flavors') not between 1 and 500 then raise exception 'PIZZA_CONFIG_INVALID'; end if;
  for s in select value from jsonb_array_elements(p_config->'sizes') loop
    if length(coalesce(s->>'id','')) not between 1 and 100 or s->>'id'=any(ids)
       or length(trim(coalesce(s->>'name',''))) not between 1 and 200
       or coalesce(s->>'maxFlavors','') !~ '^[1-4]$' then raise exception 'PIZZA_SIZE_INVALID'; end if;
    if s ? 'active' and jsonb_typeof(s->'active')<>'boolean' then raise exception 'PIZZA_SIZE_INVALID'; end if;
    ids:=array_append(ids,s->>'id');
    stock_id:=nullif(s->>'stockProductId','')::integer;
    if stock_id is not null and (stock_id=p.id or not exists(select 1 from public.produtos where id=stock_id and id_usuario=p.id_usuario and tipo_produto='simples')) then raise exception 'PIZZA_STOCK_PRODUCT_INVALID'; end if;
    if stock_id is not null and (coalesce(p.controlar_estoque,false) or exists(select 1 from public.categorias where id=p.id_categoria and controlar_estoque_compartilhado)) then raise exception 'PIZZA_STOCK_SOURCE_CONFLICT'; end if;
  end loop;
  for f in select value from jsonb_array_elements(p_config->'flavors') loop
    if length(coalesce(f->>'id','')) not between 1 and 100 or f->>'id'=any(flavors)
       or length(trim(coalesce(f->>'name',''))) not between 1 and 200
       or jsonb_typeof(f->'prices') is distinct from 'object' then raise exception 'PIZZA_FLAVOR_INVALID'; end if;
    if f ? 'active' and jsonb_typeof(f->'active')<>'boolean' then raise exception 'PIZZA_FLAVOR_INVALID'; end if;
    flavors:=array_append(flavors,f->>'id');
    for price in select * from jsonb_each(f->'prices') loop
      if not price.key=any(ids) or jsonb_typeof(price.value)<>'number' then raise exception 'PIZZA_PRICE_INVALID'; end if;
      if (price.value::text)::numeric<=0 or (price.value::text)::numeric>1000000 or round((price.value::text)::numeric,2)<>(price.value::text)::numeric then raise exception 'PIZZA_PRICE_INVALID'; end if;
    end loop;
  end loop;
  if exists(select 1 from public.zelomenu_modifier_option_products where id_produto=p.id) then raise exception 'PIZZA_CANNOT_BE_MODIFIER'; end if;
  if exists(select 1 from public.zelomenu_modifier_groups where id_produto=p.id and modo_preco='substituir') then raise exception 'PIZZA_REPLACEMENT_GROUP_UNSUPPORTED'; end if;
end $$;
revoke all on function public.pizza_validate_config(integer,jsonb) from public,anon,authenticated;

-- Internal publisher. No authenticated grant: only checked RPCs/triggers call it.
create function public.pizza_publish_config(p_product_id integer,p_config jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; owner_id uuid; rev uuid:=gen_random_uuid(); mode text; modifiers jsonb; stock jsonb;
begin
  select id_usuario into strict owner_id from public.produtos where id=p_product_id for update;
  select pizza_pricing_mode into mode from public.empresa_perfil where user_id=owner_id limit 1;
  c:=p_config||jsonb_build_object('revision',rev,'version',1,'pricingMode',coalesce(mode,'highest'));
  perform public.pizza_validate_config(p_product_id,c);
  modifiers:=public.pizza_modifier_config(p_product_id);
  select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object('categoryId',p.id_categoria,'controlled',coalesce(p.controlar_estoque,false),'shared',coalesce(cat.controlar_estoque_compartilhado,false))),'{}') into stock
    from public.produtos p left join public.categorias cat on cat.id=p.id_categoria
    where p.id_usuario=owner_id and p.id in (
      select p_product_id union select (x->>'stockProductId')::integer from jsonb_array_elements(c->'sizes') x
      union select (o->>'linkedProductId')::integer from jsonb_array_elements(modifiers) g cross join lateral jsonb_array_elements(g->'options') o
    );
  insert into public.pizza_config_revisions(revision,product_id,owner_user_id,config,modifier_config,stock_config)
  values(rev,p_product_id,owner_id,c,modifiers,stock);
  update public.produtos set tipo_produto='pizza',pizza_config=c where id=p_product_id;
  if coalesce((c->>'archived')::boolean,false) then
    update public.produtos set ocultar_no_pdv=true where id=p_product_id;
    update public.zelomenu_product_publications set visivel_online=false where id_produto=p_product_id;
  end if;
  return c;
end $$;
revoke all on function public.pizza_publish_config(integer,jsonb) from public,anon,authenticated,service_role;

create function public.pizza_product_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.tipo_produto='pizza' and new.tipo_produto<>'pizza' then raise exception 'PIZZA_ARCHIVE_REQUIRED'; end if;
  if new.tipo_produto='pizza' and (tg_op='INSERT' or new.pizza_config is distinct from old.pizza_config or old.tipo_produto<>'pizza') then
    update public.pizza_config_revisions set activated=true
      where revision=nullif(new.pizza_config->>'revision','')::uuid and product_id=new.id
      and owner_user_id=new.id_usuario and config=new.pizza_config and not activated;
    if not found then raise exception 'PIZZA_USE_CONFIG_RPC' using errcode='42501'; end if;
  end if;
  if new.tipo_produto='pizza' then
    perform public.pizza_validate_config(new.id,new.pizza_config);
    if (coalesce(new.controlar_estoque,false) or exists(select 1 from public.categorias where id=new.id_categoria and controlar_estoque_compartilhado)) and exists(select 1 from jsonb_array_elements(new.pizza_config->'sizes') s where s->>'stockProductId' is not null) then raise exception 'PIZZA_STOCK_SOURCE_CONFLICT'; end if;
  elsif new.pizza_config is not null then raise exception 'PIZZA_USE_CONFIG_RPC';
  end if;
  return new;
end $$;
revoke all on function public.pizza_product_guard() from public,anon,authenticated;
create trigger pizza_product_guard before insert or update of tipo_produto,pizza_config,controlar_estoque,id_categoria,id_usuario on public.produtos for each row execute function public.pizza_product_guard();

create function public.save_pizza_config(p_product_id integer,p_expected_revision uuid,p_config jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.produtos;
begin
  select * into p from public.produtos where id=p_product_id for update;
  if not found or auth.uid() is null or not coalesce(public.fiado_actor_can('produtos.gerenciar',p.id_usuario),false) then raise exception 'PIZZA_PERMISSION_DENIED' using errcode='42501'; end if;
  if p.tipo_produto='simples' and (exists(select 1 from public.vendas_itens where id_produto=p.id) or exists(select 1 from public.comanda_itens where id_produto=p.id) or exists(select 1 from public.zelo_order_items where product_id=p.id)) then raise exception 'PIZZA_CREATE_NEW_PRODUCT_REQUIRED'; end if;
  if nullif(p.pizza_config->>'revision','')::uuid is distinct from p_expected_revision then raise exception 'PIZZA_REVISION_CONFLICT' using errcode='40001'; end if;
  return public.pizza_publish_config(p_product_id,p_config);
end $$;
revoke all on function public.save_pizza_config(integer,uuid,jsonb) from public,anon;
grant execute on function public.save_pizza_config(integer,uuid,jsonb) to authenticated;

create function public.save_pizza_pricing_mode(p_pricing_mode text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or public.get_owner_user_id(auth.uid())<>auth.uid() then raise exception 'PIZZA_OWNER_REQUIRED' using errcode='42501'; end if;
  if p_pricing_mode is null or p_pricing_mode not in ('highest','average') then raise exception 'PIZZA_PRICING_MODE_INVALID'; end if;
  update public.empresa_perfil set pizza_pricing_mode=p_pricing_mode where user_id=auth.uid();
  if not found then raise exception 'PIZZA_PROFILE_REQUIRED'; end if;
  return p_pricing_mode;
end $$;
revoke all on function public.save_pizza_pricing_mode(text) from public,anon;
grant execute on function public.save_pizza_pricing_mode(text) to authenticated;

create function public.pizza_refresh_dependencies() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
  -- Revisions change on relevant catalog writes. Stock-only updates do not fire.
  for r in select id,pizza_config from public.produtos where tipo_produto='pizza' and exists(select 1 from auth.users where auth.users.id=produtos.id_usuario)
    and id_usuario=coalesce(to_jsonb(new)->>'id_usuario',to_jsonb(old)->>'id_usuario',to_jsonb(new)->>'user_id')::uuid
    order by id for update loop
    perform public.pizza_publish_config(r.id,r.pizza_config);
  end loop;
  return null;
end $$;
revoke all on function public.pizza_refresh_dependencies() from public,anon,authenticated;
create trigger pizza_refresh_groups after insert or update or delete on public.zelomenu_modifier_groups for each row execute function public.pizza_refresh_dependencies();
create trigger pizza_refresh_options after insert or update or delete on public.zelomenu_modifier_options for each row execute function public.pizza_refresh_dependencies();
create trigger pizza_refresh_links after insert or update or delete on public.zelomenu_modifier_option_products for each row execute function public.pizza_refresh_dependencies();
create trigger pizza_refresh_product_price after update of preco,nome,controlar_estoque,id_categoria on public.produtos for each row when(old.preco is distinct from new.preco or old.nome is distinct from new.nome or old.controlar_estoque is distinct from new.controlar_estoque or old.id_categoria is distinct from new.id_categoria) execute function public.pizza_refresh_dependencies();
create trigger pizza_refresh_category_stock after update of controlar_estoque_compartilhado on public.categorias for each row when(old.controlar_estoque_compartilhado is distinct from new.controlar_estoque_compartilhado) execute function public.pizza_refresh_dependencies();
create trigger pizza_refresh_pricing_mode after update of pizza_pricing_mode on public.empresa_perfil for each row when(old.pizza_pricing_mode is distinct from new.pizza_pricing_mode) execute function public.pizza_refresh_dependencies();

create function public.pizza_link_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.produtos where id=new.id_produto and tipo_produto='pizza') then raise exception 'PIZZA_CANNOT_BE_MODIFIER'; end if;
  return new;
end $$;
revoke all on function public.pizza_link_guard() from public,anon,authenticated;
create trigger pizza_link_guard before insert or update on public.zelomenu_modifier_option_products for each row execute function public.pizza_link_guard();

-- Internal resolver; all public entrypoints establish tenant/capability first.
create function public.resolve_pizza_item(p_product_id integer,p_owner uuid,p_pizza jsonb,p_modifiers jsonb,p_unit_price numeric,p_historical boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.produtos; rev public.pizza_config_revisions; s jsonb; f jsonb; chosen jsonb; g jsonb; opt jsonb; selected_group jsonb; selected_option jsonb;
  flavors jsonb:='[]'; n integer; base numeric; extras numeric:=0; q integer; count_selected integer; total_quantity integer; seen text[]:='{}'; canonical jsonb;
begin
  if p_product_id is null then
    if p_pizza is not null and p_pizza<>'null'::jsonb then raise exception 'PIZZA_PRODUCT_REQUIRED'; end if;
    return null;
  end if;
  select * into p from public.produtos where id=p_product_id and id_usuario=p_owner;
  if not found then raise exception 'PIZZA_PRODUCT_NOT_FOUND'; end if;
  if p.tipo_produto<>'pizza' then
    if p_pizza is not null and p_pizza<>'null'::jsonb then raise exception 'PIZZA_PRODUCT_INVALID'; end if;
    return null;
  end if;
  if p_pizza is null or jsonb_typeof(p_pizza)<>'object' then raise exception 'PIZZA_SELECTION_REQUIRED'; end if;
  select * into rev from public.pizza_config_revisions where revision=nullif(p_pizza->>'revision','')::uuid and product_id=p_product_id and owner_user_id=p_owner and activated;
  if not found then raise exception 'PIZZA_REVISION_INVALID'; end if;
  if not p_historical and p.pizza_config->>'revision' is distinct from rev.revision::text then raise exception 'PIZZA_REVISION_CONFLICT' using errcode='40001'; end if;
  if coalesce((rev.config->>'archived')::boolean,false) then raise exception 'PIZZA_UNAVAILABLE'; end if;
  select value into s from jsonb_array_elements(rev.config->'sizes') where value->>'id'=p_pizza->>'sizeId' and coalesce((value->>'active')::boolean,true);
  if s is null then raise exception 'PIZZA_SIZE_UNAVAILABLE'; end if;
  chosen:=coalesce(p_pizza->'flavorIds',(select jsonb_agg(value->'id') from jsonb_array_elements(p_pizza->'flavors')));
  if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'PIZZA_FLAVORS_INVALID'; end if;
  n:=jsonb_array_length(chosen);
  if n<1 or n>(s->>'maxFlavors')::integer or n<>(select count(distinct value) from jsonb_array_elements(chosen)) then raise exception 'PIZZA_FLAVORS_INVALID'; end if;
  for f in select f.value from jsonb_array_elements(rev.config->'flavors') f where chosen ? (f.value->>'id') order by f.value->>'id' loop
    if not coalesce((f->>'active')::boolean,true) or (f->'prices'->> (s->>'id')) is null then raise exception 'PIZZA_FLAVOR_UNAVAILABLE'; end if;
    flavors:=flavors||jsonb_build_array(jsonb_build_object('id',f->>'id','name',f->>'name','numerator',1,'denominator',n,'price',(f->'prices'->> (s->>'id'))::numeric));
  end loop;
  if jsonb_array_length(flavors)<>n then raise exception 'PIZZA_FLAVOR_UNAVAILABLE'; end if;
  select case rev.config->>'pricingMode' when 'highest' then max((value->>'price')::numeric) else round(avg((value->>'price')::numeric),2) end into base from jsonb_array_elements(flavors);
  if jsonb_typeof(coalesce(p_modifiers,'[]'))<>'array' then raise exception 'PIZZA_MODIFIERS_INVALID'; end if;
  for selected_group in select value from jsonb_array_elements(coalesce(p_modifiers,'[]')) loop
    if selected_group->>'groupId' in ('__pizza_size','__pizza_flavors','__pizza_notes') then
      if exists(select 1 from jsonb_array_elements(coalesce(selected_group->'selectedOptions','[]')) x where coalesce((x->>'priceDelta')::numeric,0)<>0 or x->>'linkedProductId' is not null) then raise exception 'PIZZA_PROJECTION_INVALID'; end if;
      continue;
    end if;
    if selected_group->>'groupId'=any(seen) then raise exception 'PIZZA_MODIFIER_DUPLICATE'; end if;
    seen:=array_append(seen,selected_group->>'groupId');
    select value into g from jsonb_array_elements(rev.modifier_config) where value->>'id'=selected_group->>'groupId' and (value->>'ativo')::boolean;
    if g is null or g->>'modo_preco'<>'somar' then raise exception 'PIZZA_MODIFIER_UNAVAILABLE'; end if;
    count_selected:=0; total_quantity:=0;
    if (select count(*)<>count(distinct x->>'optionId') from jsonb_array_elements(selected_group->'selectedOptions') x) then raise exception 'PIZZA_MODIFIER_DUPLICATE'; end if;
    for selected_option in select value from jsonb_array_elements(selected_group->'selectedOptions') loop
      select value into opt from jsonb_array_elements(g->'options') where value->>'id'=selected_option->>'optionId' and (value->>'ativo')::boolean;
      if opt is null then raise exception 'PIZZA_MODIFIER_UNAVAILABLE'; end if;
      q:=coalesce((selected_option->>'quantity')::integer,1);
      if q<1 or q>999 or (not (g->>'permite_quantidade')::boolean and q<>1) or q>coalesce((g->>'maximo_por_opcao')::integer,999) then raise exception 'PIZZA_MODIFIER_QUANTITY_INVALID'; end if;
      if (selected_option->>'priceDelta')::numeric is distinct from (opt->>'price')::numeric then raise exception 'PIZZA_MODIFIER_PRICE_MISMATCH'; end if;
      extras:=extras+q*(opt->>'price')::numeric;
      count_selected:=count_selected+1; total_quantity:=total_quantity+q;
    end loop;
    if total_quantity<coalesce((g->>'minimo_total_quantidade')::integer,0) or total_quantity>coalesce((g->>'maximo_total_quantidade')::integer,999999) then raise exception 'PIZZA_MODIFIER_TOTAL_QUANTITY_INVALID'; end if;
    if count_selected<(g->>'min_selecoes')::integer or count_selected>coalesce((g->>'max_selecoes')::integer,999) then raise exception 'PIZZA_MODIFIER_SELECTION_INVALID'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(rev.modifier_config) x where (x->>'ativo')::boolean and ((x->>'min_selecoes')::integer>0 or coalesce((x->>'minimo_total_quantidade')::integer,0)>0) and not (x->>'id'=any(seen))) then raise exception 'PIZZA_REQUIRED_MODIFIER_MISSING'; end if;
  if p_unit_price is null or p_unit_price<>base+extras then raise exception 'PIZZA_PRICE_MISMATCH'; end if;
  canonical:=jsonb_build_object('version',1,'revision',rev.revision,'sizeId',s->>'id','sizeName',s->>'name','flavors',flavors,'pricingMode',rev.config->>'pricingMode','baseUnitPrice',base,'stockProductId',s->'stockProductId');
  if p_pizza ? 'notes' and (jsonb_typeof(p_pizza->'notes')<>'string' or length(p_pizza->>'notes')>200) then raise exception 'PIZZA_NOTES_INVALID'; end if;
  if nullif(trim(p_pizza->>'notes'),'') is not null then canonical:=canonical||jsonb_build_object('notes',trim(p_pizza->>'notes')); end if;
  return canonical;
end $$;
revoke all on function public.resolve_pizza_item(integer,uuid,jsonb,jsonb,numeric,boolean) from public,anon,authenticated,service_role;

-- Four-argument overload keeps old products unchanged; pizzas use immutable
-- revision links instead of today's modifier bindings.
create function public.comanda_modifier_stock_requirements(p_id_produto bigint,p_modifiers jsonb,p_item_quantity integer,p_pizza jsonb)
returns table(id_produto bigint,quantidade integer,id_categoria integer,controlar_estoque boolean,estoque_compartilhado boolean) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare targets jsonb;
begin
  if p_pizza is null or p_pizza='null'::jsonb then
    return query select r.id_produto,r.quantidade,p.id_categoria,coalesce(p.controlar_estoque,false),coalesce(c.controlar_estoque_compartilhado,false)
      from public.comanda_modifier_stock_requirements(p_id_produto,p_modifiers,p_item_quantity) r
      join public.produtos p on p.id=r.id_produto left join public.categorias c on c.id=p.id_categoria;
    return;
  end if;
  select r.stock_config into strict targets from public.pizza_config_revisions r where r.revision=(p_pizza->>'revision')::uuid and r.product_id=p_id_produto;
  return query with raw as (
    select coalesce((p_pizza->>'stockProductId')::bigint,p_id_produto) id,p_item_quantity qty
    union all
    select (o->>'linkedProductId')::bigint,sum(coalesce((picked->>'quantity')::integer,1)*p_item_quantity)::integer
    from public.pizza_config_revisions r
    cross join lateral jsonb_array_elements(r.modifier_config) g
    cross join lateral jsonb_array_elements(g->'options') o
    cross join lateral jsonb_array_elements(coalesce(p_modifiers,'[]')) selected_group
    cross join lateral jsonb_array_elements(selected_group->'selectedOptions') picked
    where r.product_id=p_id_produto and r.revision=(p_pizza->>'revision')::uuid
      and g->>'id'=selected_group->>'groupId' and o->>'id'=picked->>'optionId' and o->>'linkedProductId' is not null
    group by o->>'linkedProductId'
  ) select raw.id,raw.qty,(targets->raw.id::text->>'categoryId')::integer,
     coalesce((targets->raw.id::text->>'controlled')::boolean,false),coalesce((targets->raw.id::text->>'shared')::boolean,false) from raw;
end $$;
revoke all on function public.comanda_modifier_stock_requirements(bigint,jsonb,integer,jsonb) from public,anon,authenticated,service_role;

create function public.pizza_order_history_allowed(p_empresa uuid,p_snapshots jsonb,p_item jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare item_id uuid:=nullif(p_snapshots#>>'{fulfillment,comandaItemId}','')::uuid;
begin
  if item_id is null or coalesce(p_snapshots->>'source','')<>'mesa' or p_item->'pizza' is null then return false; end if;
  if not exists(select 1 from public.comanda_itens ci join public.comandas c on c.id=ci.id_comanda
    join public.empresa_perfil ep on ep.user_id=c.id_usuario
    where ci.id=item_id and ep.id=p_empresa and c.status='aberta'
      and ci.id_produto=(p_item->>'productId')::integer and ci.pizza=p_item->'pizza'
      and ci.preco_unitario=(p_item->>'unitPrice')::numeric and round(ci.quantidade)=(p_item->>'quantity')::integer
      and ci.modifiers=coalesce(p_item->'selectedModifiers',p_item->'modifiers','[]')) then
    raise exception 'PIZZA_COMANDA_SNAPSHOT_MISMATCH';
  end if;
  return true;
end $$;
revoke all on function public.pizza_order_history_allowed(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Guarded source substitutions preserve the current financial RPC bodies,
-- ownership and ACL. Drift aborts the migration rather than silently dropping
-- an intervening security fix. The patch helper is transaction-local.
create function pg_temp.pizza_replace(source text,needle text,replacement text,expected integer default 1) returns text language plpgsql as $$
begin
  source:=replace(source,E'\r\n',E'\n'); needle:=replace(needle,E'\r\n',E'\n'); replacement:=replace(replacement,E'\r\n',E'\n');
  if (length(source)-length(replace(source,needle,'')))/length(needle)<>expected then raise exception 'Pizza migration source drift: %',left(needle,120); end if;
  return replace(source,needle,replacement);
end $$;

do $patch$
declare f text;
begin
  select pg_get_functiondef('public.criar_venda_completa(jsonb)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'  v_linha record;','  v_linha record;
  v_pizza jsonb;
  v_has_pizza boolean;
  v_order_stock_committed boolean:=false;');
  f:=pg_temp.pizza_replace(f,'  v_id_cliente := nullif(p_payload->>''id_cliente'','''')::uuid;',$code$
  select exists(select 1 from jsonb_array_elements(coalesce(p_payload->'itens','[]')) i join public.produtos p on p.id=(i->>'id_produto')::integer where p.tipo_produto='pizza') into v_has_pizza;
  if v_has_pizza and v_client_sale_id like 'zelo-order:%' then
    select exists(select 1 from public.zelo_orders o join public.empresa_perfil ep on ep.id=o.empresa_id
      where 'zelo-order:'||o.id=v_client_sale_id and ep.user_id=v_user_id and o.stock_committed_at is not null and o.stock_released_at is null)
      into v_order_stock_committed;
    if not v_order_stock_committed then raise exception 'PIZZA_ORDER_STOCK_NOT_COMMITTED'; end if;
  end if;
  v_id_cliente := nullif(p_payload->>'id_cliente','')::uuid;
$code$);
  f:=pg_temp.pizza_replace(f,'    insert into public.vendas_itens (',$code$
    v_pizza:=public.resolve_pizza_item(nullif(v_item->>'id_produto','')::integer,v_user_id,v_item->'pizza',v_item->'modifiers',
      coalesce((v_item->>'preco_unitario_na_venda')::numeric,(v_item->>'preco')::numeric,0),
      coalesce((p_payload->>'pizza_offline')::boolean,false) or v_order_stock_committed);
    insert into public.vendas_itens (
$code$);
  f:=pg_temp.pizza_replace(f,'nome_produto_na_venda, preco_unitario_na_venda, modifiers','nome_produto_na_venda, preco_unitario_na_venda, modifiers, pizza');
  f:=pg_temp.pizza_replace(f,'      coalesce(v_item->''modifiers'', ''[]''::jsonb)','      coalesce(v_item->''modifiers'', ''[]''::jsonb), v_pizza');
  f:=pg_temp.pizza_replace(f,'  for v_estoque in select * from jsonb_array_elements(coalesce(p_payload->''estoque'',''[]''::jsonb))',$code$
  -- When any pizza is present all item stock is reconstructed in the database;
  -- the client cannot omit or substitute the pizza's prepared-stock source.
  if v_has_pizza then
    if v_order_stock_committed then
      p_payload:=jsonb_set(p_payload,'{estoque}','[]');
    else
      p_payload:=jsonb_set(p_payload,'{estoque}',coalesce((
        select jsonb_agg(jsonb_build_object('id_produto',r.id_produto,'quantidade',r.quantidade,'id_categoria',r.id_categoria,'controlled',r.controlar_estoque,'shared',r.estoque_compartilhado))
        from public.vendas_itens i
        cross join lateral public.comanda_modifier_stock_requirements(i.id_produto::bigint,i.modifiers,i.quantidade,i.pizza) r
        where i.id_venda=v_venda_id and r.id_produto is not null
      ),'[]'));
    end if;
  end if;
  for v_estoque in select * from jsonb_array_elements(coalesce(p_payload->'estoque','[]'::jsonb))
$code$);
  execute f;

  select pg_get_functiondef('public.create_zelo_order(uuid,integer,text,jsonb,uuid)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'    insert into public.zelo_order_items(',$code$
    v_item:=v_item||jsonb_build_object('pizza',public.resolve_pizza_item(
      nullif(v_item->>'productId','')::integer,(select user_id from public.empresa_perfil where id=v_empresa),
      coalesce(v_item->'pizza',v_item->'pizzaSelection'),coalesce(v_item->'selectedModifiers',v_item->'modifiers','[]'),
      (v_item->>'unitPrice')::numeric,public.pizza_order_history_allowed(v_empresa,p_snapshots,v_item)));
    insert into public.zelo_order_items(
$code$);
  f:=pg_temp.pizza_replace(f,'order_id, product_id, name, unit_price, quantity, subtotal, modifiers, position','order_id, product_id, name, unit_price, quantity, subtotal, modifiers, position, pizza');
  f:=pg_temp.pizza_replace(f,'      coalesce((v_item->>''position'')::integer, 0)','      coalesce((v_item->>''position'')::integer, 0), nullif(v_item->''pizza'',''null''::jsonb)');
  execute f;

  select pg_get_functiondef('public.ensure_zelo_order_sale(uuid,timestamptz)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'    preco_unitario_na_venda
  )','    preco_unitario_na_venda, modifiers, pizza
  )');
  f:=pg_temp.pizza_replace(f,'    i.unit_price
  from public.zelo_order_items','    i.unit_price, i.modifiers, i.pizza
  from public.zelo_order_items');
  execute f;

  -- Preserve pizzas as one financial line when closing online orders. Generic
  -- products keep their established decomposition into linked sale items.
  select pg_get_functiondef('public.close_zelo_order(uuid,integer,jsonb,uuid)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'i.quantity, i.position, i.modifiers','i.quantity, i.position, i.modifiers, i.pizza');
  f:=pg_temp.pizza_replace(f,'from base b
        cross join lateral','from base b
        cross join lateral',1); -- assertion for the linked CTE boundary
  f:=pg_temp.pizza_replace(f,'      linked_totals as (',$code$
      pizza_safe_linked as (select l.* from linked l join base b on b.id=l.item_id where b.pizza is null),
      linked_totals as (
$code$);
  f:=pg_temp.pizza_replace(f,'from linked group by item_id','from pizza_safe_linked group by item_id');
  f:=pg_temp.pizza_replace(f,'from linked l
      )','from pizza_safe_linked l
      )');
  f:=pg_temp.pizza_replace(f,'''quantidade'',b.quantity','''quantidade'',b.quantity,''pizza'',b.pizza,''modifiers'',case when b.pizza is not null then b.modifiers else ''[]''::jsonb end');
  execute f;

  -- The same requirement expansion powers reserve and release; historical
  -- flavor edits never add/remove stock and size replaces parent consumption.
  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,$old$select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
        where oi.order_id=o.id$old$,$new$select r.id_produto as product_id,r.quantidade as quantity from public.zelo_order_items oi
        cross join lateral public.comanda_modifier_stock_requirements(oi.product_id,oi.modifiers,oi.quantity,oi.pizza) r
        where oi.order_id=o.id$new$,4);
  execute f;
end $patch$;

do $patch$
declare f text; signature text;
begin
  select pg_get_functiondef('public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'p_modifiers jsonb DEFAULT ''[]''::jsonb)','p_modifiers jsonb DEFAULT ''[]''::jsonb, p_pizza jsonb DEFAULT NULL::jsonb)');
  f:=pg_temp.pizza_replace(f,'  v_stock record;','  v_stock record;
  v_pizza jsonb;');
  f:=pg_temp.pizza_replace(f,'  select *
    into v_item',$code$
  v_pizza:=public.resolve_pizza_item(p_id_produto,v_owner,p_pizza,v_modifiers,v_unit_price,p_delta<0);
  select *
    into v_item$code$);
  f:=pg_temp.pizza_replace(f,'     and coalesce(modifiers, ''[]''::jsonb) = v_modifiers','     and coalesce(modifiers, ''[]''::jsonb) = v_modifiers
     and pizza is not distinct from v_pizza');
  f:=pg_temp.pizza_replace(f,'v_modifiers, v_qtd_delta)','v_modifiers, v_qtd_delta, v_pizza)',3);
  f:=pg_temp.pizza_replace(f,'v_modifiers, v_qtd_devolver)','v_modifiers, v_qtd_devolver, v_pizza)');
  f:=pg_temp.pizza_replace(f,'estoque_baixado, modifiers, nome_produto_na_venda','estoque_baixado, modifiers, nome_produto_na_venda, pizza');
  f:=pg_temp.pizza_replace(f,'        v_produto.nome
      );','        v_produto.nome, v_pizza
      );');
  execute f;
  -- Avoid ambiguous PostgREST/default overload resolution for five arguments.
  drop function public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb);
  revoke all on function public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb) from public,anon;
  grant execute on function public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb) to authenticated,service_role;

  foreach signature in array array['public.comanda_cancelar_com_estoque(uuid)','public.comanda_garantir_estoque_baixado(uuid)'] loop
    select pg_get_functiondef(signature::regprocedure) into f;
    f:=pg_temp.pizza_replace(f,'id_produto, modifiers,','id_produto, modifiers, pizza,');
    f:=pg_temp.pizza_replace(f,'v_linha.modifiers, v_linha.quantidade)','v_linha.modifiers, v_linha.quantidade, v_linha.pizza)');
    execute f;
  end loop;
end $patch$;

-- Validate even direct INSERT paths (mesa close and recovery utilities) and
-- reject old consumers adding a configurable pizza as an ordinary product.
create function public.pizza_item_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; product_id integer; unit_price numeric; qty numeric;
begin
  if tg_table_name='vendas_itens' then
    owner_id:=new.id_usuario; product_id:=new.id_produto; unit_price:=new.preco_unitario_na_venda; qty:=new.quantidade;
  elsif tg_table_name='comanda_itens' then
    select id_usuario into owner_id from public.comandas where id=new.id_comanda;
    product_id:=new.id_produto; unit_price:=new.preco_unitario; qty:=new.quantidade;
  else
    select ep.user_id into owner_id from public.zelo_orders o join public.empresa_perfil ep on ep.id=o.empresa_id where o.id=new.order_id;
    product_id:=new.product_id; unit_price:=new.unit_price; qty:=new.quantity;
  end if;
  -- Existing simple products keep their pre-pizza contracts, including deleted
  -- product historical rows. For pizzas resolve only against their own owner.
  if new.pizza is not null or exists(select 1 from public.produtos where id=product_id and tipo_produto='pizza') then
    if qty is null or qty<1 or qty>999 or round(qty)<>qty then raise exception 'PIZZA_QUANTITY_INVALID'; end if;
    new.pizza:=public.resolve_pizza_item(product_id,owner_id,new.pizza,new.modifiers,unit_price,true);
  end if;
  return new;
end $$;
revoke all on function public.pizza_item_guard() from public,anon,authenticated;
create trigger pizza_item_guard before insert or update of pizza,modifiers,id_produto,preco_unitario_na_venda,quantidade on public.vendas_itens for each row execute function public.pizza_item_guard();
create trigger pizza_item_guard before insert or update of pizza,modifiers,id_produto,preco_unitario,quantidade on public.comanda_itens for each row execute function public.pizza_item_guard();
create trigger pizza_item_guard before insert or update of pizza,modifiers,product_id,unit_price,quantity on public.zelo_order_items for each row execute function public.pizza_item_guard();

-- Apply stock movements to the bucket recorded with the revision even when
-- the catalog later changes category or switches inventory tracking modes.
do $patch$
declare f text; signature text;
begin
  select pg_get_functiondef('public.criar_venda_completa(jsonb)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'    quantidade integer
  ) on commit drop;','    quantidade integer, id_categoria integer, controlled boolean, shared boolean
  ) on commit drop;');
  f:=pg_temp.pizza_replace(f,'(id_produto, quantidade)
      values ((v_estoque->>''id_produto'')::integer, v_qtd);','(id_produto, quantidade,id_categoria,controlled,shared)
      values ((v_estoque->>''id_produto'')::integer, v_qtd,(v_estoque->>''id_categoria'')::integer,(v_estoque->>''controlled'')::boolean,(v_estoque->>''shared'')::boolean);');
  f:=replace(f,'c.id = p.id_categoria and c.id_usuario = v_user_id','c.id = coalesce(t.id_categoria,p.id_categoria) and c.id_usuario = v_user_id');
  f:=replace(f,'coalesce(c.controlar_estoque_compartilhado, false) = true','coalesce(t.shared,c.controlar_estoque_compartilhado, false) = true');
  f:=replace(f,'coalesce(c.controlar_estoque_compartilhado, false) = false','coalesce(t.shared,c.controlar_estoque_compartilhado, false) = false');
  f:=replace(f,'coalesce(p.controlar_estoque, false) = true','coalesce(t.controlled,p.controlar_estoque, false) = true');
  f:=replace(f,'       and coalesce(controlar_estoque_compartilhado, false) = true','');
  f:=replace(f,'       and coalesce(controlar_estoque, false) = true','');
  execute f;

  foreach signature in array array['public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb)','public.comanda_cancelar_com_estoque(uuid)','public.comanda_garantir_estoque_baixado(uuid)'] loop
    select pg_get_functiondef(signature::regprocedure) into f;
    f:=replace(f,'requirements.id_produto,','requirements.id_produto, requirements.id_categoria,');
    f:=replace(f,'products.controlar_estoque','requirements.controlar_estoque');
    f:=replace(f,'coalesce(categories.controlar_estoque_compartilhado, false)','requirements.estoque_compartilhado');
    f:=replace(f,'categories.controlar_estoque_compartilhado','requirements.estoque_compartilhado');
    f:=replace(f,'(select id_categoria from public.produtos where id = v_stock.id_produto)','v_stock.id_categoria');
    execute f;
  end loop;

  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure) into f;
  f:=pg_temp.pizza_replace(f,'r.quantidade as quantity from public.zelo_order_items','r.quantidade as quantity,r.id_categoria,r.controlar_estoque,r.estoque_compartilhado from public.zelo_order_items',4);
  f:=replace(f,'join public.categorias c on c.id=p.id_categoria','join public.categorias c on c.id=x.id_categoria');
  f:=replace(f,'where coalesce(c.controlar_estoque_compartilhado,false)','where x.estoque_compartilhado');
  f:=replace(f,'where coalesce(p.controlar_estoque,false) and not coalesce(c.controlar_estoque_compartilhado,false)','where x.controlar_estoque and not x.estoque_compartilhado');
  f:=replace(f,'select p2.id_categoria as cat_id','select y.id_categoria as cat_id');
  f:=replace(f,'join public.categorias c2 on c2.id=p2.id_categoria and coalesce(c2.controlar_estoque_compartilhado,false)','join public.categorias c2 on c2.id=y.id_categoria and y.estoque_compartilhado');
  f:=replace(f,'group by p2.id_categoria','group by y.id_categoria');
  f:=replace(f,'where coalesce(p2.controlar_estoque,false) and not coalesce(c2.controlar_estoque_compartilhado,false)','where y.controlar_estoque and not y.estoque_compartilhado');
  execute f;
end $patch$;

create function public.pizza_product_delete_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from auth.users where id=old.id_usuario) and (old.tipo_produto='pizza' or exists(select 1 from public.pizza_config_revisions where stock_config ? old.id::text)) then
    raise exception 'PIZZA_ARCHIVE_REQUIRED: arquive a pizza; produtos de estoque vinculados preservam o historico';
  end if;
  return old;
end $$;
revoke all on function public.pizza_product_delete_guard() from public,anon,authenticated;
create trigger pizza_product_delete_guard before delete on public.produtos for each row execute function public.pizza_product_delete_guard();

create function public.pizza_category_delete_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from auth.users where id=old.id_usuario) and exists(
    select 1 from public.pizza_config_revisions r cross join lateral jsonb_each(r.stock_config) bucket
    where r.owner_user_id=old.id_usuario and (bucket.value->>'shared')::boolean and (bucket.value->>'categoryId')::integer=old.id
  ) then raise exception 'PIZZA_STOCK_CATEGORY_HISTORY_REQUIRED'; end if;
  return old;
end $$;
revoke all on function public.pizza_category_delete_guard() from public,anon,authenticated;
create trigger pizza_category_delete_guard before delete on public.categorias for each row execute function public.pizza_category_delete_guard();

notify pgrst,'reload schema';
commit;
