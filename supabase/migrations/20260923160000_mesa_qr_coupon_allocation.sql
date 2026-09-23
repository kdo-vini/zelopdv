-- A table QR coupon is part of the canonical order total. Allocate it across
-- comanda lines so closing the table charges the same total shown in ZeloMenu.
drop index if exists public.comanda_itens_zelo_order_item_id_key;
create index if not exists comanda_itens_zelo_order_item_id_idx
  on public.comanda_itens (zelo_order_item_id)
  where zelo_order_item_id is not null;

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
    if new.discount > new.subtotal or new.delivery_fee > 0 then
      raise exception 'MESA_QR_PRICING_NOT_SUPPORTED';
    end if;

    select c.status into table_status
      from public.comandas c
     where c.id = table_id
       and c.id_usuario = (select ep.user_id from public.empresa_perfil ep where ep.id = new.empresa_id);

    if table_status is distinct from 'aberta' then
      raise exception 'MESA_QR_COMANDA_CLOSED';
    end if;

    with numbered_items as (
      select oi.*,
             row_number() over (order by oi.position, oi.created_at, oi.id) as item_number,
             count(*) over () as item_count,
             case when new.subtotal > 0
               then trunc(new.discount * oi.subtotal / new.subtotal, 2)
               else 0 end as proportional_discount
        from public.zelo_order_items oi
       where oi.order_id = new.id
    ),
    allocated_items as (
      select numbered_items.*,
             case when item_number = item_count then
               new.discount - coalesce(sum(proportional_discount) over (
                 order by item_number rows between unbounded preceding and 1 preceding
               ), 0)
               else proportional_discount
             end as item_discount
        from numbered_items
    ),
    unit_prices as (
      select allocated_items.*,
             greatest(0, round((subtotal - item_discount) * 100)::integer) as net_cents,
             greatest(1, quantity) as safe_quantity
        from allocated_items
    ),
    split_lines as (
      select unit_prices.*,
             (net_cents / safe_quantity)::integer as base_unit_cents,
             mod(net_cents, safe_quantity)::integer as premium_units
        from unit_prices
    ),
    comanda_lines as (
      select id as order_item_id, product_id, name, modifiers, pizza, mesa_observacao,
             premium_units as quantity, (base_unit_cents + 1)::numeric / 100 as unit_price
        from split_lines where premium_units > 0
      union all
      select id, product_id, name, modifiers, pizza, mesa_observacao,
             safe_quantity - premium_units, base_unit_cents::numeric / 100
        from split_lines where safe_quantity > premium_units
    )
    insert into public.comanda_itens (
      id_comanda, id_produto, quantidade, preco_unitario, observacao,
      estoque_baixado, modifiers, nome_produto_na_venda, pizza, zelo_order_item_id
    )
    select table_id, product_id::integer, quantity, unit_price, mesa_observacao,
           true, modifiers, name, pizza, order_item_id
      from comanda_lines;

    if not exists (
      select 1 from public.comanda_itens ci
       where ci.zelo_order_item_id in (
         select oi.id from public.zelo_order_items oi where oi.order_id = new.id
       )
    ) then
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
