-- Extend the private dispatcher; the public receipt/lease/reconciliation
-- boundary stays unchanged. No new public privileged endpoint.
begin;

-- Orders-only cashiers may prepare their own device too; preserve all other
-- subscription, owner and device gates in the existing bootstrap.
do $$
declare source text; needle text:='public.fiado_actor_can(''pdv.acessar'',owner_id) or public.fiado_actor_can(''mesas.acessar'',owner_id)';
begin
  select pg_get_functiondef('public.offline_bootstrap_v1(text,text)'::regprocedure) into source;
  if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'Manual orders bootstrap source drift'; end if;
  execute replace(source,needle,needle||' or public.fiado_actor_can(''pedidos.acessar'',owner_id)');
end $$;

alter function offline_internal.dispatch(uuid,jsonb) rename to dispatch_before_manual_orders;

create function offline_internal.create_manual_order(p_owner uuid,p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p jsonb:=p_operation->'payload'; item jsonb; product public.produtos; grp public.zelomenu_modifier_groups;
  selected jsonb; picked jsonb; opt record; options jsonb; modifiers jsonb; canonical_items jsonb:='[]';
  raw_modifiers jsonb; canonical_pizza jsonb; company_id uuid; quantity integer; q integer; n integer; total_q integer;
  additions numeric; override_price numeric; price numeric; subtotal numeric:=0; fee numeric;
  customer jsonb; fulfillment jsonb; payment jsonb; result jsonb; order_row public.zelo_orders;
begin
  if not public.fiado_actor_can('pedidos.acessar',p_owner) or not public.fiado_actor_can('pedidos.receber',p_owner) then
    raise exception 'Permissão para criar pedidos necessária.' using errcode='42501';
  end if;
  if not exists(select 1 from public.subscriptions where user_id=p_owner
    and (plan_tier in ('chat','bundle') or (plan_tier='pdv' and has_zelo_menu))) then
    raise exception 'ZeloMenu necessário para criar pedidos.' using errcode='42501';
  end if;
  select id into company_id from public.empresa_perfil where user_id=p_owner;
  if company_id is null then raise exception 'Perfil da empresa não encontrado.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  fee:=coalesce(nullif(p->>'deliveryFee','')::numeric,0);
  if fee<0 or fee>1000000 or fee::text in ('NaN','Infinity','-Infinity') or round(fee,2)<>fee then raise exception 'INVALID_DELIVERY_FEE'; end if;
  customer:=coalesce(nullif(p->'customer','null'),'{}');
  fulfillment:=coalesce(nullif(p->'fulfillment','null'),'{}');
  payment:=coalesce(nullif(p->'payment','null'),'{}');
  if jsonb_typeof(customer)<>'object' or jsonb_typeof(fulfillment)<>'object' or jsonb_typeof(payment)<>'object' then raise exception 'INVALID_ORDER_FIELDS'; end if;
  if coalesce(nullif(fulfillment->>'type',''),'pickup') not in ('pickup','delivery') then raise exception 'INVALID_FULFILLMENT'; end if;
  if nullif(fulfillment->>'scheduledAt','') is not null then perform (fulfillment->>'scheduledAt')::timestamptz; end if;
  if nullif(fulfillment->>'pickupDate','') is not null then
    if fulfillment->>'pickupDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_PICKUP_DATE'; end if;
    perform (fulfillment->>'pickupDate')::date;
  end if;
  if nullif(fulfillment->>'pickupTime','') is not null then
    if fulfillment->>'pickupTime' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'INVALID_PICKUP_TIME'; end if;
  end if;
  -- Only declaration is accepted: no caller can mark a payment as collected.
  payment:=jsonb_strip_nulls(jsonb_build_object('declaredMethod',nullif(payment->>'declaredMethod','')));
  customer:=jsonb_strip_nulls(jsonb_build_object('name',nullif(customer->>'name',''),'phone',nullif(customer->>'phone','')));
  fulfillment:=jsonb_strip_nulls(jsonb_build_object('type',coalesce(nullif(fulfillment->>'type',''),'pickup'),
    'address',fulfillment->'address','scheduledAt',nullif(fulfillment->>'scheduledAt',''),
    'pickupDate',nullif(fulfillment->>'pickupDate',''),'pickupTime',nullif(fulfillment->>'pickupTime','')));
  for item in select value from jsonb_array_elements(p->'items') loop
    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,2}$' then raise exception 'INVALID_QUANTITY'; end if;
    quantity:=(item->>'quantity')::integer;
    select * into product from public.produtos where id=(item->>'productId')::integer and id_usuario=p_owner for share;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    raw_modifiers:=coalesce(item->'modifiers',item->'selectedModifiers','[]');
    if jsonb_typeof(raw_modifiers) is distinct from 'array' then raise exception 'INVALID_MODIFIERS'; end if;
    price:=nullif(item->>'unitPrice','')::numeric;
    canonical_pizza:=public.resolve_pizza_item(product.id,p_owner,nullif(item->'pizza','null'),raw_modifiers,price,true);
    if product.tipo_produto='pizza' then
      -- Resolver verifies immutable historical revision and all prices/bounds.
      modifiers:=raw_modifiers;
    else
      additions:=0; override_price:=null; modifiers:='[]';
      if exists(select 1 from jsonb_array_elements(raw_modifiers) x
        left join public.zelomenu_modifier_groups g on g.id::text=x->>'groupId' and g.id_produto=product.id and g.id_usuario=p_owner and g.ativo
        where g.id is null or jsonb_typeof(x->'selectedOptions') is distinct from 'array')
        or (select count(*)<>count(distinct x->>'groupId') from jsonb_array_elements(raw_modifiers) x) then raise exception 'MODIFIER_UNAVAILABLE'; end if;
      for grp in select * from public.zelomenu_modifier_groups where id_produto=product.id and id_usuario=p_owner and ativo order by ordem,id for share loop
        select x into selected from jsonb_array_elements(raw_modifiers) x where x->>'groupId'=grp.id::text;
        options:='[]'; total_q:=0; n:=0;
        if (select count(*)<>count(distinct x->>'optionId') from jsonb_array_elements(coalesce(selected->'selectedOptions','[]')) x) then raise exception 'MODIFIER_DUPLICATE'; end if;
        for picked in select value from jsonb_array_elements(coalesce(selected->'selectedOptions','[]')) loop
          q:=coalesce((picked->>'quantity')::integer,1);
          if q<1 or q>999 or (not grp.permite_quantidade and q<>1) or q>coalesce(grp.maximo_por_opcao,999) then raise exception 'MODIFIER_QUANTITY_INVALID'; end if;
          select o.id,coalesce(lp.nome,o.nome) as name,coalesce(l.price_override,lp.preco,o.price_delta) as price,l.id_produto as linked_id
            into opt from public.zelomenu_modifier_options o
            left join public.zelomenu_modifier_option_products l on l.id_opcao=o.id and l.id_usuario=p_owner
            left join public.produtos lp on lp.id=l.id_produto and lp.id_usuario=p_owner
            where o.id::text=picked->>'optionId' and o.id_grupo=grp.id and o.id_usuario=p_owner and o.ativo;
          if not found then raise exception 'MODIFIER_OPTION_UNAVAILABLE'; end if;
          if (picked->>'priceDelta')::numeric is distinct from opt.price then raise exception 'MODIFIER_PRICE_CHANGED'; end if;
          options:=options||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('optionId',opt.id,'optionName',opt.name,'quantity',q,'priceDelta',opt.price,'linkedProductId',opt.linked_id)));
          total_q:=total_q+q; n:=n+1;
          if grp.modo_preco='substituir' then
            if n>1 then raise exception 'MODIFIER_REPLACEMENT_SELECTION_INVALID'; end if;
            override_price:=opt.price;
          else additions:=additions+opt.price*q; end if;
        end loop;
        if n<grp.min_selecoes or n>coalesce(grp.max_selecoes,999) or total_q<grp.minimo_total_quantidade or total_q>coalesce(grp.maximo_total_quantidade,999999) then raise exception 'MODIFIER_SELECTION_BOUNDS'; end if;
        if n>0 then modifiers:=modifiers||jsonb_build_array(jsonb_build_object('groupId',grp.id,'groupName',grp.nome,'kind',grp.tipo,'selectedOptions',options)); end if;
      end loop;
      if price is distinct from round(coalesce(override_price,product.preco)+additions,2) then raise exception 'PRODUCT_PRICE_CHANGED'; end if;
    end if;
    if price is null or price<0 or price>1000000 or price::text in ('NaN','Infinity','-Infinity') or round(price,2)<>price then raise exception 'INVALID_ITEM_PRICE'; end if;
    subtotal:=subtotal+price*quantity;
    canonical_items:=canonical_items||jsonb_build_array(jsonb_build_object('productId',product.id,'productName',product.nome,'quantity',quantity,
      'unitPrice',price,'lineTotal',price*quantity,'selectedModifiers',modifiers,'pizza',canonical_pizza,'position',jsonb_array_length(canonical_items)));
  end loop;
  if subtotal+fee>1000000 then raise exception 'INVALID_ORDER_TOTAL'; end if;
  result:=public.create_zelo_order(null,null,'pdv-manual:'||(p_operation->>'operationId'),jsonb_build_object('empresaId',company_id,'source','manual',
    'offlineOperationId',p_operation->>'operationId','customer',customer,'fulfillment',fulfillment,'payment',payment,
    'pricing',jsonb_build_object('subtotal',subtotal,'deliveryFee',fee,'discount',0),
    'cart',jsonb_build_object('items',canonical_items,'observations',nullif(p->>'observations',''))),null);
  select * into order_row from public.zelo_orders where id=(result->>'orderId')::uuid and empresa_id=company_id;
  insert into offline_internal.entity_aliases values(p_owner,'order',p_operation->>'entityId',order_row.id::text);
  return result||jsonb_build_object('id',order_row.id,'order',public.zelo_order_result(order_row));
end $$;
revoke all on function offline_internal.create_manual_order(uuid,jsonb) from public,anon,authenticated,service_role;

-- Permit historical pizza revisions only inside the matching authenticated
-- operation transaction. External/manual service-role calls keep their guard.
alter function public.pizza_order_history_allowed(uuid,jsonb,jsonb) rename to pizza_order_history_before_manual;
create function public.pizza_order_history_allowed(p_empresa uuid,p_snapshots jsonb,p_item jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_snapshots->>'source'='manual' and exists(
    select 1 from public.offline_operations o join public.empresa_perfil e on e.user_id=o.owner_user_id
    where e.id=p_empresa and o.operation_id=p_snapshots->>'offlineOperationId'
      and o.operation_type='order.create' and o.status='applying' and o.transaction_id=txid_current()
      and o.synced_by=auth.uid()
  ) then return true; end if;
  return public.pizza_order_history_before_manual(p_empresa,p_snapshots,p_item);
end $$;
revoke all on function public.pizza_order_history_allowed(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function offline_internal.dispatch(p_owner uuid,p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_operation->>'type'='order.create' then return offline_internal.create_manual_order(p_owner,p_operation); end if;
  return offline_internal.dispatch_before_manual_orders(p_owner,p_operation);
end $$;
revoke all on function offline_internal.dispatch(uuid,jsonb) from public,anon,authenticated,service_role;
commit;
