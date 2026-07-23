-- Record canonical online orders in the financial reports when they are delivered.
--
-- ZeloChat and ZeloPDV can both transition a canonical order. The old financial
-- close path only created `vendas` when the PDV called close_zelo_order, so a
-- delivery completed from another surface could end with `sale_id` null.
-- Keep the sale creation at the shared database boundary: it is atomic with the
-- delivery transition and uses the company's caixa that covered the sale time.

begin;

create or replace function public.ensure_zelo_order_sale(
  p_order_id uuid,
  p_sale_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.zelo_orders;
  v_owner uuid;
  v_caixa_id integer;
  v_sale_id bigint;
  v_client_sale_id text;
  v_payment_method text;
  v_forma_pagamento text;
  v_tipo_pedido text;
  v_sale_at timestamptz;
begin
  select * into v_order
  from public.zelo_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'ZL404', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.sale_id is not null then
    return v_order.sale_id;
  end if;

  select ep.user_id into v_owner
  from public.empresa_perfil ep
  where ep.id = v_order.empresa_id;

  if v_owner is null then
    raise exception using errcode = 'ZL404', message = 'ORDER_OWNER_NOT_FOUND';
  end if;

  v_sale_at := coalesce(p_sale_at, v_order.closed_at, v_order.updated_at, now());
  v_client_sale_id := 'zelo-order:' || v_order.id;

  -- Protect retries and repair runs from creating a second financial sale.
  select v.id into v_sale_id
  from public.vendas v
  where v.id_usuario = v_owner
    and v.client_sale_id = v_client_sale_id
  limit 1;
  if v_sale_id is not null then
    update public.vendas
    set created_at = least(created_at, v_sale_at)
    where id = v_sale_id;
    return v_sale_id;
  end if;

  select c.id into v_caixa_id
  from public.caixas c
  where c.id_usuario = v_owner
    and c.data_abertura <= v_sale_at
    and (c.data_fechamento is null or c.data_fechamento >= v_sale_at)
  order by c.data_abertura desc
  limit 1;

  v_payment_method := lower(trim(coalesce(
    v_order.payment ->> 'declaredMethod',
    v_order.payment ->> 'method',
    ''
  )));
  v_payment_method := translate(v_payment_method, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_forma_pagamento := case
    when v_payment_method in ('pix', 'pix online') then 'pix'
    when v_payment_method in ('dinheiro', 'cash') then 'dinheiro'
    when v_payment_method in ('cartao_debito', 'debito') then 'cartao_debito'
    when v_payment_method in ('cartao_credito', 'credito', 'cartao') then 'cartao_credito'
    when v_payment_method = 'fiado' then 'fiado'
    else coalesce(nullif(v_payment_method, ''), 'outro')
  end;
  v_tipo_pedido := case
    when coalesce(v_order.fulfillment ->> 'mode', v_order.fulfillment ->> 'type') = 'delivery'
      then 'delivery'
    else 'retirada'
  end;

  insert into public.vendas (
    id_usuario,
    id_caixa,
    client_sale_id,
    valor_total,
    forma_pagamento,
    valor_recebido,
    valor_troco,
    valor_desconto,
    tipo_pedido,
    taxa_entrega,
    created_at
  )
  values (
    v_owner,
    v_caixa_id,
    v_client_sale_id,
    coalesce(v_order.total, 0),
    v_forma_pagamento,
    case when v_forma_pagamento = 'dinheiro' then coalesce(v_order.total, 0) else null end,
    0,
    coalesce(v_order.discount, 0),
    v_tipo_pedido,
    coalesce(v_order.delivery_fee, 0),
    v_sale_at
  )
  on conflict (id_usuario, client_sale_id) where client_sale_id is not null do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select v.id into v_sale_id
    from public.vendas v
    where v.id_usuario = v_owner
      and v.client_sale_id = v_client_sale_id
    limit 1;
    return v_sale_id;
  end if;

  insert into public.vendas_itens (
    id_usuario,
    id_venda,
    id_produto,
    quantidade,
    nome_produto_na_venda,
    preco_unitario_na_venda
  )
  select
    v_owner,
    v_sale_id,
    i.product_id,
    i.quantity,
    i.name,
    i.unit_price
  from public.zelo_order_items i
  where i.order_id = v_order.id;

  return v_sale_id;
end;
$$;

revoke all on function public.ensure_zelo_order_sale(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.zelo_order_sale_on_deliver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'delivered'
     and old.status is distinct from 'delivered'
     and new.sale_id is null then
    new.sale_id := public.ensure_zelo_order_sale(new.id, new.closed_at);
  end if;
  return new;
end;
$$;

drop trigger if exists zelo_order_sale_on_deliver on public.zelo_orders;
create trigger zelo_order_sale_on_deliver
before update of status on public.zelo_orders
for each row
when (new.status = 'delivered' and old.status is distinct from 'delivered' and new.sale_id is null)
execute function public.zelo_order_sale_on_deliver();

revoke all on function public.zelo_order_sale_on_deliver() from public, anon, authenticated;

-- Keep historical period reports aligned with the delivery event when a sale
-- was repaired after the order had already been closed.
update public.vendas v
set created_at = least(v.created_at, o.closed_at)
from public.zelo_orders o
where o.sale_id = v.id
  and o.status = 'delivered'
  and o.source = 'zelomenu'
  and o.closed_at is not null;

-- Repair delivered ZeloMenu orders created before this trigger was installed.
do $$
declare
  v_order record;
  v_sale_id bigint;
begin
  for v_order in
    select o.id, o.closed_at
    from public.zelo_orders o
    where o.status = 'delivered'
      and o.sale_id is null
      and o.source = 'zelomenu'
    order by o.created_at
  loop
    v_sale_id := public.ensure_zelo_order_sale(v_order.id, v_order.closed_at);
    update public.zelo_orders
    set sale_id = v_sale_id
    where id = v_order.id
      and sale_id is null;
  end loop;
end;
$$;

commit;
