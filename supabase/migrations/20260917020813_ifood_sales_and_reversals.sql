-- Materialize iFood sales as public.vendas and support auditable reversal.
--
-- Adds public.vendas.canal_origem (pdv|zelomenu|zelochat|mesa|manual|ifood)
-- with an owner/date/channel index, backfilling historical rows from
-- zelo_orders.sale_id where available (mapping whatsapp/legacy_zelochat to
-- zelochat and legacy_pedido to pdv) and falling back to pdv otherwise --
-- deliberately coarse for rows with no canonical order link (documented
-- simplification, see docs/CURRENT.md Task 14).
--
-- Adds public.vendas_estornos, the auditable reversal ledger: one row per
-- cancellation event (event_id unique), at most one applied row per sale
-- (partial unique index), and pending_review for anything the RPC cannot
-- resolve unambiguously.
--
-- Adds two service-role-only RPCs, hardened the same way as
-- 20260917014734_ifood_product_mapping_stock.sql (security definer,
-- search_path = '', explicit service_role check, generic FORBIDDEN):
--   * materialize_ifood_sale_v1 -- creates exactly one venda for an iFood
--     order once it reaches CONCLUDED/delivered. id_caixa is always null;
--     no Pessoa/fiado is ever created (a payment method that resolves to
--     'fiado' is coerced to 'outro'); items/modifiers copy verbatim from
--     zelo_order_items; every payments.methods[] line becomes its own
--     vendas_pagamentos row so split tender is preserved. Idempotent via
--     the existing client_sale_id = 'zelo-order:'||id unique constraint --
--     calling it twice for the same order is a no-op (outcome
--     'already_exists').
--   * reverse_ifood_sale_v1 -- records a cancellation against an existing
--     venda without ever deleting it. A retried event_id is 'duplicate'; a
--     second distinct cancellation of an already-reversed sale is also
--     'duplicate' (the partial unique index enforces this at the data
--     level, the RPC checks it first for a clean outcome); an order that
--     never reached delivered has no sale to reverse ('no_sale'); anything
--     where the order is not actually cancelled or its total drifted from
--     the venda's snapshotted total (the order snapshot can be overwritten
--     by a later terminal event, see project_ifood_order_event_v1) is
--     'pending_review' instead of 'applied', since the reversal cannot be
--     resolved unambiguously from this event alone.
--
-- ensure_zelo_order_sale is replaced (forward-only "create or replace", the
-- previously applied body is never edited in place) to branch on
-- v_order.source: for 'ifood' it requires status = 'delivered' and
-- delegates entirely to materialize_ifood_sale_v1 (looked up via
-- ifood_internal.order_refs by zelo_order_id) instead of running the
-- generic caixa/payment/item logic (which would wrongly attach an open
-- caixa). This branch is a repair/consistency tool, the same shape as the
-- legacy "orders delivered without a sale" sweep this function has always
-- supported: it is only guaranteed to see the order's committed data when
-- called standalone against an already-committed row. The
-- zelo_order_sale_on_deliver trigger that also calls this function fires
-- BEFORE the same UPDATE that flips an iFood order to delivered and writes
-- its final total/payment, so a plain re-SELECT from inside that trigger
-- observes the pre-update row (Postgres BEFORE ROW semantics) and this
-- branch harmlessly no-ops (not_delivered) in that path -- it never
-- materializes an incomplete/incorrect sale, it simply defers. The actual
-- materialization for the live event flow is the JS event handler's
-- explicit, best-effort call to materialize_ifood_sale_v1 right after the
-- projection transaction commits (mirroring the Task 12 stock hooks); both
-- paths share the same idempotent implementation, so whichever succeeds
-- first wins and the other is a no-op. For every other source, the payload
-- copy of the payment/tipo_pedido logic is unchanged, only the new
-- canal_origem column is now stamped from the order's own source.
begin;

do $$
begin
  if to_regclass('public.vendas') is null
     or to_regclass('public.zelo_orders') is null
     or to_regclass('public.zelo_order_items') is null
     or to_regclass('ifood_internal.order_refs') is null
     or to_regclass('ifood_internal.connections') is null then
    raise exception 'PRECONDITION_FAILED: iFood sales/reversal dependencies are missing';
  end if;
end
$$;

alter table public.vendas
  add column if not exists canal_origem text;

-- Backfill: prefer the canonical order's own source when the sale is
-- linked through zelo_orders.sale_id; otherwise default to pdv. whatsapp
-- and legacy_zelochat orders are folded into zelochat (same channel, two
-- historical source labels); legacy_pedido predates the online-order
-- engine and is treated as pdv.
update public.vendas as v
set canal_origem = case zo.source
  when 'whatsapp' then 'zelochat'
  when 'legacy_zelochat' then 'zelochat'
  when 'legacy_pedido' then 'pdv'
  else zo.source
end
from public.zelo_orders as zo
where zo.sale_id = v.id
  and v.canal_origem is null;

update public.vendas
set canal_origem = 'pdv'
where canal_origem is null;

alter table public.vendas
  alter column canal_origem set not null;

alter table public.vendas
  drop constraint if exists vendas_canal_origem_check;
alter table public.vendas
  add constraint vendas_canal_origem_check
  check (canal_origem = any (array[
    'pdv'::text, 'zelomenu'::text, 'zelochat'::text,
    'mesa'::text, 'manual'::text, 'ifood'::text
  ]));

create index if not exists idx_vendas_usuario_created_canal
  on public.vendas (id_usuario, created_at, canal_origem);

-- New rows that do not stamp canal_origem explicitly (criar_venda_completa,
-- the direct Mesa-close insert) still get a meaningful value instead of an
-- error: tipo_pedido = 'mesa' maps to 'mesa', everything else defaults to
-- 'pdv'. ensure_zelo_order_sale and materialize_ifood_sale_v1 always stamp
-- their own value explicitly, so this trigger is a no-op for those inserts.
create or replace function public.vendas_default_canal_origem()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.canal_origem is null then
    new.canal_origem := case when new.tipo_pedido = 'mesa' then 'mesa' else 'pdv' end;
  end if;
  return new;
end;
$$;

drop trigger if exists vendas_default_canal_origem on public.vendas;
create trigger vendas_default_canal_origem
  before insert on public.vendas
  for each row
  execute function public.vendas_default_canal_origem();

create table if not exists public.vendas_estornos (
  id bigint generated always as identity primary key,
  id_usuario uuid not null,
  id_venda bigint not null references public.vendas(id) on delete cascade,
  merchant_id text,
  external_order_id text,
  event_id text not null,
  status text not null,
  reason text,
  valor_estornado numeric(12,2),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vendas_estornos_status_check check (status in ('applied', 'pending_review')),
  constraint vendas_estornos_event_id_unique unique (event_id)
);

comment on table public.vendas_estornos is 'Estorno auditavel de vendas materializadas por integracoes (iFood na Task 14): preserva a venda original, nunca a apaga. Um evento (event_id) gera no maximo uma linha; no maximo uma linha applied por venda.';
comment on column public.vendas_estornos.status is 'applied: cancelamento inequivoco, venda preservada. pending_review: ambiguo (pedido nao cancelado ou total divergente da venda), exige revisao manual.';

create unique index if not exists idx_vendas_estornos_applied_per_venda
  on public.vendas_estornos (id_venda)
  where status = 'applied';

create index if not exists idx_vendas_estornos_id_venda
  on public.vendas_estornos (id_venda);
create index if not exists idx_vendas_estornos_id_usuario
  on public.vendas_estornos (id_usuario, created_at);

alter table public.vendas_estornos enable row level security;

revoke all on table public.vendas_estornos from public, anon;
grant select on table public.vendas_estornos to authenticated;
grant select, insert, update, delete on table public.vendas_estornos to service_role;

drop policy if exists vendas_estornos_actor_select on public.vendas_estornos;
create policy vendas_estornos_actor_select
  on public.vendas_estornos
  for select
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('relatorios.ver', id_usuario)
  );

create or replace function public.materialize_ifood_sale_v1(
  p_merchant_id text,
  p_external_order_id text
) returns table (
  outcome text,
  venda_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_order_id text;
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_owner uuid;
  v_client_sale_id text;
  v_declared text;
  v_forma_pagamento text;
  v_venda_id bigint;
  v_tipo_pedido text;
  v_payment_methods jsonb;
  v_method jsonb;
  v_method_id text;
  v_method_valor numeric;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_order_id), '') is null then
    raise exception 'INVALID_SALE_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_order_id := btrim(p_external_order_id);

  select r.* into v_ref
    from ifood_internal.order_refs as r
   where r.merchant_id = v_merchant_id
     and r.external_order_id = v_external_order_id
   for update;

  if not found then
    outcome := 'order_not_found';
    venda_id := null;
    return next;
    return;
  end if;

  select zo.* into v_order
    from public.zelo_orders as zo
   where zo.id = v_ref.zelo_order_id
   for update;

  if not found or v_order.source <> 'ifood' then
    outcome := 'order_not_found';
    venda_id := null;
    return next;
    return;
  end if;

  if v_order.status <> 'delivered' then
    outcome := 'not_delivered';
    venda_id := null;
    return next;
    return;
  end if;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = v_ref.empresa_id;

  if v_owner is null then
    raise exception 'INVALID_SALE_ARGUMENTS';
  end if;

  v_client_sale_id := 'zelo-order:' || v_order.id;

  select v.id into v_venda_id
    from public.vendas as v
   where v.id_usuario = v_owner
     and v.client_sale_id = v_client_sale_id
   limit 1;

  if v_venda_id is not null then
    outcome := 'already_exists';
    venda_id := v_venda_id;
    return next;
    return;
  end if;

  v_declared := lower(btrim(coalesce(v_order.payment ->> 'declaredMethod', v_order.payment ->> 'method', '')));
  v_forma_pagamento := case
    when v_declared = '' then 'outro'
    when v_declared = 'fiado' then 'outro'
    else v_declared
  end;
  v_tipo_pedido := case
    when coalesce(v_order.fulfillment ->> 'mode', v_order.fulfillment ->> 'type') = 'delivery'
      then 'delivery' else 'retirada'
  end;

  insert into public.vendas (
    id_usuario, id_caixa, client_sale_id, valor_total, forma_pagamento,
    valor_recebido, valor_troco, valor_desconto, tipo_pedido, taxa_entrega,
    canal_origem, created_at
  )
  values (
    v_owner, null, v_client_sale_id, coalesce(v_order.total, 0), v_forma_pagamento,
    case when v_forma_pagamento = 'dinheiro' then coalesce(v_order.total, 0) else null end,
    0, coalesce(v_order.discount, 0), v_tipo_pedido, coalesce(v_order.delivery_fee, 0),
    'ifood', coalesce(v_order.closed_at, v_order.updated_at, now())
  )
  on conflict (id_usuario, client_sale_id) where client_sale_id is not null do nothing
  returning id into v_venda_id;

  if v_venda_id is null then
    select v.id into v_venda_id
      from public.vendas as v
     where v.id_usuario = v_owner
       and v.client_sale_id = v_client_sale_id
     limit 1;
    outcome := 'already_exists';
    venda_id := v_venda_id;
    return next;
    return;
  end if;

  insert into public.vendas_itens (
    id_usuario, id_venda, id_produto, quantidade, nome_produto_na_venda,
    preco_unitario_na_venda, modifiers
  )
  select
    v_owner, v_venda_id, i.product_id, i.quantity, i.name, i.unit_price,
    coalesce(i.modifiers, '[]'::jsonb)
  from public.zelo_order_items as i
  where i.order_id = v_order.id
  order by i.position;

  -- Every declared payment method becomes its own split-tender row so a
  -- multi-method iFood order (isSplit = true) is preserved the same way
  -- criar_venda_completa preserves POS split payments. A payment method
  -- that resolves to fiado is coerced to outro -- iFood never creates a
  -- Pessoa or a fiado ledger entry.
  v_payment_methods := coalesce(v_order.payment -> 'methods', '[]'::jsonb);
  if jsonb_typeof(v_payment_methods) = 'array' and jsonb_array_length(v_payment_methods) > 0 then
    for v_method in select value from jsonb_array_elements(v_payment_methods)
    loop
      v_method_valor := coalesce((v_method ->> 'value')::numeric, 0);
      if v_method_valor > 0 then
        v_method_id := lower(btrim(coalesce(v_method ->> 'methodId', '')));
        insert into public.vendas_pagamentos (id_venda, id_usuario, forma_pagamento, valor)
        values (
          v_venda_id, v_owner,
          case
            when v_method_id = '' then 'outro'
            when v_method_id = 'fiado' then 'outro'
            else v_method_id
          end,
          v_method_valor
        );
      end if;
    end loop;
  elsif coalesce(v_order.total, 0) > 0 then
    insert into public.vendas_pagamentos (id_venda, id_usuario, forma_pagamento, valor)
    values (v_venda_id, v_owner, v_forma_pagamento, v_order.total);
  end if;

  outcome := 'materialized';
  venda_id := v_venda_id;
  return next;
end;
$$;

create or replace function public.reverse_ifood_sale_v1(
  p_merchant_id text,
  p_external_order_id text,
  p_event_id text
) returns table (
  outcome text,
  estorno_id bigint,
  venda_id bigint,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_order_id text;
  v_event_id text;
  v_existing_by_event public.vendas_estornos;
  v_existing_applied public.vendas_estornos;
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_owner uuid;
  v_client_sale_id text;
  v_venda public.vendas;
  v_status text;
  v_reason text;
  v_estorno_id bigint;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_order_id), '') is null
     or nullif(btrim(p_event_id), '') is null then
    raise exception 'INVALID_REVERSAL_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_order_id := btrim(p_external_order_id);
  v_event_id := btrim(p_event_id);

  select e.* into v_existing_by_event
    from public.vendas_estornos as e
   where e.event_id = v_event_id
   for update;

  if found then
    outcome := 'duplicate';
    estorno_id := v_existing_by_event.id;
    venda_id := v_existing_by_event.id_venda;
    status := v_existing_by_event.status;
    return next;
    return;
  end if;

  select r.* into v_ref
    from ifood_internal.order_refs as r
   where r.merchant_id = v_merchant_id
     and r.external_order_id = v_external_order_id
   for update;

  if not found then
    outcome := 'no_sale';
    estorno_id := null;
    venda_id := null;
    status := null;
    return next;
    return;
  end if;

  select zo.* into v_order
    from public.zelo_orders as zo
   where zo.id = v_ref.zelo_order_id
   for update;

  if not found then
    outcome := 'no_sale';
    estorno_id := null;
    venda_id := null;
    status := null;
    return next;
    return;
  end if;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = v_ref.empresa_id;

  if v_owner is null then
    outcome := 'no_sale';
    estorno_id := null;
    venda_id := null;
    status := null;
    return next;
    return;
  end if;

  v_client_sale_id := 'zelo-order:' || v_order.id;

  select v.* into v_venda
    from public.vendas as v
   where v.id_usuario = v_owner
     and v.client_sale_id = v_client_sale_id
   for update;

  if not found then
    outcome := 'no_sale';
    estorno_id := null;
    venda_id := null;
    status := null;
    return next;
    return;
  end if;

  select e.* into v_existing_applied
    from public.vendas_estornos as e
   where e.id_venda = v_venda.id
     and e.status = 'applied'
   limit 1;

  if found then
    outcome := 'duplicate';
    estorno_id := v_existing_applied.id;
    venda_id := v_venda.id;
    status := v_existing_applied.status;
    return next;
    return;
  end if;

  -- Ambiguous/partial: the order is not (yet) cancelled, or its snapshot
  -- was overwritten by a later event with a total that no longer matches
  -- what was materialized into the venda. Either case cannot be resolved
  -- unambiguously from this single event, so it becomes a pending review
  -- item instead of an automatic reversal.
  if v_order.status <> 'cancelled' then
    v_status := 'pending_review';
    v_reason := 'order_not_cancelled';
  elsif v_order.total is distinct from v_venda.valor_total then
    v_status := 'pending_review';
    v_reason := 'total_mismatch';
  else
    v_status := 'applied';
    v_reason := 'ifood_cancelled_after_delivery';
  end if;

  insert into public.vendas_estornos (
    id_usuario, id_venda, merchant_id, external_order_id, event_id,
    status, reason, valor_estornado, detail
  )
  values (
    v_owner, v_venda.id, v_merchant_id, v_external_order_id, v_event_id,
    v_status, v_reason,
    case when v_status = 'applied' then v_venda.valor_total else null end,
    jsonb_build_object(
      'orderStatus', v_order.status,
      'orderTotal', v_order.total,
      'vendaTotal', v_venda.valor_total
    )
  )
  returning id into v_estorno_id;

  outcome := v_status;
  estorno_id := v_estorno_id;
  venda_id := v_venda.id;
  status := v_status;
  return next;
end;
$$;

create or replace function public.ensure_zelo_order_sale(p_order_id uuid, p_sale_at timestamp with time zone default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
  v_canal_origem text;
  v_ifood_merchant_id text;
  v_ifood_external_order_id text;
begin
  select * into v_order
  from public.zelo_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'ZL404', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.source = 'mesa' then
    return null;
  end if;

  if v_order.sale_id is not null then
    return v_order.sale_id;
  end if;

  -- iFood orders never go through the generic caixa/payment/item logic
  -- below: the zelo_order_sale_on_deliver trigger fires unconditionally
  -- for every order reaching delivered, including iFood, so this branch
  -- exists purely to redirect that automatic path to the correct,
  -- idempotent contract instead of running the wrong one.
  if v_order.source = 'ifood' then
    if v_order.status <> 'delivered' then
      return null;
    end if;

    select r.merchant_id, r.external_order_id
      into v_ifood_merchant_id, v_ifood_external_order_id
      from ifood_internal.order_refs as r
     where r.zelo_order_id = v_order.id
     limit 1;

    if v_ifood_merchant_id is null then
      return null;
    end if;

    select m.venda_id into v_sale_id
      from public.materialize_ifood_sale_v1(v_ifood_merchant_id, v_ifood_external_order_id) as m;

    return v_sale_id;
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

  v_canal_origem := case v_order.source
    when 'zelomenu' then 'zelomenu'
    when 'zelochat' then 'zelochat'
    when 'whatsapp' then 'zelochat'
    when 'legacy_zelochat' then 'zelochat'
    when 'legacy_pedido' then 'pdv'
    when 'manual' then 'manual'
    else 'pdv'
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
    canal_origem,
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
    v_canal_origem,
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

comment on function public.materialize_ifood_sale_v1(text, text) is
  'Materializa uma unica venda (id_caixa null, sem Pessoa/fiado) para um pedido iFood em CONCLUDED/delivered; idempotente por client_sale_id.';
comment on function public.reverse_ifood_sale_v1(text, text, text) is
  'Registra estorno auditavel de uma venda iFood cancelada, preservando a venda; ambiguidade cai em pending_review.';
comment on function public.ensure_zelo_order_sale(uuid, timestamp with time zone) is
  'Materializa a venda de um pedido canonico entregue; para source=ifood delega a materialize_ifood_sale_v1, para os demais estampa canal_origem a partir do source.';

revoke all on function public.materialize_ifood_sale_v1(text, text) from public, anon, authenticated;
revoke all on function public.reverse_ifood_sale_v1(text, text, text) from public, anon, authenticated;

grant execute on function public.materialize_ifood_sale_v1(text, text) to service_role;
grant execute on function public.reverse_ifood_sale_v1(text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
