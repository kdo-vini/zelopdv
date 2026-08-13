-- Additive, rollback-friendly ZeloMenu checkout hardening.
alter table public.zelomenu_cart_tokens
  add column if not exists expires_at timestamptz;
update public.zelomenu_cart_tokens
set expires_at = created_at + interval '24 hours'
where expires_at is null;
alter table public.zelomenu_cart_tokens alter column expires_at set default (now() + interval '24 hours');
alter table public.pedidos add column if not exists zelomenu_session_id uuid;
alter table public.zelochat_orders add column if not exists zelomenu_session_id uuid;
create unique index if not exists pedidos_zelomenu_session_uidx
  on public.pedidos (zelomenu_session_id) where zelomenu_session_id is not null;
create unique index if not exists zelochat_orders_zelomenu_session_uidx
  on public.zelochat_orders (zelomenu_session_id) where zelomenu_session_id is not null;
create table if not exists public.zelomenu_table_capabilities (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  comanda_id uuid not null,
  mesa_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists zelomenu_table_capabilities_one_active
  on public.zelomenu_table_capabilities(comanda_id) where revoked_at is null;
alter table public.zelomenu_cart_sessions add column if not exists capability_id uuid
  references public.zelomenu_table_capabilities(id);
create or replace function public.issue_table_capability(
  p_empresa_id uuid, p_comanda_id uuid, p_mesa_id uuid, p_token_hash text,
  p_expires_at timestamptz default (now() + interval '12 hours')
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update zelomenu_table_capabilities set revoked_at = now()
   where comanda_id = p_comanda_id and revoked_at is null;
  insert into zelomenu_table_capabilities(empresa_id, comanda_id, mesa_id, token_hash, expires_at)
  values (p_empresa_id, p_comanda_id, p_mesa_id, p_token_hash, p_expires_at)
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.revoke_table_capability(p_comanda_id uuid)
returns void language sql security definer set search_path = public as $$
  update zelomenu_table_capabilities set revoked_at = coalesce(revoked_at, now())
  where comanda_id = p_comanda_id and revoked_at is null
$$;
-- CAS is kept in PostgreSQL so a stale PATCH cannot overwrite a newer draft.
create or replace function public.update_zelomenu_cart(
  p_session_id uuid, p_token_hash text, p_expected_revision integer,
  p_customer jsonb, p_cart jsonb, p_fulfillment jsonb, p_pricing jsonb, p_payment jsonb
) returns public.zelomenu_cart_sessions
language plpgsql security definer set search_path = public as $$
declare v_row zelomenu_cart_sessions;
begin
  update zelomenu_cart_sessions
     set customer_snapshot=p_customer, cart_snapshot=p_cart,
         fulfillment_snapshot=p_fulfillment, pricing_snapshot=p_pricing,
         payment_snapshot=p_payment, revision=revision+1,
         last_revalidated_at=null, last_revalidation=null, updated_at=now()
   where id=p_session_id and revision=p_expected_revision and state='cart_open'
     and current_token_hash=p_token_hash
  returning * into v_row;
  if not found then raise exception using errcode='ZL409', message='REVISION_CONFLICT'; end if;
  return v_row;
end $$;
-- Locks the session, validates token/revision/capability, aggregates stock and
-- materializes exactly one public order in the same database transaction.
create or replace function public.confirm_zelomenu_cart(
  p_session_id uuid, p_token_hash text, p_expected_revision integer,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s zelomenu_cart_sessions;
  v_order_id uuid;
  v_state text;
  item record;
  v_user_id uuid;
  v_numero integer;
begin
  select * into s from zelomenu_cart_sessions where id=p_session_id for update;
  if not found then raise exception using errcode='ZL404', message='CART_NOT_FOUND'; end if;
  if s.current_token_hash is distinct from p_token_hash then
    raise exception using errcode='ZL410', message='STALE_CART_TOKEN';
  end if;
  if s.revision <> p_expected_revision then
    raise exception using errcode='ZL409', message='REVISION_CONFLICT';
  end if;

  if s.context = 'table_order' then
    select p.id into v_order_id from pedidos p where p.zelomenu_session_id=s.id;
  else
    select o.id into v_order_id from zelochat_orders o where o.zelomenu_session_id=s.id;
  end if;
  if v_order_id is not null then
    return jsonb_build_object('orderId',v_order_id,'state',s.state,'alreadyConfirmed',true);
  end if;
  if s.state <> 'cart_open' then raise exception using errcode='ZL409', message='CART_ALREADY_CLOSED'; end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception using errcode='ZL400', message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if s.context='table_order' then
    perform 1 from comandas c join mesas m on m.id=c.id_mesa
     where c.id=(s.metadata->>'comanda_id')::uuid and c.id_mesa=(s.metadata->>'mesa_id')::uuid
       and c.status='aberta' and m.ativa=true for update of c;
    if not found then raise exception using errcode='ZL409', message='COMANDA_CLOSED'; end if;
    -- Existing carts remain confirmable during the additive rollout. New carts
    -- must carry a rotating capability and are rejected after revocation.
    if s.capability_id is not null then
      perform 1 from zelomenu_table_capabilities c
       where c.id=s.capability_id and c.comanda_id=(s.metadata->>'comanda_id')::uuid
         and c.mesa_id=(s.metadata->>'mesa_id')::uuid and c.revoked_at is null and c.expires_at>now()
       for update;
      if not found then raise exception using errcode='ZL410', message='TABLE_SESSION_EXPIRED'; end if;
    end if;
  end if;

  for item in
    select (x->>'productId')::bigint product_id, sum((x->>'quantity')::integer) quantity
    from jsonb_array_elements(s.cart_snapshot->'items') x
    group by (x->>'productId')::bigint
  loop
    if item.quantity < 1 or item.quantity > 999 then raise exception using errcode='ZL400', message='INVALID_QUANTITY'; end if;
    update produtos set estoque_atual=estoque_atual-item.quantity
     where id=item.product_id and controlar_estoque=true and estoque_atual>=item.quantity;
    if not found and exists(select 1 from produtos where id=item.product_id and controlar_estoque=true) then
      raise exception using errcode='ZL409', message='PRODUCT_STOCK_EXCEEDED';
    end if;
  end loop;

  v_state := case when coalesce((s.payment_snapshot->>'pixReceiptRequired')::boolean,false)
                    and not coalesce((s.payment_snapshot->>'pixReceiptApproved')::boolean,false)
                  then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end;

  if s.context='public_order' then
    insert into zelochat_orders(empresa_id,customer_name,customer_phone,items,pickup_date,pickup_time,
      payment_method,delivery_address,delivery_neighborhood,delivery_fee,observations,status,total,source,zelomenu_session_id)
    values(s.empresa_id,coalesce(s.customer_snapshot->>'name','Cliente'),s.customer_snapshot->>'phone',
      (select jsonb_agg(jsonb_build_object('product',x->>'productName','quantity',(x->>'quantity')::integer)) from jsonb_array_elements(s.cart_snapshot->'items') x),
      coalesce(s.fulfillment_snapshot->>'pickupDate',''),coalesce(s.fulfillment_snapshot->>'pickupTime',''),
      s.payment_snapshot->>'declaredMethod',s.fulfillment_snapshot->>'deliveryAddress',s.fulfillment_snapshot->>'deliveryNeighborhood',
      nullif(s.fulfillment_snapshot->>'deliveryFee','')::numeric,s.cart_snapshot->>'observations','pending',
      (s.pricing_snapshot->>'total')::numeric,'zelomenu',s.id) returning id into v_order_id;
  else
    select user_id into v_user_id from empresa_perfil where id=s.empresa_id;
    if v_user_id is null then raise exception using errcode='ZL409', message='COMANDA_CLOSED'; end if;
    select proximo_numero_pedido(v_user_id) into v_numero;
    insert into pedidos(id_usuario,origem,id_comanda,status,nome_cliente,observacoes,numero_pedido,zelomenu_session_id)
    values(v_user_id,'zelomenu',(s.metadata->>'comanda_id')::uuid,'aberto',s.customer_snapshot->>'name',
      s.cart_snapshot->>'observations',v_numero,s.id) returning id into v_order_id;
    insert into pedido_itens(id_pedido,id_produto,nome,preco_unitario,quantidade,subtotal,enviado_cozinha,status_cozinha)
    select v_order_id,(x->>'productId')::bigint,x->>'productName',(x->>'unitPrice')::numeric,
      (x->>'quantity')::integer,(x->>'lineTotal')::numeric,true,'aguardando'
    from jsonb_array_elements(s.cart_snapshot->'items') x;
  end if;

  update zelomenu_cart_sessions set state=v_state, confirmed_at=now(), updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('productionOrderId',v_order_id,'idempotencyKey',p_idempotency_key)
   where id=s.id;
  return jsonb_build_object('orderId',v_order_id,'state',v_state,'alreadyConfirmed',false);
end $$;
revoke all on function public.update_zelomenu_cart(uuid,text,integer,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.confirm_zelomenu_cart(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.update_zelomenu_cart(uuid,text,integer,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.confirm_zelomenu_cart(uuid,text,integer,text) to service_role;
grant execute on function public.issue_table_capability(uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.revoke_table_capability(uuid) to service_role;
