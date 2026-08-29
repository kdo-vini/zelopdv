-- WhatsApp-originated carts must converge on the canonical order aggregate.
-- This is forward-only: public and table cart contracts remain unchanged.
begin;

do $$
begin
  if to_regclass('public.zelo_orders') is null
     or to_regclass('public.zelomenu_cart_sessions') is null
     or to_regclass('public.zelochat_customer_relationships') is null then
    raise exception 'PRECONDITION_FAILED: WhatsApp ordering dependencies are missing';
  end if;
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb,uuid)') is null then
    raise exception 'PRECONDITION_FAILED: current create_zelo_order signature is missing';
  end if;
end
$$;

-- Per-customer ordering preferences are relationship metadata. They do not
-- duplicate an order or a cart and stay server-only with the CRM relationship.
alter table public.zelochat_customer_relationships
  add column if not exists ordering_overrides jsonb not null default '{}'::jsonb;

alter table public.zelochat_customer_relationships
  drop constraint if exists zelochat_customer_relationships_ordering_overrides_object_check;
alter table public.zelochat_customer_relationships
  add constraint zelochat_customer_relationships_ordering_overrides_object_check
  check (jsonb_typeof(ordering_overrides) = 'object');

comment on column public.zelochat_customer_relationships.ordering_overrides is
  'Preferências estruturadas de pedido por cliente; metadados server-only, sem duplicar carrinho ou pedido.';

revoke all on table public.zelochat_customer_relationships from public, anon, authenticated;
grant all on table public.zelochat_customer_relationships to service_role;

-- State the complete, closed set explicitly so this migration remains safe on
-- databases whose older cart constraint did not yet contain whatsapp_order.
alter table public.zelomenu_cart_sessions
  drop constraint if exists zelomenu_cart_sessions_context_check;
alter table public.zelomenu_cart_sessions
  add constraint zelomenu_cart_sessions_context_check
  check (context = any (array['whatsapp_order'::text, 'public_order'::text, 'table_order'::text]));

-- The legacy predicate treated every non-archived cart as active. Confirmation
-- intentionally leaves the cart history unarchived, so that predicate would
-- block the next WhatsApp cart after a successful order. Preserve the exact
-- historical behavior for public/table contexts and use state for WhatsApp.
drop index if exists public.zelomenu_cart_sessions_active_source_ref_key;
create unique index if not exists zelomenu_cart_sessions_active_non_whatsapp_source_ref_key
  on public.zelomenu_cart_sessions (empresa_id, context, source_ref)
  where context in ('public_order', 'table_order') and archived_at is null;

comment on index public.zelomenu_cart_sessions_active_non_whatsapp_source_ref_key is
  'Preserva a unicidade histórica de sessões não arquivadas para public_order e table_order.';

alter table public.zelo_orders
  drop constraint if exists zelo_orders_source_check;
alter table public.zelo_orders
  add constraint zelo_orders_source_check
  check (source = any (array['zelomenu'::text, 'zelochat'::text, 'whatsapp'::text, 'manual'::text, 'legacy_zelochat'::text, 'legacy_pedido'::text, 'mesa'::text]));

comment on column public.zelo_orders.source is
  'Origem canônica do pedido; whatsapp é materializado exclusivamente pelo contexto de carrinho whatsapp_order.';

-- Preserve order history. Only older *open* WhatsApp carts for the same
-- conversation are archived; the most recently touched session stays usable.
with ranked_open_whatsapp_carts as (
  select id,
         row_number() over (
           partition by empresa_id, source_ref
           order by updated_at desc, created_at desc, id desc
         ) as recency_rank
    from public.zelomenu_cart_sessions
   where context = 'whatsapp_order'
     and state = 'cart_open'
)
update public.zelomenu_cart_sessions cart
   set state = 'archived',
       archived_at = coalesce(cart.archived_at, now()),
       updated_at = now(),
       metadata = coalesce(cart.metadata, '{}'::jsonb)
         || jsonb_build_object('archiveReason', 'superseded_open_whatsapp_cart')
  from ranked_open_whatsapp_carts ranked
 where cart.id = ranked.id
   and ranked.recency_rank > 1;

create unique index if not exists zelochat_cart_sessions_one_open_whatsapp_order_per_conversation
  on public.zelomenu_cart_sessions (empresa_id, source_ref)
  where context = 'whatsapp_order' and state = 'cart_open';

comment on index public.zelochat_cart_sessions_one_open_whatsapp_order_per_conversation is
  'Impede mais de um carrinho whatsapp_order aberto por empresa e conversa (source_ref = remote_jid).';

-- Keep the current five-argument signature, including the optional CRM link.
-- Cart snapshots remain authoritative; only the cart context chooses its source.
create or replace function public.create_zelo_order(
  p_session_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_snapshots jsonb,
  p_pessoa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception using errcode = 'ZL400', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if p_session_id is not null then
    select * into s
      from public.zelomenu_cart_sessions
     where id = p_session_id
     for update;
    if not found then
      raise exception using errcode = 'ZL404', message = 'CART_NOT_FOUND';
    end if;
    if s.revision <> p_expected_revision then
      raise exception using errcode = 'ZL409', message = 'REVISION_CONFLICT';
    end if;
    if s.context not in ('whatsapp_order', 'public_order', 'table_order') then
      raise exception using errcode = 'ZL400', message = 'TABLE_ORDER_NOT_CANONICAL';
    end if;

    v_empresa := s.empresa_id;
    v_source := case
      when s.context = 'whatsapp_order' then 'whatsapp'
      when s.context = 'table_order' then 'mesa'
      else 'zelomenu'
    end;
    v_stock_already_committed := false;
    p_snapshots := jsonb_build_object(
      'customer', coalesce(s.customer_snapshot, '{}'::jsonb),
      'fulfillment', coalesce(s.fulfillment_snapshot, '{}'::jsonb) || case
        when s.context = 'table_order' then jsonb_build_object(
          'type', 'mesa',
          'mesaId', s.metadata->>'mesa_id',
          'comandaId', s.metadata->>'comanda_id'
        )
        else '{}'::jsonb
      end,
      'payment', coalesce(s.payment_snapshot, '{}'::jsonb),
      'pricing', coalesce(s.pricing_snapshot, '{}'::jsonb),
      'cart', coalesce(s.cart_snapshot, '{}'::jsonb),
      'source', v_source
    );

    if s.context = 'table_order' then
      perform 1
        from public.comandas c
        join public.mesas m on m.id = c.id_mesa
       where c.id = (s.metadata->>'comanda_id')::uuid
         and c.id_mesa = (s.metadata->>'mesa_id')::uuid
         and c.id_usuario = (select ep.user_id from public.empresa_perfil ep where ep.id = s.empresa_id)
         and c.status = 'aberta'
         and m.ativa = true
       for update of c;
      if not found then
        raise exception using errcode = 'ZL409', message = 'COMANDA_CLOSED';
      end if;

      if s.capability_id is not null then
        perform 1
          from public.zelomenu_table_capabilities c
         where c.id = s.capability_id
           and c.comanda_id = (s.metadata->>'comanda_id')::uuid
           and c.mesa_id = (s.metadata->>'mesa_id')::uuid
           and c.revoked_at is null
           and c.expires_at > now()
         for update;
        if not found then
          raise exception using errcode = 'ZL410', message = 'TABLE_SESSION_EXPIRED';
        end if;
      end if;
    end if;
  else
    v_empresa := nullif(p_snapshots->>'empresaId', '')::uuid;
    v_source := coalesce(nullif(p_snapshots->>'source', ''), 'manual');
    if v_source = 'whatsapp' then
      raise exception using errcode = 'ZL400', message = 'WHATSAPP_ORDER_SESSION_REQUIRED';
    end if;
    v_stock_already_committed := v_source = 'mesa'
      and nullif(p_snapshots#>>'{fulfillment,comandaItemId}', '') is not null;
  end if;

  if v_empresa is null then
    raise exception using errcode = 'ZL400', message = 'EMPRESA_REQUIRED';
  end if;
  if v_source not in ('zelomenu', 'zelochat', 'whatsapp', 'manual', 'legacy_zelochat', 'legacy_pedido', 'mesa') then
    raise exception using errcode = 'ZL400', message = 'INVALID_ORDER_SOURCE';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1
      from public.pessoas p
      join public.empresa_perfil ep on ep.id = v_empresa
     where p.id = p_pessoa_id
       and p.id_usuario = ep.user_id
  ) then
    raise exception using errcode = 'ZL404', message = 'CUSTOMER_NOT_FOUND';
  end if;

  select * into o
    from public.zelo_orders
   where zelomenu_session_id = p_session_id
      or (empresa_id = v_empresa and idempotency_key = p_idempotency_key)
   order by created_at
   limit 1
   for update;
  if found then
    return jsonb_build_object(
      'orderId', o.id,
      'orderStatus', o.status,
      'sessionState', case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed', true,
      'revision', o.revision
    );
  end if;

  if p_session_id is not null and s.state <> 'cart_open' then
    raise exception using errcode = 'ZL409', message = 'CART_ALREADY_CLOSED';
  end if;
  if jsonb_typeof(p_snapshots#>'{cart,items}') <> 'array'
     or jsonb_array_length(p_snapshots#>'{cart,items}') not between 1 and 50 then
    raise exception using errcode = 'ZL400', message = 'INVALID_ITEMS';
  end if;

  v_subtotal := coalesce((p_snapshots#>>'{pricing,subtotal}')::numeric, 0);
  v_fee := coalesce((p_snapshots#>>'{pricing,deliveryFee}')::numeric, 0);
  v_discount := coalesce((p_snapshots#>>'{pricing,discount}')::numeric, 0);
  v_total := v_subtotal + v_fee - v_discount;
  if v_total < 0 or v_total > 1000000 then
    raise exception using errcode = 'ZL400', message = 'INVALID_TOTAL';
  end if;

  insert into public.zelo_orders(
    empresa_id, source, status, zelomenu_session_id, idempotency_key, pessoa_id,
    customer, fulfillment, payment, subtotal, delivery_fee, discount, total,
    observations, stock_committed_at
  ) values (
    v_empresa, v_source,
    case when coalesce((p_snapshots#>>'{payment,pixReceiptRequired}')::boolean, false)
              and not coalesce((p_snapshots#>>'{payment,pixReceiptApproved}')::boolean, false)
         then 'pending_payment' else 'pending_review' end,
    p_session_id, p_idempotency_key, p_pessoa_id,
    coalesce(p_snapshots->'customer', '{}'::jsonb),
    coalesce(p_snapshots->'fulfillment', '{}'::jsonb),
    coalesce(p_snapshots->'payment', '{}'::jsonb),
    v_subtotal, v_fee, v_discount, v_total,
    p_snapshots#>>'{cart,observations}',
    case when v_stock_already_committed then now() else null end
  ) returning * into o;

  for v_item in select value from jsonb_array_elements(p_snapshots#>'{cart,items}') loop
    if coalesce((v_item->>'quantity')::integer, 0) not between 1 and 999 then
      raise exception using errcode = 'ZL400', message = 'INVALID_QUANTITY';
    end if;
    if nullif(v_item->>'productId', '') is not null and not exists (
      select 1
        from public.produtos p
        join public.empresa_perfil ep on ep.id = v_empresa and ep.user_id = p.id_usuario
       where p.id = (v_item->>'productId')::bigint
    ) then
      raise exception using errcode = 'ZL404', message = 'PRODUCT_NOT_FOUND';
    end if;
    insert into public.zelo_order_items(
      order_id, product_id, name, unit_price, quantity, subtotal, modifiers, position
    ) values (
      o.id,
      nullif(v_item->>'productId', '')::bigint,
      coalesce(nullif(v_item->>'productName', ''), 'Produto'),
      coalesce((v_item->>'unitPrice')::numeric, 0),
      (v_item->>'quantity')::integer,
      coalesce((v_item->>'lineTotal')::numeric, (v_item->>'unitPrice')::numeric * (v_item->>'quantity')::integer),
      coalesce(v_item->'selectedModifiers', v_item->'modifiers', '[]'),
      coalesce((v_item->>'position')::integer, 0)
    );
  end loop;

  if (select coalesce(sum(subtotal), 0) from public.zelo_order_items where order_id = o.id) <> v_subtotal then
    raise exception using errcode = 'ZL400', message = 'TOTAL_MISMATCH';
  end if;

  insert into public.zelo_order_events(order_id, empresa_id, event_type, to_status, detail)
    values (o.id, o.empresa_id, 'created', o.status, jsonb_build_object('source', o.source));
  insert into public.zelo_order_outbox(order_id, empresa_id, topic, payload, idempotency_key)
    values (o.id, o.empresa_id, 'order.created', public.zelo_order_result(o), 'order.created:' || o.id);

  if p_session_id is not null then
    update public.zelomenu_cart_sessions
       set state = case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
           confirmed_at = coalesce(confirmed_at, now()),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb)
             || jsonb_build_object('canonicalOrderId', o.id, 'idempotencyKey', p_idempotency_key)
     where id = p_session_id;
  end if;

  return jsonb_build_object(
    'orderId', o.id,
    'orderStatus', o.status,
    'sessionState', case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed', false,
    'revision', o.revision
  );
exception when unique_violation then
  select * into o
    from public.zelo_orders
   where zelomenu_session_id = p_session_id
      or (empresa_id = v_empresa and idempotency_key = p_idempotency_key)
   order by created_at
   limit 1;
  if found then
    return jsonb_build_object(
      'orderId', o.id,
      'orderStatus', o.status,
      'sessionState', case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed', true,
      'revision', o.revision
    );
  end if;
  raise;
end
$$;

comment on function public.create_zelo_order(uuid, integer, text, jsonb, uuid) is
  'Cria pedidos canônicos a partir de carrinhos ou snapshots server-side; whatsapp_order materializa source=whatsapp.';

revoke all on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)
  to service_role;

commit;
