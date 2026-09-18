-- Transactional verification for iFood sale materialization + reversal.
-- All fixtures are rolled back; this never targets the linked project.
begin;

create temporary table ifood_sale_verification_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  connection_a uuid not null,
  connection_b uuid not null
) on commit drop;

insert into ifood_sale_verification_fixture (
  empresa_a, empresa_b, owner_a, owner_b, connection_a, connection_b
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-sale-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_sale_verification_fixture
union all
select owner_b, 'codex-ifood-sale-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_sale_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood sale verification A'
  from ifood_sale_verification_fixture
union all
select empresa_b, owner_b, 'iFood sale verification B'
  from ifood_sale_verification_fixture;

-- Decoy open caixa for owner A covering the whole test window: proves
-- materialize_ifood_sale_v1 never attaches an id_caixa, unlike the generic
-- ensure_zelo_order_sale path used by other channels.
insert into public.caixas (id_usuario, data_abertura, valor_inicial, data_fechamento)
select owner_a, '2026-09-16T00:00:00Z'::timestamptz, 100, null
  from ifood_sale_verification_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-sale-a', 'active'
  from ifood_sale_verification_fixture
union all
select connection_b, empresa_b, 'merchant-sale-b', 'active'
  from ifood_sale_verification_fixture;

grant select on ifood_sale_verification_fixture to service_role;
set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.materialize_ifood_sale_v1(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.materialize_ifood_sale_v1(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.reverse_ifood_sale_v1(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reverse_ifood_sale_v1(text,text,text)', 'EXECUTE') then
    raise exception 'browser role can execute an iFood sale RPC';
  end if;
  if not has_function_privilege('service_role', 'public.materialize_ifood_sale_v1(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reverse_ifood_sale_v1(text,text,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute an iFood sale RPC';
  end if;
end;
$$;

-- Order 1 (empresa A, happy path): PLACED -> CONFIRMED -> CONCLUDED, two
-- items (one with modifiers), split payment with one leg that resolves to
-- fiado (must be coerced to outro).
create temporary table ifood_sale_order1_snapshot (payload jsonb not null) on commit drop;
insert into ifood_sale_order1_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-sale-1',
  'merchantId', 'merchant-sale-a',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'delivery', 'deliveredBy', 'IFOOD'),
  'payment', jsonb_build_object(
    'declaredMethod', null, 'method', null, 'isSplit', true,
    'methods', jsonb_build_array(
      jsonb_build_object('methodId', 'pix', 'value', 33.00),
      jsonb_build_object('methodId', 'fiado', 'value', 10.00)
    )
  ),
  'totals', jsonb_build_object('subTotal', 40.00, 'deliveryFee', 8.00, 'additionalFees', 0, 'benefits', 5.00, 'orderAmount', 43.00),
  'items', jsonb_build_array(
    jsonb_build_object(
      'id', 'ext-item-combo', 'externalId', 'ext-item-combo',
      'name', 'Combo iFood', 'unitPrice', 20.00, 'quantity', 1, 'totalPrice', 20.00,
      'options', jsonb_build_array(jsonb_build_object('groupName', 'Extras', 'optionName', 'Queijo extra', 'priceDelta', 0, 'quantity', 1)),
      'position', 1
    ),
    jsonb_build_object(
      'id', 'ext-item-refri', 'externalId', 'ext-item-refri',
      'name', 'Refrigerante lata', 'unitPrice', 20.00, 'quantity', 1, 'totalPrice', 20.00,
      'options', '[]'::jsonb, 'position', 2
    )
  )
));

create temporary table ifood_sale_orders (order_key text primary key, order_id uuid not null) on commit drop;

insert into ifood_sale_orders (order_key, order_id)
select 'order1', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sale-a', 'order-sale-1', 'event-sale-1-placed', 'PLACED',
    '2026-09-16T15:00:00Z'::timestamptz,
    (select payload from ifood_sale_order1_snapshot)
  );

-- 0) Materialize before the order ever reaches delivered must refuse.
do $$
declare
  v_outcome text;
  v_venda_id bigint;
begin
  select outcome, venda_id into v_outcome, v_venda_id
    from public.materialize_ifood_sale_v1('merchant-sale-a', 'order-sale-1');
  if v_outcome <> 'not_delivered' or v_venda_id is not null then
    raise exception 'materialize before delivered should be not_delivered, got %', v_outcome;
  end if;
end;
$$;

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-1', 'event-sale-1-confirmed', 'CONFIRMED',
  '2026-09-16T15:01:00Z'::timestamptz,
  (select payload from ifood_sale_order1_snapshot)
);

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-1', 'event-sale-1-concluded', 'CONCLUDED',
  '2026-09-16T15:30:00Z'::timestamptz,
  (select payload from ifood_sale_order1_snapshot)
);

-- 1) The automatic zelo_order_sale_on_deliver trigger fired mid-projection
-- and could not materialize (it observes the pre-update row -- documented
-- in the migration). No sale exists yet from that path alone.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.vendas
   where client_sale_id = 'zelo-order:' || (select order_id from ifood_sale_orders where order_key = 'order1');
  if v_count <> 0 then
    raise exception 'unexpected sale materialized before an explicit call';
  end if;
end;
$$;

-- 2) Explicit materialize call (the JS event handler's real path) creates
-- exactly one venda: id_caixa is null, canal_origem is ifood, items and
-- modifiers preserved, fiado leg coerced to outro.
create temporary table ifood_sale_materialize_result on commit drop as
select * from public.materialize_ifood_sale_v1('merchant-sale-a', 'order-sale-1');

do $$
declare
  v_outcome text;
  v_venda_id bigint;
  v_id_caixa integer;
  v_canal text;
  v_total numeric;
  v_item_count integer;
  v_modifiers jsonb;
  v_pagamento_count integer;
  v_outro_count integer;
begin
  select outcome, venda_id into v_outcome, v_venda_id from ifood_sale_materialize_result;
  if v_outcome <> 'materialized' or v_venda_id is null then
    raise exception 'materialize did not create a sale: outcome=%', v_outcome;
  end if;

  select id_caixa, canal_origem, valor_total into v_id_caixa, v_canal, v_total
    from public.vendas where id = v_venda_id;
  if v_id_caixa is not null then
    raise exception 'id_caixa is null violated: got %', v_id_caixa;
  end if;
  if v_canal <> 'ifood' then
    raise exception 'canal_origem was not stamped ifood: got %', v_canal;
  end if;
  if v_total <> 43.00 then
    raise exception 'valor_total mismatch: got %', v_total;
  end if;

  select count(*) into v_item_count from public.vendas_itens where id_venda = v_venda_id;
  if v_item_count <> 2 then
    raise exception 'expected 2 vendas_itens, got %', v_item_count;
  end if;

  select modifiers into v_modifiers from public.vendas_itens
   where id_venda = v_venda_id and nome_produto_na_venda = 'Combo iFood';
  if jsonb_array_length(v_modifiers) <> 1 then
    raise exception 'modifiers were not preserved from zelo_order_items';
  end if;

  select count(*) into v_pagamento_count from public.vendas_pagamentos where id_venda = v_venda_id;
  if v_pagamento_count <> 2 then
    raise exception 'expected 2 split vendas_pagamentos, got %', v_pagamento_count;
  end if;

  select count(*) into v_outro_count from public.vendas_pagamentos
   where id_venda = v_venda_id and forma_pagamento = 'outro' and valor = 10.00;
  if v_outro_count <> 1 then
    raise exception 'fiado leg was not coerced to outro';
  end if;

  select count(*) into v_outro_count from public.vendas_pagamentos
   where id_venda = v_venda_id and forma_pagamento = 'fiado';
  if v_outro_count <> 0 then
    raise exception 'a fiado vendas_pagamentos row leaked through';
  end if;
end;
$$;

-- 3) Idempotent re-materialize: same venda, no duplicate rows.
create temporary table ifood_sale_materialize_dup on commit drop as
select * from public.materialize_ifood_sale_v1('merchant-sale-a', 'order-sale-1');

do $$
declare
  v_outcome text;
  v_venda_id bigint;
  v_expected_id bigint;
  v_total_sales integer;
begin
  select outcome, venda_id into v_outcome, v_venda_id from ifood_sale_materialize_dup;
  select venda_id into v_expected_id from ifood_sale_materialize_result;
  if v_outcome <> 'already_exists' or v_venda_id is distinct from v_expected_id then
    raise exception 'duplicate materialize did not no-op: outcome=%', v_outcome;
  end if;
  select count(*) into v_total_sales from public.vendas
   where client_sale_id = 'zelo-order:' || (select order_id from ifood_sale_orders where order_key = 'order1');
  if v_total_sales <> 1 then
    raise exception 'duplicate materialize created a second venda';
  end if;
end;
$$;

-- 4) Cancellation after delivery: an applied estorno, venda preserved.
select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-1', 'event-sale-1-cancelled', 'CANCELLED',
  '2026-09-16T16:00:00Z'::timestamptz,
  (select payload from ifood_sale_order1_snapshot)
);

create temporary table ifood_sale_reverse_result on commit drop as
select * from public.reverse_ifood_sale_v1('merchant-sale-a', 'order-sale-1', 'event-sale-1-cancelled');

do $$
declare
  v_outcome text;
  v_status text;
  v_venda_id bigint;
  v_venda_count integer;
begin
  select outcome, status, venda_id into v_outcome, v_status, v_venda_id from ifood_sale_reverse_result;
  if v_outcome <> 'applied' or v_status <> 'applied' then
    raise exception 'expected applied reversal, got outcome=% status=%', v_outcome, v_status;
  end if;
  select count(*) into v_venda_count from public.vendas where id = v_venda_id;
  if v_venda_count <> 1 then
    raise exception 'reverse deleted the venda instead of preserving it';
  end if;
end;
$$;

-- 5) Same event_id retried is a clean duplicate, no second row.
create temporary table ifood_sale_reverse_dup on commit drop as
select * from public.reverse_ifood_sale_v1('merchant-sale-a', 'order-sale-1', 'event-sale-1-cancelled');

do $$
declare
  v_outcome text;
  v_count integer;
begin
  select outcome into v_outcome from ifood_sale_reverse_dup;
  if v_outcome <> 'duplicate' then
    raise exception 'retried event_id was not treated as duplicate: got %', v_outcome;
  end if;
  select count(*) into v_count from public.vendas_estornos where event_id = 'event-sale-1-cancelled';
  if v_count <> 1 then
    raise exception 'retried event_id created a second estorno row';
  end if;
end;
$$;

-- 6) A distinct event_id for an already-reversed sale is also a duplicate
-- (one-applied-per-sale), not a second applied estorno.
create temporary table ifood_sale_reverse_second_event on commit drop as
select * from public.reverse_ifood_sale_v1('merchant-sale-a', 'order-sale-1', 'event-sale-1-cancelled-again');

do $$
declare
  v_outcome text;
  v_applied_count integer;
begin
  select outcome into v_outcome from ifood_sale_reverse_second_event;
  if v_outcome <> 'duplicate' then
    raise exception 'a second distinct cancellation event was not deduped: got %', v_outcome;
  end if;
  select count(*) into v_applied_count from public.vendas_estornos
   where id_venda = (select venda_id from ifood_sale_materialize_result) and status = 'applied';
  if v_applied_count <> 1 then
    raise exception 'more than one applied estorno exists for the same sale';
  end if;
end;
$$;

-- 7) Cancelled before ever reaching delivered: no sale to reverse.
insert into ifood_sale_orders (order_key, order_id)
select 'order2', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sale-a', 'order-sale-2', 'event-sale-2-placed', 'PLACED',
    '2026-09-16T15:00:00Z'::timestamptz,
    (select payload from ifood_sale_order1_snapshot)
  );

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-2', 'event-sale-2-confirmed', 'CONFIRMED',
  '2026-09-16T15:01:00Z'::timestamptz,
  (select payload from ifood_sale_order1_snapshot)
);

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-2', 'event-sale-2-cancelled', 'CANCELLED',
  '2026-09-16T15:02:00Z'::timestamptz,
  (select payload from ifood_sale_order1_snapshot)
);

create temporary table ifood_sale_reverse_no_sale on commit drop as
select * from public.reverse_ifood_sale_v1('merchant-sale-a', 'order-sale-2', 'event-sale-2-cancelled');

do $$
declare
  v_outcome text;
begin
  select outcome into v_outcome from ifood_sale_reverse_no_sale;
  if v_outcome <> 'no_sale' then
    raise exception 'order never delivered should reverse as no_sale, got %', v_outcome;
  end if;
end;
$$;

-- 8) Ambiguous reversal: the cancellation snapshot changed the order total
-- after materialize, so the venda and the order no longer agree -- must be
-- pending_review, not applied.
create temporary table ifood_sale_order3_snapshot (payload jsonb not null) on commit drop;
insert into ifood_sale_order3_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-sale-3',
  'merchantId', 'merchant-sale-a',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'takeout'),
  'payment', jsonb_build_object(
    'declaredMethod', 'pix', 'method', 'pix', 'isSplit', false,
    'methods', jsonb_build_array(jsonb_build_object('methodId', 'pix', 'value', 20.00))
  ),
  'totals', jsonb_build_object('subTotal', 20.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 20.00),
  'items', jsonb_build_array(
    jsonb_build_object(
      'id', 'ext-item-solo', 'externalId', 'ext-item-solo',
      'name', 'Item solo', 'unitPrice', 20.00, 'quantity', 1, 'totalPrice', 20.00,
      'options', '[]'::jsonb, 'position', 1
    )
  )
));

insert into ifood_sale_orders (order_key, order_id)
select 'order3', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sale-a', 'order-sale-3', 'event-sale-3-placed', 'PLACED',
    '2026-09-16T17:00:00Z'::timestamptz,
    (select payload from ifood_sale_order3_snapshot)
  );

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-3', 'event-sale-3-confirmed', 'CONFIRMED',
  '2026-09-16T17:01:00Z'::timestamptz,
  (select payload from ifood_sale_order3_snapshot)
);

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-3', 'event-sale-3-concluded', 'CONCLUDED',
  '2026-09-16T17:10:00Z'::timestamptz,
  (select payload from ifood_sale_order3_snapshot)
);

select * from public.materialize_ifood_sale_v1('merchant-sale-a', 'order-sale-3');

-- A later terminal event with a different snapshot overrides the order's
-- own total (project_ifood_order_event_v1's documented terminal-override
-- behaviour) without ever touching the already-materialized venda.
create temporary table ifood_sale_order3_edited_snapshot (payload jsonb not null) on commit drop;
insert into ifood_sale_order3_edited_snapshot
select jsonb_set(payload, '{totals}', jsonb_build_object(
  'subTotal', 12.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 12.00
))
  from ifood_sale_order3_snapshot;

select * from public.project_ifood_order_event_v1(
  'merchant-sale-a', 'order-sale-3', 'event-sale-3-cancelled', 'CANCELLED',
  '2026-09-16T17:20:00Z'::timestamptz,
  (select payload from ifood_sale_order3_edited_snapshot)
);

create temporary table ifood_sale_reverse_pending on commit drop as
select * from public.reverse_ifood_sale_v1('merchant-sale-a', 'order-sale-3', 'event-sale-3-cancelled');

do $$
declare
  v_outcome text;
  v_status text;
begin
  select outcome, status into v_outcome, v_status from ifood_sale_reverse_pending;
  if v_outcome <> 'pending_review' or v_status <> 'pending_review' then
    raise exception 'total mismatch after cancellation should be pending_review, got outcome=% status=%', v_outcome, v_status;
  end if;
end;
$$;

-- 9) Cross-tenant: empresa B's materialized sale belongs to owner B only.
insert into ifood_sale_orders (order_key, order_id)
select 'order4', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sale-b', 'order-sale-4', 'event-sale-4-placed', 'PLACED',
    '2026-09-16T18:00:00Z'::timestamptz,
    (select payload from ifood_sale_order3_snapshot)
  );

select * from public.project_ifood_order_event_v1(
  'merchant-sale-b', 'order-sale-4', 'event-sale-4-confirmed', 'CONFIRMED',
  '2026-09-16T18:01:00Z'::timestamptz,
  (select payload from ifood_sale_order3_snapshot)
);

select * from public.project_ifood_order_event_v1(
  'merchant-sale-b', 'order-sale-4', 'event-sale-4-concluded', 'CONCLUDED',
  '2026-09-16T18:10:00Z'::timestamptz,
  (select payload from ifood_sale_order3_snapshot)
);

create temporary table ifood_sale_materialize_b on commit drop as
select * from public.materialize_ifood_sale_v1('merchant-sale-b', 'order-sale-4');

do $$
declare
  v_venda_id bigint;
  v_owner uuid;
  v_expected_owner uuid;
begin
  select venda_id into v_venda_id from ifood_sale_materialize_b;
  select id_usuario into v_owner from public.vendas where id = v_venda_id;
  select owner_b into v_expected_owner from ifood_sale_verification_fixture;
  if v_owner is distinct from v_expected_owner then
    raise exception 'cross-tenant isolation violated: sale attached to wrong owner';
  end if;
end;
$$;

rollback;
