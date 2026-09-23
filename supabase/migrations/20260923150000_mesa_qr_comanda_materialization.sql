-- Keep QR table orders attached to the comanda that will be charged.
alter table public.zelo_order_items
  add column if not exists mesa_observacao text;

alter table public.comanda_itens
  add column if not exists zelo_order_item_id uuid
    references public.zelo_order_items(id) on delete restrict;

create unique index if not exists comanda_itens_zelo_order_item_id_key
  on public.comanda_itens (zelo_order_item_id)
  where zelo_order_item_id is not null;

create or replace function public.capture_mesa_qr_item_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_session uuid;
  item_position bigint;
begin
  select o.zelomenu_session_id, count(oi.id)
    into order_session, item_position
    from public.zelo_orders o
    left join public.zelo_order_items oi on oi.order_id = o.id
   where o.id = new.order_id
   group by o.zelomenu_session_id;

  if order_session is null then
    return new;
  end if;

  select nullif(btrim(line.item->>'notes'), '')
    into new.mesa_observacao
    from public.zelomenu_cart_sessions s,
         jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb))
           with ordinality as line(item, position)
   where s.id = order_session
   order by line.position
   offset item_position
   limit 1;

  return new;
end;
$$;

drop trigger if exists capture_mesa_qr_item_observation on public.zelo_order_items;
create trigger capture_mesa_qr_item_observation
before insert on public.zelo_order_items
for each row execute function public.capture_mesa_qr_item_observation();

create or replace function public.sync_mesa_qr_order_to_comanda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_id uuid;
  table_status text;
begin
  if new.source <> 'mesa' or new.zelomenu_session_id is null or new.status = old.status then
    return new;
  end if;

  table_id := nullif(new.fulfillment->>'comandaId', '')::uuid;
  if table_id is null then
    raise exception 'MESA_QR_COMANDA_REQUIRED';
  end if;

  if new.status = 'accepted' then
    select c.status into table_status
      from public.comandas c
     where c.id = table_id
       and c.id_usuario = (select ep.user_id from public.empresa_perfil ep where ep.id = new.empresa_id);

    if table_status is distinct from 'aberta' then
      raise exception 'MESA_QR_COMANDA_CLOSED';
    end if;

    insert into public.comanda_itens (
      id_comanda, id_produto, quantidade, preco_unitario, observacao,
      estoque_baixado, modifiers, nome_produto_na_venda, pizza, zelo_order_item_id
    )
    select table_id, oi.product_id::integer, oi.quantity, oi.unit_price,
           oi.mesa_observacao, true, oi.modifiers, oi.name, oi.pizza, oi.id
      from public.zelo_order_items oi
     where oi.order_id = new.id
    on conflict (zelo_order_item_id) where zelo_order_item_id is not null do nothing;

    if not exists (select 1 from public.comanda_itens ci where ci.zelo_order_item_id in (
      select oi.id from public.zelo_order_items oi where oi.order_id = new.id
    )) then
      raise exception 'MESA_QR_ITEMS_NOT_MATERIALIZED';
    end if;
  elsif new.status = 'cancelled' and old.status in ('accepted', 'preparing', 'ready') then
    if exists (
      select 1
        from public.comanda_itens ci
        join public.comanda_pagamento_itens cpi on cpi.id_comanda_item = ci.id
       where ci.zelo_order_item_id in (
         select oi.id from public.zelo_order_items oi where oi.order_id = new.id
       )
    ) then
      raise exception 'MESA_QR_ITEM_HAS_PAYMENT_ALLOCATION';
    end if;

    delete from public.comanda_itens
     where zelo_order_item_id in (
       select oi.id from public.zelo_order_items oi where oi.order_id = new.id
     );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_mesa_qr_order_to_comanda on public.zelo_orders;
create trigger sync_mesa_qr_order_to_comanda
after update of status on public.zelo_orders
for each row execute function public.sync_mesa_qr_order_to_comanda();

create or replace function public.guard_mesa_qr_comanda_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'aberta' and new.status in ('fechada', 'cancelada') then
    if exists (
      select 1
        from public.zelo_orders o
       where o.source = 'mesa'
         and o.zelomenu_session_id is not null
         and o.fulfillment->>'comandaId' = old.id::text
         and (
           (new.status = 'fechada' and o.status in ('pending_payment', 'pending_review'))
           or (new.status = 'cancelada' and o.status in ('pending_payment', 'pending_review', 'accepted', 'preparing', 'ready', 'out_for_delivery'))
         )
    ) then
      raise exception 'MESA_QR_ORDER_NOT_READY';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_mesa_qr_comanda_status on public.comandas;
create trigger guard_mesa_qr_comanda_status
before update of status on public.comandas
for each row execute function public.guard_mesa_qr_comanda_status();

create or replace function public.guard_linked_mesa_qr_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_status text;
begin
  if old.zelo_order_item_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'MESA_QR_ITEM_READ_ONLY';
  end if;

  select o.status into canonical_status
    from public.zelo_order_items oi
    join public.zelo_orders o on o.id = oi.order_id
   where oi.id = old.zelo_order_item_id;

  if canonical_status <> 'cancelled' then
    raise exception 'MESA_QR_ITEM_READ_ONLY';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_linked_mesa_qr_item on public.comanda_itens;
create trigger guard_linked_mesa_qr_item
before update or delete on public.comanda_itens
for each row execute function public.guard_linked_mesa_qr_item();

revoke all on function public.capture_mesa_qr_item_observation() from public, anon, authenticated;
revoke all on function public.sync_mesa_qr_order_to_comanda() from public, anon, authenticated;
revoke all on function public.guard_mesa_qr_comanda_status() from public, anon, authenticated;
revoke all on function public.guard_linked_mesa_qr_item() from public, anon, authenticated;

-- Manual items must not merge into QR lines, which are already stock-committed
-- by transition_zelo_order and must retain their per-product observations.
do $$
declare
  definition text;
  old_clause text := 'and pizza is not distinct from v_pizza';
  new_clause text := old_clause || E'\n     and zelo_order_item_id is null';
begin
  select pg_get_functiondef('public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb)'::regprocedure)
    into definition;
  if position(old_clause in definition) = 0 then
    raise exception 'Could not isolate public.comanda_aplicar_delta_item item lookup';
  end if;
  execute replace(definition, old_clause, new_clause);

  select pg_get_functiondef('offline_internal.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb,uuid,text)'::regprocedure)
    into definition;
  old_clause := 'and pizza is not distinct from v_pizza and (p_local_item_id is null or id=p_local_item_id)';
  new_clause := 'and pizza is not distinct from v_pizza and zelo_order_item_id is null and (p_local_item_id is null or id=p_local_item_id)';
  if position(old_clause in definition) = 0 then
    raise exception 'Could not isolate offline_internal.comanda_aplicar_delta_item item lookup';
  end if;
  execute replace(definition, old_clause, new_clause);
end;
$$;
