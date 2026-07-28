-- Fase 2A — pedidos/cozinha legado + source='mesa'
--
-- Pré-condições:
--   1. O commit da fase 1 está deployado no ZeloPDV.
--   2. ZeloMenu já aceita table_order via create_zelo_order.
--   3. O export sanitizado e o backup/PITR foram confirmados.
--
-- Esta migration é transacional. CREATE OR REPLACE preserva owner/ACL das
-- funções existentes; os DOs que fazem patch em funções atuais abortam se o
-- corpo esperado não estiver presente, evitando sobrescrever drift silencioso.

begin;

do $$
begin
  if to_regclass('public.zelo_orders') is null then
    raise exception 'PRECONDITION_FAILED: public.zelo_orders is missing';
  end if;
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb)') is null then
    raise exception 'PRECONDITION_FAILED: create_zelo_order is missing';
  end if;
  if to_regprocedure('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)') is null then
    raise exception 'PRECONDITION_FAILED: transition_zelo_order is missing';
  end if;
  if to_regprocedure('public.delete_account(uuid,text)') is null then
    raise exception 'PRECONDITION_FAILED: delete_account is missing';
  end if;
end $$;

alter table public.zelo_orders drop constraint if exists zelo_orders_source_check;
alter table public.zelo_orders
  add constraint zelo_orders_source_check
  check (source = any (array['zelomenu'::text, 'zelochat'::text, 'manual'::text,
    'legacy_zelochat'::text, 'legacy_pedido'::text, 'mesa'::text]));

-- Canonical creation now accepts the live table-order context. The table and
-- comanda are validated while the cart session is locked, and the server
-- snapshot is authoritative over any client payload.
create or replace function public.create_zelo_order(
  p_session_id uuid, p_expected_revision integer, p_idempotency_key text, p_snapshots jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  s public.zelomenu_cart_sessions;
  o public.zelo_orders;
  v_empresa uuid;
  v_item jsonb;
  v_source text;
  v_subtotal numeric(14,2);
  v_fee numeric(14,2);
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_stock_already_committed boolean;
begin
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception using errcode='ZL400',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if p_session_id is not null then
    select * into s from public.zelomenu_cart_sessions where id=p_session_id for update;
    if not found then raise exception using errcode='ZL404',message='CART_NOT_FOUND'; end if;
    if s.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
    if s.context not in ('public_order','table_order') then
      raise exception using errcode='ZL400',message='TABLE_ORDER_NOT_CANONICAL';
    end if;

    v_empresa:=s.empresa_id;
    v_source:=case when s.context='table_order' then 'mesa' else 'zelomenu' end;
    v_stock_already_committed:=false;
    p_snapshots:=jsonb_build_object(
      'customer',coalesce(s.customer_snapshot,'{}'::jsonb),
      'fulfillment',coalesce(s.fulfillment_snapshot,'{}'::jsonb) || case
        when s.context='table_order' then jsonb_build_object(
          'type','mesa',
          'mesaId',s.metadata->>'mesa_id',
          'comandaId',s.metadata->>'comanda_id'
        )
        else '{}'::jsonb
      end,
      'payment',coalesce(s.payment_snapshot,'{}'::jsonb),
      'pricing',coalesce(s.pricing_snapshot,'{}'::jsonb),
      'cart',coalesce(s.cart_snapshot,'{}'::jsonb),
      'source',v_source
    );

    if s.context='table_order' then
      perform 1
      from public.comandas c
      join public.mesas m on m.id=c.id_mesa
      where c.id=(s.metadata->>'comanda_id')::uuid
        and c.id_mesa=(s.metadata->>'mesa_id')::uuid
        and c.id_usuario=(select ep.user_id from public.empresa_perfil ep where ep.id=s.empresa_id)
        and c.status='aberta'
        and m.ativa=true
      for update of c;
      if not found then raise exception using errcode='ZL409',message='COMANDA_CLOSED'; end if;

      if s.capability_id is not null then
        perform 1
        from public.zelomenu_table_capabilities c
        where c.id=s.capability_id
          and c.comanda_id=(s.metadata->>'comanda_id')::uuid
          and c.mesa_id=(s.metadata->>'mesa_id')::uuid
          and c.revoked_at is null
          and c.expires_at>now()
        for update;
        if not found then raise exception using errcode='ZL410',message='TABLE_SESSION_EXPIRED'; end if;
      end if;
    end if;
  else
    v_empresa:=nullif(p_snapshots->>'empresaId','')::uuid;
    v_source:=coalesce(nullif(p_snapshots->>'source',''),'manual');
    v_stock_already_committed:=v_source='mesa'
      and nullif(p_snapshots#>>'{fulfillment,comandaItemId}','') is not null;
  end if;

  if v_empresa is null then raise exception using errcode='ZL400',message='EMPRESA_REQUIRED'; end if;
  if v_source not in ('zelomenu','zelochat','manual','legacy_zelochat','legacy_pedido','mesa') then
    raise exception using errcode='ZL400',message='INVALID_ORDER_SOURCE';
  end if;

  select * into o
  from public.zelo_orders
  where zelomenu_session_id=p_session_id
     or (empresa_id=v_empresa and idempotency_key=p_idempotency_key)
  order by created_at
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'orderId',o.id,
      'orderStatus',o.status,
      'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed',true,
      'revision',o.revision
    );
  end if;

  if p_session_id is not null and s.state<>'cart_open' then
    raise exception using errcode='ZL409',message='CART_ALREADY_CLOSED';
  end if;
  if jsonb_typeof(p_snapshots#>'{cart,items}')<>'array'
     or jsonb_array_length(p_snapshots#>'{cart,items}') not between 1 and 50 then
    raise exception using errcode='ZL400',message='INVALID_ITEMS';
  end if;

  v_subtotal:=coalesce((p_snapshots#>>'{pricing,subtotal}')::numeric,0);
  v_fee:=coalesce((p_snapshots#>>'{pricing,deliveryFee}')::numeric,0);
  v_discount:=coalesce((p_snapshots#>>'{pricing,discount}')::numeric,0);
  v_total:=v_subtotal+v_fee-v_discount;
  if v_total<0 or v_total>1000000 then raise exception using errcode='ZL400',message='INVALID_TOTAL'; end if;

  insert into public.zelo_orders(
    empresa_id,source,status,zelomenu_session_id,idempotency_key,customer,fulfillment,payment,
    subtotal,delivery_fee,discount,total,observations,stock_committed_at
  )
  values(
    v_empresa,v_source,
    case when coalesce((p_snapshots#>>'{payment,pixReceiptRequired}')::boolean,false)
              and not coalesce((p_snapshots#>>'{payment,pixReceiptApproved}')::boolean,false)
         then 'pending_payment' else 'pending_review' end,
    p_session_id,p_idempotency_key,
    coalesce(p_snapshots->'customer','{}'),
    coalesce(p_snapshots->'fulfillment','{}'),
    coalesce(p_snapshots->'payment','{}'),
    v_subtotal,v_fee,v_discount,v_total,p_snapshots#>>'{cart,observations}',
    case when v_stock_already_committed then now() else null end
  ) returning * into o;

  for v_item in select value from jsonb_array_elements(p_snapshots#>'{cart,items}') loop
    if coalesce((v_item->>'quantity')::integer,0) not between 1 and 999 then
      raise exception using errcode='ZL400',message='INVALID_QUANTITY';
    end if;
    if nullif(v_item->>'productId','') is not null and not exists(
      select 1
      from public.produtos p
      join public.empresa_perfil ep on ep.id=v_empresa and ep.user_id=p.id_usuario
      where p.id=(v_item->>'productId')::bigint
    ) then
      raise exception using errcode='ZL404',message='PRODUCT_NOT_FOUND';
    end if;
    insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values(
      o.id,
      nullif(v_item->>'productId','')::bigint,
      coalesce(nullif(v_item->>'productName',''),'Produto'),
      coalesce((v_item->>'unitPrice')::numeric,0),
      (v_item->>'quantity')::integer,
      coalesce((v_item->>'lineTotal')::numeric,(v_item->>'unitPrice')::numeric*(v_item->>'quantity')::integer),
      coalesce(v_item->'selectedModifiers',v_item->'modifiers','[]'),
      coalesce((v_item->>'position')::integer,0)
    );
  end loop;

  if (select coalesce(sum(subtotal),0) from public.zelo_order_items where order_id=o.id)<>v_subtotal then
    raise exception using errcode='ZL400',message='TOTAL_MISMATCH';
  end if;

  insert into public.zelo_order_events(order_id,empresa_id,event_type,to_status,detail)
    values(o.id,o.empresa_id,'created',o.status,jsonb_build_object('source',o.source));
  insert into public.zelo_order_outbox(order_id,empresa_id,topic,payload,idempotency_key)
    values(o.id,o.empresa_id,'order.created',public.zelo_order_result(o),'order.created:'||o.id);

  if p_session_id is not null then
    update public.zelomenu_cart_sessions set
      state=case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      confirmed_at=coalesce(confirmed_at,now()),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'canonicalOrderId',o.id,'idempotencyKey',p_idempotency_key
      )
    where id=p_session_id;
  end if;

  return jsonb_build_object(
    'orderId',o.id,
    'orderStatus',o.status,
    'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed',false,
    'revision',o.revision
  );
exception when unique_violation then
  select * into o
  from public.zelo_orders
  where zelomenu_session_id=p_session_id
     or (empresa_id=v_empresa and idempotency_key=p_idempotency_key)
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object(
      'orderId',o.id,
      'orderStatus',o.status,
      'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed',true,
      'revision',o.revision
    );
  end if;
  raise;
end $$;

-- Preserve the production's linked-modifier stock logic. A QR table order has
-- not consumed comanda stock yet and therefore follows the existing accepted
-- transition. An order materialized from an existing comanda item carries
-- comandaItemId and must not release that stock if its kitchen order is later
-- cancelled.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure)
    into v_definition;
  if position('o.fulfillment->>''comandaItemId'' is null' in v_definition)=0 then
    if position('if v_to=''cancelled'' and o.stock_committed_at is not null and o.stock_released_at is null then' in v_definition)=0 then
      raise exception 'PRECONDITION_FAILED: transition_zelo_order body drifted';
    end if;
    v_definition:=replace(v_definition,
      'if v_to=''cancelled'' and o.stock_committed_at is not null and o.stock_released_at is null then',
      'if v_to=''cancelled'' and o.stock_committed_at is not null and o.stock_released_at is null
         and (o.source <> ''mesa'' or o.fulfillment->>''comandaItemId'' is null) then');
    execute v_definition;
  end if;
end $$;

-- Defense in depth for the trigger path.
do $$
declare
  v_definition text;
  v_anchor text := E'  if v_order.sale_id is not null then';
begin
  select pg_get_functiondef('public.ensure_zelo_order_sale(uuid,timestamptz)'::regprocedure)
    into v_definition;
  if position('v_order.source = ''mesa''' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      raise exception 'PRECONDITION_FAILED: ensure_zelo_order_sale body drifted';
    end if;
    v_definition:=replace(v_definition, v_anchor,
      E'  if v_order.source = ''mesa'' then\n    return null;\n  end if;\n\n' || v_anchor);
    execute v_definition;
  end if;
end $$;

-- A mesa order is closed by the comanda sale, never by the online-order sale
-- RPC. Keep an explicit error for accidental/manual calls.
do $$
declare
  v_definition text;
  v_anchor text := E'  if o.sale_id is not null then';
begin
  select pg_get_functiondef('public.close_zelo_order(uuid,integer,jsonb,uuid)'::regprocedure)
    into v_definition;
  if position('MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      raise exception 'PRECONDITION_FAILED: close_zelo_order body drifted';
    end if;
    v_definition:=replace(v_definition, v_anchor,
      E'  if o.source = ''mesa'' then\n    raise exception using errcode=''ZL409'', message=''MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED'';\n  end if;\n\n' || v_anchor);
    execute v_definition;
  end if;
end $$;

-- Keep old callers safe during the deploy window. table_order is redirected
-- to the canonical function; public_order keeps its legacy fallback only for
-- old bundles that have not switched to create_zelo_order yet.
create or replace function public.confirm_zelomenu_cart(
  p_session_id uuid, p_token_hash text, p_expected_revision integer,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  s public.zelomenu_cart_sessions;
  v_order_id uuid;
  v_state text;
  item record;
begin
  select * into s from public.zelomenu_cart_sessions where id=p_session_id for update;
  if not found then raise exception using errcode='ZL404',message='CART_NOT_FOUND'; end if;
  if s.current_token_hash is distinct from p_token_hash then
    raise exception using errcode='ZL410',message='STALE_CART_TOKEN';
  end if;
  if s.revision<>p_expected_revision then
    raise exception using errcode='ZL409',message='REVISION_CONFLICT';
  end if;

  if s.context='table_order' then
    select o.id into v_order_id from public.zelo_orders o where o.zelomenu_session_id=s.id;
  else
    select o.id into v_order_id from public.zelochat_orders o where o.zelomenu_session_id=s.id;
  end if;
  if v_order_id is not null then
    return jsonb_build_object('orderId',v_order_id,'state',s.state,'alreadyConfirmed',true);
  end if;
  if s.state<>'cart_open' then raise exception using errcode='ZL409',message='CART_ALREADY_CLOSED'; end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception using errcode='ZL400',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if s.context='table_order' then
    perform 1
    from public.comandas c
    join public.mesas m on m.id=c.id_mesa
    where c.id=(s.metadata->>'comanda_id')::uuid
      and c.id_mesa=(s.metadata->>'mesa_id')::uuid
      and c.id_usuario=(select ep.user_id from public.empresa_perfil ep where ep.id=s.empresa_id)
      and c.status='aberta'
      and m.ativa=true
    for update of c;
    if not found then raise exception using errcode='ZL409',message='COMANDA_CLOSED'; end if;
    if s.capability_id is not null then
      perform 1
      from public.zelomenu_table_capabilities c
      where c.id=s.capability_id
        and c.comanda_id=(s.metadata->>'comanda_id')::uuid
        and c.mesa_id=(s.metadata->>'mesa_id')::uuid
        and c.revoked_at is null
        and c.expires_at>now()
      for update;
      if not found then raise exception using errcode='ZL410',message='TABLE_SESSION_EXPIRED'; end if;
    end if;
  else
    -- Legacy public_order fallback only. The current ZeloMenu bundle uses the
    -- canonical path directly and therefore does not enter this branch.
    for item in
      select (x->>'productId')::bigint product_id, sum((x->>'quantity')::integer) quantity
      from jsonb_array_elements(s.cart_snapshot->'items') x
      group by (x->>'productId')::bigint
    loop
      if item.quantity < 1 or item.quantity > 999 then
        raise exception using errcode='ZL400',message='INVALID_QUANTITY';
      end if;
      update public.produtos
      set estoque_atual=estoque_atual-item.quantity
      where id=item.product_id and controlar_estoque=true and estoque_atual>=item.quantity;
      if not found and exists(select 1 from public.produtos where id=item.product_id and controlar_estoque=true) then
        raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED';
      end if;
    end loop;
  end if;

  v_state:=case when coalesce((s.payment_snapshot->>'pixReceiptRequired')::boolean,false)
                     and not coalesce((s.payment_snapshot->>'pixReceiptApproved')::boolean,false)
                then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end;

  if s.context='table_order' then
    select public.create_zelo_order(
      s.id,
      p_expected_revision,
      p_idempotency_key,
      jsonb_build_object(
        'empresaId',s.empresa_id,
        'source','mesa',
        'customer',coalesce(s.customer_snapshot,'{}'::jsonb),
        'fulfillment',coalesce(s.fulfillment_snapshot,'{}'::jsonb)||jsonb_build_object(
          'type','mesa','mesaId',s.metadata->>'mesa_id','comandaId',s.metadata->>'comanda_id'
        ),
        'payment',coalesce(s.payment_snapshot,'{}'::jsonb),
        'pricing',coalesce(s.pricing_snapshot,'{}'::jsonb),
        'cart',coalesce(s.cart_snapshot,'{}'::jsonb)
      )
    )->>'orderId' into v_order_id;
    update public.zelomenu_cart_sessions
    set state=v_state, confirmed_at=now(), updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('productionOrderId',v_order_id,'idempotencyKey',p_idempotency_key)
    where id=s.id;
    return jsonb_build_object('orderId',v_order_id,'state',v_state,'alreadyConfirmed',false);
  end if;

  insert into public.zelochat_orders(
    empresa_id,customer_name,customer_phone,items,pickup_date,pickup_time,
    payment_method,delivery_address,delivery_neighborhood,delivery_fee,observations,status,total,source,zelomenu_session_id
  )
  values(
    s.empresa_id,
    coalesce(s.customer_snapshot->>'name','Cliente'),
    s.customer_snapshot->>'phone',
    (select jsonb_agg(jsonb_build_object('product',x->>'productName','quantity',(x->>'quantity')::integer))
       from jsonb_array_elements(s.cart_snapshot->'items') x),
    coalesce(s.fulfillment_snapshot->>'pickupDate',''),
    coalesce(s.fulfillment_snapshot->>'pickupTime',''),
    s.payment_snapshot->>'declaredMethod',
    s.fulfillment_snapshot->>'deliveryAddress',
    s.fulfillment_snapshot->>'deliveryNeighborhood',
    nullif(s.fulfillment_snapshot->>'deliveryFee','')::numeric,
    s.cart_snapshot->>'observations',
    'pending',
    (s.pricing_snapshot->>'total')::numeric,
    'zelomenu',
    s.id
  ) returning id into v_order_id;

  update public.zelomenu_cart_sessions
  set state=v_state, confirmed_at=now(), updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('productionOrderId',v_order_id,'idempotencyKey',p_idempotency_key)
  where id=s.id;
  return jsonb_build_object('orderId',v_order_id,'state',v_state,'alreadyConfirmed',false);
end $$;

-- Remove the legacy reference before dropping its tables, in the same
-- transaction. CREATE OR REPLACE retains the function ACL and owner.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.delete_account(uuid,text)'::regprocedure)
    into v_definition;
  if position('delete from pedidos' in v_definition)>0 then
    v_definition:=replace(v_definition, E'  delete from pedidos  where id_usuario = p_user_id;\n', '');
    if position('delete from pedidos' in v_definition)>0 then
      raise exception 'PRECONDITION_FAILED: delete_account legacy reference could not be removed';
    end if;
    execute v_definition;
  end if;
end $$;

drop policy if exists pedido_itens_actor on public.pedido_itens;
drop policy if exists pedidos_actor on public.pedidos;
drop table public.pedido_itens;
drop table public.pedidos;
drop function public.proximo_numero_pedido(uuid);

commit;
