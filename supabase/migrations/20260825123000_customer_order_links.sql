-- Customer links for canonical orders and CRM-safe person deletion.
-- Forward-only: the already applied order and fiado migrations remain intact.
begin;

do $$
begin
  if to_regclass('public.zelo_orders') is null
     or to_regclass('public.pessoas') is null
     or to_regclass('public.fiado_lancamentos') is null then
    raise exception 'PRECONDITION_FAILED: CRM order dependencies are missing';
  end if;
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb)') is null then
    raise exception 'PRECONDITION_FAILED: legacy create_zelo_order signature is missing';
  end if;
  if to_regprocedure('public.zelo_order_result(public.zelo_orders)') is null then
    raise exception 'PRECONDITION_FAILED: zelo_order_result is missing';
  end if;
  if to_regprocedure('public.fiado_excluir_pessoa(uuid)') is null then
    raise exception 'PRECONDITION_FAILED: fiado_excluir_pessoa is missing';
  end if;
end
$$;

-- The customer snapshot is an immutable checkout boundary. It remains required
-- even when a canonical pessoa link is present, so historical orders retain
-- the name/phone/address used at checkout.
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'zelomenu_cart_sessions'
       and column_name = 'customer_snapshot'
       and is_nullable = 'NO'
  ) then
    raise exception 'PRECONDITION_FAILED: customer_snapshot must remain NOT NULL';
  end if;
end
$$;

alter table public.zelo_orders
  add column if not exists pessoa_id uuid
  references public.pessoas(id) on delete set null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.zelo_orders'::regclass
       and conname = 'zelo_orders_pessoa_id_fkey'
  ) then
    alter table public.zelo_orders
      add constraint zelo_orders_pessoa_id_fkey
      foreign key (pessoa_id) references public.pessoas(id) on delete set null;
  end if;
end
$$;

create index if not exists zelo_orders_empresa_pessoa_created_idx
  on public.zelo_orders (empresa_id, pessoa_id, created_at desc);

-- Keep the financial ledger when a zero-balance person is removed. The person
-- link is historical metadata, not a reason to erase a financial event.
alter table public.fiado_lancamentos
  alter column id_pessoa drop not null;
alter table public.fiado_lancamentos
  drop constraint if exists fiado_lancamentos_id_pessoa_fkey;
alter table public.fiado_lancamentos
  add constraint fiado_lancamentos_id_pessoa_fkey
  foreign key (id_pessoa) references public.pessoas(id) on delete set null;

-- Canonical creation with the current table-order behavior plus an optional
-- CRM link. The four-argument overload below remains for existing callers.
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
    if s.context not in ('public_order', 'table_order') then
      raise exception using errcode = 'ZL400', message = 'TABLE_ORDER_NOT_CANONICAL';
    end if;

    v_empresa := s.empresa_id;
    v_source := case when s.context = 'table_order' then 'mesa' else 'zelomenu' end;
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
    v_stock_already_committed := v_source = 'mesa'
      and nullif(p_snapshots#>>'{fulfillment,comandaItemId}', '') is not null;
  end if;

  if v_empresa is null then
    raise exception using errcode = 'ZL400', message = 'EMPRESA_REQUIRED';
  end if;
  if v_source not in ('zelomenu', 'zelochat', 'manual', 'legacy_zelochat', 'legacy_pedido', 'mesa') then
    raise exception using errcode = 'ZL400', message = 'INVALID_ORDER_SOURCE';
  end if;

  -- A CRM link is accepted only for this company's owner. The canonical
  -- snapshot is deliberately retained separately from this live relationship.
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
  )
  values (
    v_empresa,
    v_source,
    case when coalesce((p_snapshots#>>'{payment,pixReceiptRequired}')::boolean, false)
              and not coalesce((p_snapshots#>>'{payment,pixReceiptApproved}')::boolean, false)
         then 'pending_payment' else 'pending_review' end,
    p_session_id,
    p_idempotency_key,
    p_pessoa_id,
    coalesce(p_snapshots->'customer', '{}'::jsonb),
    coalesce(p_snapshots->'fulfillment', '{}'::jsonb),
    coalesce(p_snapshots->'payment', '{}'::jsonb),
    v_subtotal,
    v_fee,
    v_discount,
    v_total,
    p_snapshots#>>'{cart,observations}',
    case when v_stock_already_committed then now() else null end
  )
  returning * into o;

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
    )
    values (
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

-- Existing server bundles call the original signature. Delegate to the new
-- implementation so the old behavior remains exact and the ACL stays usable.
create or replace function public.create_zelo_order(
  p_session_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_snapshots jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.create_zelo_order($1, $2, $3, $4, null::uuid)
$$;

revoke all on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)
  to service_role;
revoke all on function public.create_zelo_order(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_zelo_order(uuid, integer, text, jsonb)
  to service_role;

-- A deleted person must not erase sales, orders, snapshots or the fiado ledger.
-- Only the live relationship is cleared; all historical amounts remain.
create or replace function public.fiado_excluir_pessoa(p_id_pessoa uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_pessoa public.pessoas%rowtype;
  v_lancamentos_desvinculados integer := 0;
  v_vendas_desvinculadas integer := 0;
  v_pedidos_desvinculados integer := 0;
begin
  if v_actor is null then
    raise exception 'Nao autenticado.' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);
  if not public.fiado_actor_can('pessoas.gerenciar', v_owner) then
    raise exception 'Voce nao tem permissao para excluir pessoas.' using errcode = '42501';
  end if;

  select * into v_pessoa
    from public.pessoas
   where id = p_id_pessoa
     and id_usuario = v_owner
   for update;
  if not found then
    raise exception 'Pessoa nao encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_pessoa.saldo_fiado, 0) <> 0 then
    raise exception 'Nao e possivel excluir uma pessoa com saldo de fiado diferente de zero.' using errcode = '23514';
  end if;

  -- Preserve sales and their totals; only remove the CRM person link.
  update public.vendas
     set id_cliente = null,
         id_pessoa = null
   where id_usuario = v_owner
     and (id_cliente = v_pessoa.id or id_pessoa = v_pessoa.id);
  get diagnostics v_vendas_desvinculadas = row_count;

  -- Preserve canonical orders and their immutable customer snapshots.
  update public.zelo_orders
     set pessoa_id = null
   where empresa_id in (select ep.id from public.empresa_perfil ep where ep.user_id = v_owner)
     and pessoa_id = v_pessoa.id;
  get diagnostics v_pedidos_desvinculados = row_count;

  -- Preserve the financial history while allowing the person row to go away.
  update public.fiado_lancamentos
     set id_pessoa = null
   where id_usuario = v_owner
     and id_pessoa = v_pessoa.id;
  get diagnostics v_lancamentos_desvinculados = row_count;

  delete from public.pessoas
   where id = v_pessoa.id
     and id_usuario = v_owner;

  return jsonb_build_object(
    'excluida', true,
    'pessoa_id', v_pessoa.id,
    -- Kept for callers of the previous RPC response; no financial row is deleted.
    'lancamentos_excluidos', 0,
    'lancamentos_desvinculados', v_lancamentos_desvinculados,
    'vendas_desvinculadas', v_vendas_desvinculadas,
    'pedidos_desvinculados', v_pedidos_desvinculados
  );
end;
$$;

revoke all on function public.fiado_excluir_pessoa(uuid) from public, anon;
grant execute on function public.fiado_excluir_pessoa(uuid) to authenticated, service_role;

commit;
