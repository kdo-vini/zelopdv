-- Canonical online order engine shared by ZeloMenu, ZeloPDV and ZeloChat.
-- Additive and rollback-friendly: legacy tables remain untouched/readable.
begin;

create table if not exists public.zelo_orders (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  source text not null check (source in ('zelomenu','zelochat','manual','legacy_zelochat','legacy_pedido')),
  status text not null default 'pending_review' check (status in (
    'pending_payment','pending_review','accepted','preparing','ready',
    'out_for_delivery','delivered','rejected','cancelled'
  )),
  revision integer not null default 1 check (revision > 0),
  zelomenu_session_id uuid,
  idempotency_key text,
  legacy_zelochat_order_id uuid,
  legacy_pedido_id uuid,
  customer jsonb not null default '{}'::jsonb,
  fulfillment jsonb not null default '{}'::jsonb,
  payment jsonb not null default '{}'::jsonb,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  observations text check (observations is null or length(observations) <= 500),
  accepted_at timestamptz,
  stock_committed_at timestamptz,
  stock_released_at timestamptz,
  rejected_at timestamptz,
  closed_at timestamptz,
  sale_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zelo_orders_total_consistent check (total = subtotal + delivery_fee - discount)
);

create unique index if not exists zelo_orders_session_uidx on public.zelo_orders(zelomenu_session_id) where zelomenu_session_id is not null;
create unique index if not exists zelo_orders_idempotency_uidx on public.zelo_orders(empresa_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists zelo_orders_legacy_chat_uidx on public.zelo_orders(legacy_zelochat_order_id) where legacy_zelochat_order_id is not null;
create unique index if not exists zelo_orders_legacy_pedido_uidx on public.zelo_orders(legacy_pedido_id) where legacy_pedido_id is not null;
create index if not exists zelo_orders_empresa_status_idx on public.zelo_orders(empresa_id,status,created_at desc);

create table if not exists public.zelo_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.zelo_orders(id) on delete cascade,
  product_id bigint,
  name text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 999),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  modifiers jsonb not null default '[]'::jsonb,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create index if not exists zelo_order_items_order_idx on public.zelo_order_items(order_id,position);

create table if not exists public.zelo_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.zelo_orders(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists zelo_order_events_order_idx on public.zelo_order_events(order_id,id);

create table if not exists public.zelo_order_outbox (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.zelo_orders(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  topic text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists zelo_order_outbox_pending_idx on public.zelo_order_outbox(available_at,id) where processed_at is null;

alter table public.zelo_orders enable row level security;
alter table public.zelo_order_items enable row level security;
alter table public.zelo_order_events enable row level security;
alter table public.zelo_order_outbox enable row level security;

drop policy if exists zelo_orders_owner_select on public.zelo_orders;
create policy zelo_orders_owner_select on public.zelo_orders for select to authenticated
 using (empresa_id in (select id from public.empresa_perfil where user_id=public.get_owner_user_id(auth.uid())));
drop policy if exists zelo_order_items_owner_select on public.zelo_order_items;
create policy zelo_order_items_owner_select on public.zelo_order_items for select to authenticated
 using (exists(select 1 from public.zelo_orders o where o.id=order_id and o.empresa_id in
   (select id from public.empresa_perfil where user_id=public.get_owner_user_id(auth.uid()))));
drop policy if exists zelo_order_events_owner_select on public.zelo_order_events;
create policy zelo_order_events_owner_select on public.zelo_order_events for select to authenticated
 using (empresa_id in (select id from public.empresa_perfil where user_id=public.get_owner_user_id(auth.uid())));
-- Outbox is deliberately service-role only.

revoke all on public.zelo_orders, public.zelo_order_items, public.zelo_order_events, public.zelo_order_outbox from public, anon, authenticated;
grant select on public.zelo_orders, public.zelo_order_items, public.zelo_order_events to authenticated;
grant select,insert,update,delete on public.zelo_orders, public.zelo_order_items, public.zelo_order_events, public.zelo_order_outbox to service_role;
grant usage,select on sequence public.zelo_order_events_id_seq, public.zelo_order_outbox_id_seq to service_role;

create or replace function public.zelo_order_result(p_order public.zelo_orders)
returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('orderId',p_order.id,'status',p_order.status,'revision',p_order.revision,
   'total',p_order.total,'saleId',p_order.sale_id)
$$;

create or replace function public.create_zelo_order(
  p_session_id uuid, p_expected_revision integer, p_idempotency_key text, p_snapshots jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.zelomenu_cart_sessions; o public.zelo_orders; v_empresa uuid; v_item jsonb;
  v_subtotal numeric(14,2); v_fee numeric(14,2); v_discount numeric(14,2); v_total numeric(14,2);
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception using errcode='ZL400',message='IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_session_id is not null then
    select * into s from public.zelomenu_cart_sessions where id=p_session_id for update;
    if not found then raise exception using errcode='ZL404',message='CART_NOT_FOUND'; end if;
    if s.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
    if s.context<>'public_order' then raise exception using errcode='ZL400',message='TABLE_ORDER_NOT_CANONICAL'; end if;
    v_empresa:=s.empresa_id;
    p_snapshots:=jsonb_build_object('customer',s.customer_snapshot,'fulfillment',s.fulfillment_snapshot,
      'payment',s.payment_snapshot,'pricing',s.pricing_snapshot,'cart',s.cart_snapshot,'source','zelomenu');
  else
    v_empresa:=nullif(p_snapshots->>'empresaId','')::uuid;
  end if;
  if v_empresa is null then raise exception using errcode='ZL400',message='EMPRESA_REQUIRED'; end if;
  select * into o from public.zelo_orders where zelomenu_session_id=p_session_id or
    (empresa_id=v_empresa and idempotency_key=p_idempotency_key) order by created_at limit 1 for update;
  if found then return jsonb_build_object('orderId',o.id,'orderStatus',o.status,
    'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed',true,'revision',o.revision); end if;
  if p_session_id is not null and s.state<>'cart_open' then
    raise exception using errcode='ZL409',message='CART_ALREADY_CLOSED';
  end if;
  if jsonb_typeof(p_snapshots#>'{cart,items}')<>'array' or jsonb_array_length(p_snapshots#>'{cart,items}') not between 1 and 50 then
    raise exception using errcode='ZL400',message='INVALID_ITEMS';
  end if;
  v_subtotal:=coalesce((p_snapshots#>>'{pricing,subtotal}')::numeric,0);
  v_fee:=coalesce((p_snapshots#>>'{pricing,deliveryFee}')::numeric,0);
  v_discount:=coalesce((p_snapshots#>>'{pricing,discount}')::numeric,0);
  v_total:=v_subtotal+v_fee-v_discount;
  if v_total<0 or v_total>1000000 then raise exception using errcode='ZL400',message='INVALID_TOTAL'; end if;
  insert into public.zelo_orders(empresa_id,source,status,zelomenu_session_id,idempotency_key,customer,fulfillment,payment,
    subtotal,delivery_fee,discount,total,observations)
  values(v_empresa,coalesce(nullif(p_snapshots->>'source',''),'zelomenu'),
    case when coalesce((p_snapshots#>>'{payment,pixReceiptRequired}')::boolean,false) and
                   not coalesce((p_snapshots#>>'{payment,pixReceiptApproved}')::boolean,false)
         then 'pending_payment' else 'pending_review' end,
    p_session_id,p_idempotency_key,coalesce(p_snapshots->'customer','{}'),coalesce(p_snapshots->'fulfillment','{}'),
    coalesce(p_snapshots->'payment','{}'),v_subtotal,v_fee,v_discount,v_total,p_snapshots#>>'{cart,observations}') returning * into o;
  for v_item in select value from jsonb_array_elements(p_snapshots#>'{cart,items}') loop
    if coalesce((v_item->>'quantity')::integer,0) not between 1 and 999 then raise exception using errcode='ZL400',message='INVALID_QUANTITY'; end if;
    if nullif(v_item->>'productId','') is not null and not exists(
      select 1 from public.produtos p join public.empresa_perfil ep on ep.id=v_empresa and ep.user_id=p.id_usuario
      where p.id=(v_item->>'productId')::bigint
    ) then raise exception using errcode='ZL404',message='PRODUCT_NOT_FOUND'; end if;
    insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values(o.id,nullif(v_item->>'productId','')::bigint,coalesce(nullif(v_item->>'productName',''),'Produto'),
      coalesce((v_item->>'unitPrice')::numeric,0),(v_item->>'quantity')::integer,
      coalesce((v_item->>'lineTotal')::numeric,(v_item->>'unitPrice')::numeric*(v_item->>'quantity')::integer),
      coalesce(v_item->'selectedModifiers',v_item->'modifiers','[]'),coalesce((v_item->>'position')::integer,0));
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
      confirmed_at=coalesce(confirmed_at,now()),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('canonicalOrderId',o.id,'idempotencyKey',p_idempotency_key)
    where id=p_session_id;
  end if;
  return jsonb_build_object('orderId',o.id,'orderStatus',o.status,
    'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed',false,'revision',o.revision);
exception when unique_violation then
  select * into o from public.zelo_orders where zelomenu_session_id=p_session_id or
    (empresa_id=v_empresa and idempotency_key=p_idempotency_key) order by created_at limit 1;
  if found then return jsonb_build_object('orderId',o.id,'orderStatus',o.status,
    'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed',true,'revision',o.revision); end if; raise;
end $$;

create or replace function public.zelo_order_has_permission(p_empresa_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when auth.uid() is null then false
    when ep.user_id=auth.uid() then true
    else exists(
      select 1 from public.access_users au
      join public.access_roles ar on ar.id=au.role_id and ar.owner_user_id=au.owner_user_id
      where au.auth_user_id=auth.uid() and au.owner_user_id=ep.user_id and au.status='active'
        and coalesce((ar.permissions->>p_permission)::boolean,false)
    )
  end
  from public.empresa_perfil ep where ep.id=p_empresa_id
$$;

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
    -- Shared category stock is decremented once per category, after item aggregation.
    for v_stock in
      select c.id,c.nome,coalesce(c.estoque_compartilhado_atual,0) available,sum(oi.quantity)::integer quantity
      from public.zelo_order_items oi join public.produtos p on p.id=oi.product_id
      join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where oi.order_id=o.id and coalesce(c.controlar_estoque_compartilhado,false)
      group by c.id,c.nome,c.estoque_compartilhado_atual
    loop
      update public.categorias set estoque_compartilhado_atual=coalesce(estoque_compartilhado_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_compartilhado_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
    -- Product stock is likewise aggregated, preventing duplicated lines from overcommitting.
    for v_stock in
      select p.id,p.nome,coalesce(p.estoque_atual,0) available,sum(oi.quantity)::integer quantity
      from public.zelo_order_items oi join public.produtos p on p.id=oi.product_id
      left join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where oi.order_id=o.id and coalesce(p.controlar_estoque,false) and not coalesce(c.controlar_estoque_compartilhado,false)
      group by p.id,p.nome,p.estoque_atual
    loop
      update public.produtos set estoque_atual=coalesce(estoque_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
  end if;
  if v_to='cancelled' and o.stock_committed_at is not null and o.stock_released_at is null then
    update public.categorias c set estoque_compartilhado_atual=coalesce(c.estoque_compartilhado_atual,0)+x.quantity
    from (select c2.id,sum(oi.quantity)::integer quantity from public.zelo_order_items oi
      join public.produtos p on p.id=oi.product_id join public.categorias c2 on c2.id=p.id_categoria
      where oi.order_id=o.id and coalesce(c2.controlar_estoque_compartilhado,false) group by c2.id) x where c.id=x.id;
    update public.produtos p set estoque_atual=coalesce(p.estoque_atual,0)+x.quantity
    from (select p2.id,sum(oi.quantity)::integer quantity from public.zelo_order_items oi
      join public.produtos p2 on p2.id=oi.product_id left join public.categorias c on c.id=p2.id_categoria
      where oi.order_id=o.id and coalesce(p2.controlar_estoque,false) and not coalesce(c.controlar_estoque_compartilhado,false)
      group by p2.id) x where p.id=x.id;
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

create or replace function public.accept_zelo_order(p_order_id uuid,p_expected_revision integer,p_actor_id uuid default null)
returns jsonb language sql security definer set search_path=public as $$
 select public.transition_zelo_order(p_order_id,p_expected_revision,'accept',p_actor_id,'{}') $$;
create or replace function public.reject_zelo_order(p_order_id uuid,p_expected_revision integer,p_actor_id uuid default null,p_reason text default null)
returns jsonb language sql security definer set search_path=public as $$
 select public.transition_zelo_order(p_order_id,p_expected_revision,'reject',p_actor_id,jsonb_build_object('reason',left(coalesce(p_reason,''),500))) $$;

-- Financial close delegates to the existing idempotent sale RPC, then marks the order delivered.
create or replace function public.close_zelo_order(p_order_id uuid,p_expected_revision integer,p_payment jsonb,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.zelo_orders; v_sale jsonb; v_sale_payload jsonb;
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
    'itens',(select coalesce(jsonb_agg(jsonb_build_object('id_produto',i.product_id,'nome_produto_na_venda',i.name,
      'preco_unitario_na_venda',i.unit_price,'quantidade',i.quantity) order by i.position),'[]'::jsonb)
      from public.zelo_order_items i where i.order_id=o.id),
    -- Stock was committed during accept; an empty list prevents a second decrement in the sale RPC.
    'estoque','[]'::jsonb);
  v_sale:=public.criar_venda_completa(v_sale_payload);
  update public.zelo_orders set sale_id=(v_sale->>'id')::bigint where id=o.id;
  return public.transition_zelo_order(o.id,o.revision,'deliver',p_actor_id,jsonb_build_object('saleId',v_sale->>'id'));
end $$;

revoke all on function public.zelo_order_result(public.zelo_orders) from public,anon,authenticated;
revoke all on function public.zelo_order_has_permission(uuid,text) from public,anon,authenticated;
revoke all on function public.create_zelo_order(uuid,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.transition_zelo_order(uuid,integer,text,uuid,jsonb) from public,anon;
revoke all on function public.accept_zelo_order(uuid,integer,uuid) from public,anon;
revoke all on function public.reject_zelo_order(uuid,integer,uuid,text) from public,anon;
revoke all on function public.close_zelo_order(uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.create_zelo_order(uuid,integer,text,jsonb) to service_role;
grant execute on function public.transition_zelo_order(uuid,integer,text,uuid,jsonb), public.accept_zelo_order(uuid,integer,uuid),
 public.reject_zelo_order(uuid,integer,uuid,text) to authenticated,service_role;
-- Financial close uses auth.uid() inside criar_venda_completa and is intentionally user-session only.
grant execute on function public.close_zelo_order(uuid,integer,jsonb,uuid) to authenticated;

-- Deterministic legacy backfill. ON CONFLICT makes reruns safe; source rows are never updated/deleted.
do $$ begin
  if exists(select 1 from public.pedidos where zelochat_order_id is not null group by zelochat_order_id having count(*)>1) then
    raise exception 'CANONICAL_BACKFILL_DUPLICATE_PEDIDO_LINK';
  end if;
end $$;

insert into public.zelo_orders(empresa_id,source,status,zelomenu_session_id,legacy_zelochat_order_id,customer,fulfillment,payment,
 subtotal,delivery_fee,total,observations,created_at,updated_at)
select z.empresa_id,'legacy_zelochat',case z.status when 'pending' then 'pending_review' when 'preparing' then 'preparing'
 when 'ready' then 'ready' when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
 when 'rejected' then 'rejected' when 'cancelled' then 'cancelled' else 'cancelled' end,z.zelomenu_session_id,z.id,
 jsonb_strip_nulls(jsonb_build_object('name',z.customer_name,'phone',z.customer_phone)),
 jsonb_strip_nulls(jsonb_build_object('pickupDate',z.pickup_date,'pickupTime',z.pickup_time,'address',z.delivery_address,'neighborhood',z.delivery_neighborhood)),
 jsonb_strip_nulls(jsonb_build_object('method',z.payment_method)),greatest(coalesce(z.total,0)-coalesce(z.delivery_fee,0),0),
 coalesce(z.delivery_fee,0),coalesce(z.total,0),z.observations,z.created_at,z.updated_at
from public.zelochat_orders z on conflict (legacy_zelochat_order_id) where legacy_zelochat_order_id is not null do nothing;

insert into public.zelo_order_items(order_id,name,unit_price,quantity,subtotal,position)
select o.id,coalesce(i.value->>'product',i.value->>'name','Produto'),
 coalesce((i.value->>'unitPrice')::numeric,(i.value->>'price')::numeric,0),greatest(coalesce((i.value->>'quantity')::integer,1),1),
 coalesce((i.value->>'lineTotal')::numeric,(i.value->>'subtotal')::numeric,0),(i.ordinality-1)::integer
from public.zelo_orders o join public.zelochat_orders z on z.id=o.legacy_zelochat_order_id
cross join lateral jsonb_array_elements(z.items) with ordinality i(value,ordinality)
where not exists(select 1 from public.zelo_order_items oi where oi.order_id=o.id);

-- Linked online pedidos are references on the already migrated chat order. Unlinked online pedidos become canonical records.
update public.zelo_orders o set legacy_pedido_id=p.id
from public.pedidos p where p.zelochat_order_id=o.legacy_zelochat_order_id and o.legacy_pedido_id is null;
insert into public.zelo_orders(empresa_id,source,status,zelomenu_session_id,legacy_pedido_id,customer,fulfillment,payment,
 subtotal,total,observations,created_at,updated_at)
select ep.id,'legacy_pedido',case p.status when 'aberto' then 'pending_review' when 'pronto' then 'ready' when 'fechado' then 'delivered' else 'pending_review' end,
 p.zelomenu_session_id,p.id,jsonb_build_object('name',coalesce(p.nome_cliente,'Cliente')),'{}','{}',
 coalesce((select sum(pi.subtotal) from public.pedido_itens pi where pi.id_pedido=p.id),0),
 coalesce((select sum(pi.subtotal) from public.pedido_itens pi where pi.id_pedido=p.id),0),p.observacoes,p.criado_em,p.criado_em
from public.pedidos p join public.empresa_perfil ep on ep.user_id=p.id_usuario
where p.origem in ('zelomenu','zelochat') and p.zelochat_order_id is null
on conflict (legacy_pedido_id) where legacy_pedido_id is not null do nothing;
insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,position)
select o.id,pi.id_produto,pi.nome,pi.preco_unitario,pi.quantidade,pi.subtotal,
 row_number() over(partition by pi.id_pedido order by pi.id)::integer-1
from public.zelo_orders o join public.pedido_itens pi on pi.id_pedido=o.legacy_pedido_id
where not exists(select 1 from public.zelo_order_items oi where oi.order_id=o.id);

insert into public.zelo_order_events(order_id,empresa_id,event_type,to_status,detail,created_at)
select o.id,o.empresa_id,'legacy_imported',o.status,jsonb_build_object('legacyZelochatOrderId',o.legacy_zelochat_order_id,'legacyPedidoId',o.legacy_pedido_id),o.created_at
from public.zelo_orders o where (o.legacy_zelochat_order_id is not null or o.legacy_pedido_id is not null)
and not exists(select 1 from public.zelo_order_events e where e.order_id=o.id and e.event_type='legacy_imported');

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='zelo_orders') then
   alter publication supabase_realtime add table public.zelo_orders;
 end if;
end $$;

commit;
