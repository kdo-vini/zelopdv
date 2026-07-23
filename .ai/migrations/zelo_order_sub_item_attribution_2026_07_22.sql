-- Splits a "combo" order item's already-resolved unit_price between the
-- container product and any modifier option linked to a real catalog
-- product (zelomenu_modifier_option_products), so vendas_itens gets one
-- line per real product sold instead of only the container's name.
-- Additive: items with no linked options produce identical output to
-- the previous definition of close_zelo_order.
create or replace function public.close_zelo_order(
  p_order_id uuid, p_expected_revision integer, p_payment jsonb, p_actor_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  o public.zelo_orders;
  v_sale jsonb;
  v_sale_payload jsonb;
  v_neg record;
begin
  select * into o from public.zelo_orders where id=p_order_id for update;
  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;
  if auth.role()<>'service_role' then
    if p_actor_id is null then p_actor_id:=auth.uid();
    elsif p_actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='FORGED_ACTOR'; end if;
    if not public.zelo_order_has_permission(o.empresa_id,'pedidos.receber') then
      raise exception using errcode='42501',message='ORDER_PERMISSION_DENIED',detail='pedidos.receber';
    end if;
  end if;
  if o.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
  if o.sale_id is not null then return public.zelo_order_result(o)||jsonb_build_object('idempotent',true); end if;
  if o.status not in ('ready','out_for_delivery') then raise exception using errcode='ZL409',message='INVALID_ORDER_TRANSITION'; end if;

  -- Defensive invariant check: log (never block) if the decomposition
  -- below would produce a negative container price for any item.
  for v_neg in
    select b.id, b.name, (b.unit_price - coalesce(lt.per_unit_contribution,0)) as computed
    from (select id,name,unit_price,modifiers from public.zelo_order_items where order_id=o.id) b
    left join lateral (
      select sum((opt->>'priceDelta')::numeric * coalesce((opt->>'quantity')::integer,1)) as per_unit_contribution
      from jsonb_array_elements(coalesce(b.modifiers,'[]'::jsonb)) grp
      cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
      join public.zelomenu_modifier_option_products lp
        on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and lp.id_opcao=(opt->>'optionId')::uuid
    ) lt on true
    where (b.unit_price - coalesce(lt.per_unit_contribution,0)) < 0
  loop
    raise warning 'ZL_NEGATIVE_CONTAINER_PRICE order_item=% name=% computed=%', v_neg.id, v_neg.name, v_neg.computed;
  end loop;

  v_sale_payload:=coalesce(p_payment,'{}')||jsonb_build_object(
    'client_sale_id','zelo-order:'||o.id,'valor_total',o.total,
    'forma_pagamento',coalesce(
      nullif(nullif(p_payment->>'forma_pagamento',''),'outro'),
      nullif(nullif(p_payment->>'formaPagamento',''),'outro'),
      nullif(o.payment->>'declaredMethod',''),
      nullif(o.payment->>'method',''),
      'outro'
    ),
    'tipo_pedido',case when coalesce(o.fulfillment->>'mode',o.fulfillment->>'type')='delivery'
      then 'delivery' else 'retirada' end,
    'taxa_entrega',o.delivery_fee,
    'itens',(
      with base as (
        select i.id, i.product_id, i.name, i.unit_price, i.quantity, i.position, i.modifiers
        from public.zelo_order_items i where i.order_id=o.id
      ),
      linked as (
        select
          b.id as item_id, b.position, b.quantity as item_quantity,
          lp.id_produto,
          (opt->>'optionName') as nome,
          (opt->>'priceDelta')::numeric as preco_unitario,
          coalesce((opt->>'quantity')::integer,1) as option_quantity
        from base b
        cross join lateral jsonb_array_elements(coalesce(b.modifiers,'[]'::jsonb)) as grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) as opt
        join public.zelomenu_modifier_option_products lp
          on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and lp.id_opcao=(opt->>'optionId')::uuid
      ),
      linked_totals as (
        select item_id, sum(preco_unitario*option_quantity) as per_unit_contribution
        from linked group by item_id
      ),
      rows as (
        select b.position as pos, jsonb_build_object(
            'id_produto',b.product_id,'nome_produto_na_venda',b.name,
            'preco_unitario_na_venda',greatest(b.unit_price-coalesce(lt.per_unit_contribution,0),0),
            'quantidade',b.quantity
          ) as item
        from base b left join linked_totals lt on lt.item_id=b.id
        union all
        select l.position as pos, jsonb_build_object(
            'id_produto',l.id_produto,'nome_produto_na_venda',l.nome,
            'preco_unitario_na_venda',l.preco_unitario,
            'quantidade',l.option_quantity*l.item_quantity
          )
        from linked l
      )
      select coalesce(jsonb_agg(item order by pos),'[]'::jsonb) from rows
    ),
    'estoque','[]'::jsonb);
  v_sale:=public.criar_venda_completa(v_sale_payload);
  update public.zelo_orders set sale_id=(v_sale->>'id')::bigint where id=o.id;
  return public.transition_zelo_order(o.id,o.revision,'deliver',p_actor_id,jsonb_build_object('saleId',v_sale->>'id'));
end $$;

create or replace function public.transition_zelo_order(p_order_id uuid,p_expected_revision integer,p_action text,
  p_actor_id uuid default null,p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.zelo_orders; v_to text; v_owner uuid; v_from text; v_stock record; v_permission text;
begin
  select * into o from public.zelo_orders where id=p_order_id for update;
  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;
  if auth.role()<>'service_role' then
    if p_actor_id is null then p_actor_id:=auth.uid();
    elsif p_actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='FORGED_ACTOR'; end if;
    v_owner:=public.get_owner_user_id(auth.uid());
    if not exists(select 1 from public.empresa_perfil where id=o.empresa_id and user_id=v_owner) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    v_permission:=case
      when p_action in ('cancel','reject') then 'pedidos.cancelar'
      when p_action in ('deliver') then 'pedidos.receber'
      when p_action in ('start_preparing','mark_ready') then 'pedidos.cozinha'
      when p_action in ('accept','dispatch','payment_approved') then 'pedidos.acessar'
    end;
    if v_permission is null or not public.zelo_order_has_permission(o.empresa_id,v_permission) then
      raise exception using errcode='42501',message='ORDER_PERMISSION_DENIED',detail=coalesce(v_permission,p_action);
    end if;
  end if;
  if o.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
  v_from:=o.status;
  v_to:=case p_action when 'payment_approved' then 'pending_review' when 'accept' then 'accepted'
    when 'start_preparing' then 'preparing' when 'mark_ready' then 'ready' when 'dispatch' then 'out_for_delivery'
    when 'deliver' then 'delivered' when 'reject' then 'rejected' when 'cancel' then 'cancelled' end;
  if v_to is null or not ((o.status='pending_payment' and v_to in ('pending_review','cancelled')) or
    (o.status='pending_review' and v_to in ('accepted','rejected','cancelled')) or
    (o.status='accepted' and v_to in ('preparing','cancelled')) or (o.status='preparing' and v_to in ('ready','cancelled')) or
    (o.status='ready' and v_to in ('out_for_delivery','delivered','cancelled')) or
    (o.status='out_for_delivery' and v_to='delivered')) then raise exception using errcode='ZL409',message='INVALID_ORDER_TRANSITION'; end if;

  if v_to='accepted' and o.stock_committed_at is null then
    -- product_id/quantity source now unions the container's own line with
    -- every linked-option product found inside its modifiers, so a product
    -- sold both standalone and as a combo's linked option in the same
    -- order aggregates correctly (matches the two-pass pattern already
    -- used by server/zelomenuCartSessions.ts resolveSnapshots).
    for v_stock in
      select c.id,c.nome,coalesce(c.estoque_compartilhado_atual,0) available,sum(x.quantity)::integer quantity
      from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(opt->>'quantity')::integer*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and lp.id_opcao=(opt->>'optionId')::uuid
        where oi.order_id=o.id
      ) x
      join public.produtos p on p.id=x.product_id
      join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where coalesce(c.controlar_estoque_compartilhado,false)
      group by c.id,c.nome,c.estoque_compartilhado_atual
    loop
      update public.categorias set estoque_compartilhado_atual=coalesce(estoque_compartilhado_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_compartilhado_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
    for v_stock in
      select p.id,p.nome,coalesce(p.estoque_atual,0) available,sum(x.quantity)::integer quantity
      from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(opt->>'quantity')::integer*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and lp.id_opcao=(opt->>'optionId')::uuid
        where oi.order_id=o.id
      ) x
      join public.produtos p on p.id=x.product_id
      left join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where coalesce(p.controlar_estoque,false) and not coalesce(c.controlar_estoque_compartilhado,false)
      group by p.id,p.nome,p.estoque_atual
    loop
      update public.produtos set estoque_atual=coalesce(estoque_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
  end if;

  if v_to='cancelled' and o.stock_committed_at is not null and o.stock_released_at is null then
    update public.categorias c set estoque_compartilhado_atual=coalesce(c.estoque_compartilhado_atual,0)+x.quantity
    from (
      select p2.id_categoria as cat_id, sum(y.quantity)::integer quantity from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(opt->>'quantity')::integer*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and lp.id_opcao=(opt->>'optionId')::uuid
        where oi.order_id=o.id
      ) y
      join public.produtos p2 on p2.id=y.product_id
      join public.categorias c2 on c2.id=p2.id_categoria and coalesce(c2.controlar_estoque_compartilhado,false)
      group by p2.id_categoria
    ) x(cat_id,quantity) where c.id=x.cat_id;
    update public.produtos p set estoque_atual=coalesce(p.estoque_atual,0)+x.quantity
    from (
      select y.product_id, sum(y.quantity)::integer quantity from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(opt->>'quantity')::integer*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and lp.id_opcao=(opt->>'optionId')::uuid
        where oi.order_id=o.id
      ) y
      join public.produtos p2 on p2.id=y.product_id
      left join public.categorias c2 on c2.id=p2.id_categoria
      where coalesce(p2.controlar_estoque,false) and not coalesce(c2.controlar_estoque_compartilhado,false)
      group by y.product_id
    ) x(product_id,quantity) where p.id=x.product_id;
  end if;

  update public.zelo_orders set status=v_to,revision=revision+1,updated_at=now(),
    accepted_at=case when v_to='accepted' then now() else accepted_at end,
    stock_committed_at=case when v_to='accepted' then now() else stock_committed_at end,
    stock_released_at=case when v_to='cancelled' and stock_committed_at is not null then now() else stock_released_at end,
    rejected_at=case when v_to='rejected' then now() else rejected_at end,
    closed_at=case when v_to in ('delivered','rejected','cancelled') then now() else closed_at end
    where id=o.id returning * into o;
  insert into public.zelo_order_events(order_id,empresa_id,event_type,from_status,to_status,actor_id,detail)
    values(o.id,o.empresa_id,p_action,v_from,v_to,p_actor_id,coalesce(p_detail,'{}'));
  insert into public.zelo_order_outbox(order_id,empresa_id,topic,payload,idempotency_key)
    values(o.id,o.empresa_id,'order.'||p_action,public.zelo_order_result(o)||jsonb_build_object('detail',p_detail),
      'order.'||p_action||':'||o.id||':'||o.revision);
  return public.zelo_order_result(o);
end $$;
