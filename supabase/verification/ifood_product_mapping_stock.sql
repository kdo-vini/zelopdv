-- Transactional verification for progressive iFood product mapping + stock.
-- All fixtures are rolled back; this never targets the linked project.
begin;

create temporary table ifood_mapping_verification_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  connection_a uuid not null,
  connection_b uuid not null,
  product_exact integer not null,
  product_similar integer not null,
  product_other integer not null,
  product_shared integer not null,
  category_shared integer not null
) on commit drop;

insert into ifood_mapping_verification_fixture (
  empresa_a, empresa_b, owner_a, owner_b, connection_a, connection_b,
  product_exact, product_similar, product_other, product_shared, category_shared
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(),
  812001, 812002, 812003, 812004, 820001
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-map-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_mapping_verification_fixture
union all
select owner_b, 'codex-ifood-map-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_mapping_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood mapping verification A'
  from ifood_mapping_verification_fixture
union all
select empresa_b, owner_b, 'iFood mapping verification B'
  from ifood_mapping_verification_fixture;

insert into public.categorias (id, id_usuario, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)
select category_shared, owner_a, 'Shared stock cat', true, 10
  from ifood_mapping_verification_fixture;

insert into public.produtos (id, id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual)
select product_exact, owner_a, null, 'Exact Burger', 20, true, 5
  from ifood_mapping_verification_fixture
union all
select product_similar, owner_a, null, 'Exact Burger Deluxe', 25, true, 8
  from ifood_mapping_verification_fixture
union all
select product_other, owner_b, null, 'Other Tenant Item', 15, true, 9
  from ifood_mapping_verification_fixture
union all
select product_shared, owner_a, category_shared, 'Shared Stock Item', 12, true, 0
  from ifood_mapping_verification_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-mapping-a', 'active'
  from ifood_mapping_verification_fixture
union all
select connection_b, empresa_b, 'merchant-mapping-b', 'active'
  from ifood_mapping_verification_fixture;

grant select on ifood_mapping_verification_fixture to service_role;
set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.suggest_ifood_product_mapping_v1(uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.suggest_ifood_product_mapping_v1(uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.confirm_ifood_product_mapping_v1(uuid,text,text,integer,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.confirm_ifood_product_mapping_v1(uuid,text,text,integer,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.commit_ifood_stock_for_event_v1(text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_ifood_stock_for_event_v1(text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.release_ifood_stock_for_event_v1(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.release_ifood_stock_for_event_v1(text,text,text)', 'EXECUTE') then
    raise exception 'browser role can execute an iFood product-mapping RPC';
  end if;
  if not has_function_privilege('service_role', 'public.suggest_ifood_product_mapping_v1(uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.confirm_ifood_product_mapping_v1(uuid,text,text,integer,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.commit_ifood_stock_for_event_v1(text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.release_ifood_stock_for_event_v1(text,text,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute an iFood product-mapping RPC';
  end if;
end;
$$;

-- 1) Exact externalCode suggestion upserts suggested; similar name is read-only.
create temporary table ifood_mapping_suggest_result on commit drop as
select *
  from public.suggest_ifood_product_mapping_v1(
    (select empresa_a from ifood_mapping_verification_fixture),
    'merchant-mapping-a',
    'ext-item-exact',
    (select product_exact::text from ifood_mapping_verification_fixture),
    'Exact Burger'
  );

do $$
declare
  v_outcome text;
  v_exact jsonb;
  v_similar jsonb;
  v_status text;
  v_count integer;
begin
  select outcome, exact_match, similar_matches
    into v_outcome, v_exact, v_similar
    from ifood_mapping_suggest_result;
  if v_outcome <> 'ok' then
    raise exception 'exact suggest did not return ok';
  end if;
  if (v_exact->>'productId')::integer <> (select product_exact from ifood_mapping_verification_fixture) then
    raise exception 'exact match missing';
  end if;
  if jsonb_array_length(v_similar) < 1 then
    raise exception 'similar name suggestion missing';
  end if;

  select mapping_status into v_status
    from ifood_internal.product_mappings
   where merchant_id = 'merchant-mapping-a'
     and external_item_id = 'ext-item-exact';
  if v_status <> 'suggested' then
    raise exception 'exact suggest did not upsert suggested mapping';
  end if;

  -- Similar-only call must not create a confirmed mapping by name.
  perform public.suggest_ifood_product_mapping_v1(
    (select empresa_a from ifood_mapping_verification_fixture),
    'merchant-mapping-a',
    'ext-item-similar-only',
    null,
    'Exact Burger Deluxe'
  );
  select count(*) into v_count
    from ifood_internal.product_mappings
   where merchant_id = 'merchant-mapping-a'
     and external_item_id = 'ext-item-similar-only'
     and mapping_status = 'confirmed';
  if v_count <> 0 then
    raise exception 'similar name auto-confirmed a mapping';
  end if;
end;
$$;

-- 2) Manual confirm within tenant; cross-tenant product is rejected.
create temporary table ifood_mapping_confirm_result on commit drop as
select *
  from public.confirm_ifood_product_mapping_v1(
    (select empresa_a from ifood_mapping_verification_fixture),
    'merchant-mapping-a',
    'ext-item-exact',
    (select product_exact from ifood_mapping_verification_fixture),
    (select product_exact::text from ifood_mapping_verification_fixture),
    'confirm'
  );

do $$
declare
  v_outcome text;
  v_status text;
begin
  select outcome, mapping_status into v_outcome, v_status from ifood_mapping_confirm_result;
  if v_outcome <> 'ok' or v_status <> 'confirmed' then
    raise exception 'manual confirm failed';
  end if;
end;
$$;

create temporary table ifood_mapping_cross_result on commit drop as
select *
  from public.confirm_ifood_product_mapping_v1(
    (select empresa_a from ifood_mapping_verification_fixture),
    'merchant-mapping-a',
    'ext-item-cross',
    (select product_other from ifood_mapping_verification_fixture),
    null,
    'confirm'
  );

do $$
declare
  v_outcome text;
  v_count integer;
begin
  select outcome into v_outcome from ifood_mapping_cross_result;
  select count(*) into v_count
    from ifood_internal.product_mappings
   where merchant_id = 'merchant-mapping-a'
     and external_item_id = 'ext-item-cross';
  if v_outcome <> 'product_not_found' or v_count <> 0 then
    raise exception 'cross-tenant mapping was not isolated';
  end if;
end;
$$;

-- Project an order with one mapped item and one unmapped item.
create temporary table ifood_mapping_order_snapshot (payload jsonb not null) on commit drop;
insert into ifood_mapping_order_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-mapping-stock',
  'merchantId', 'merchant-mapping-a',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'delivery', 'deliveredBy', 'IFOOD'),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object('subTotal', 45.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 45.00),
  'items', jsonb_build_array(
    jsonb_build_object(
      'id', 'ext-item-exact', 'externalId', 'ext-item-exact', 'externalCode', '812001',
      'name', 'Exact Burger', 'unitPrice', 20.00, 'quantity', 2, 'totalPrice', 40.00,
      'options', '[]'::jsonb, 'position', 1
    ),
    jsonb_build_object(
      'id', 'ext-item-unmapped', 'externalId', 'ext-item-unmapped',
      'name', 'Mystery Item', 'unitPrice', 5.00, 'quantity', 1, 'totalPrice', 5.00,
      'options', '[]'::jsonb, 'position', 2
    )
  )
));

create temporary table ifood_mapping_orders (order_key text primary key, order_id uuid not null) on commit drop;

insert into ifood_mapping_orders (order_key, order_id)
select 'stock', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-mapping-a', 'order-mapping-stock', 'event-mapping-placed', 'PLACED',
    '2026-09-16T15:00:00Z'::timestamptz,
    (select payload from ifood_mapping_order_snapshot)
  );

select *
  from public.project_ifood_order_event_v1(
    'merchant-mapping-a', 'order-mapping-stock', 'event-mapping-confirmed', 'CONFIRMED',
    '2026-09-16T15:01:00Z'::timestamptz,
    (select payload from ifood_mapping_order_snapshot)
  );

-- 3) CONFIRMED commits stock once for mapped item; unmapped does not move stock.
create temporary table ifood_mapping_commit_result on commit drop as
select *
  from public.commit_ifood_stock_for_event_v1(
    'merchant-mapping-a',
    'order-mapping-stock',
    'event-mapping-confirmed',
    (select payload->'items' from ifood_mapping_order_snapshot)
  );

do $$
declare
  v_outcome text;
  v_committed integer;
  v_skipped integer;
  v_stock integer;
  v_ledger integer;
  v_product_id bigint;
begin
  select outcome, committed_count, skipped_unmapped
    into v_outcome, v_committed, v_skipped
    from ifood_mapping_commit_result;
  if v_outcome <> 'ok' or v_committed <> 1 or v_skipped < 1 then
    raise exception 'first commit did not commit mapped and skip unmapped';
  end if;

  select estoque_atual into v_stock from public.produtos
   where id = (select product_exact from ifood_mapping_verification_fixture);
  if v_stock <> 3 then
    raise exception 'mapped stock was not decremented by quantity 2';
  end if;

  select count(*) into v_ledger
    from ifood_internal.stock_commitments
   where merchant_id = 'merchant-mapping-a'
     and external_order_id = 'order-mapping-stock'
     and status = 'committed';
  if v_ledger <> 1 then
    raise exception 'ledger did not record a single commitment';
  end if;

  select product_id into v_product_id
    from public.zelo_order_items
   where order_id = (select order_id from ifood_mapping_orders where order_key = 'stock')
     and position = 1;
  if v_product_id is distinct from (select product_exact from ifood_mapping_verification_fixture) then
    raise exception 'canonical item product_id was not linked';
  end if;
end;
$$;

-- 4) Duplicate CONFIRMED does not double-decrement.
create temporary table ifood_mapping_commit_dup on commit drop as
select *
  from public.commit_ifood_stock_for_event_v1(
    'merchant-mapping-a',
    'order-mapping-stock',
    'event-mapping-confirmed-dup',
    (select payload->'items' from ifood_mapping_order_snapshot)
  );

do $$
declare
  v_duplicates integer;
  v_stock integer;
begin
  select duplicate_count into v_duplicates from ifood_mapping_commit_dup;
  if v_duplicates < 1 then
    raise exception 'duplicate commit was not detected';
  end if;
  select estoque_atual into v_stock from public.produtos
   where id = (select product_exact from ifood_mapping_verification_fixture);
  if v_stock <> 3 then
    raise exception 'duplicate CONFIRMED changed stock again';
  end if;
end;
$$;

-- 5) CANCELLED restores once; second cancel is a no-op release.
create temporary table ifood_mapping_release_result on commit drop as
select *
  from public.release_ifood_stock_for_event_v1(
    'merchant-mapping-a',
    'order-mapping-stock',
    'event-mapping-cancelled'
  );

do $$
declare
  v_released integer;
  v_stock integer;
begin
  select released_count into v_released from ifood_mapping_release_result;
  if v_released <> 1 then
    raise exception 'release did not restore the commitment';
  end if;
  select estoque_atual into v_stock from public.produtos
   where id = (select product_exact from ifood_mapping_verification_fixture);
  if v_stock <> 5 then
    raise exception 'stock was not restored on cancel';
  end if;
end;
$$;

create temporary table ifood_mapping_release_dup on commit drop as
select *
  from public.release_ifood_stock_for_event_v1(
    'merchant-mapping-a',
    'order-mapping-stock',
    'event-mapping-cancelled-dup'
  );

do $$
declare
  v_released integer;
  v_duplicates integer;
  v_stock integer;
begin
  select released_count, duplicate_count into v_released, v_duplicates
    from ifood_mapping_release_dup;
  if v_released <> 0 or v_duplicates < 1 then
    raise exception 'duplicate cancel was not a no-op';
  end if;
  select estoque_atual into v_stock from public.produtos
   where id = (select product_exact from ifood_mapping_verification_fixture);
  if v_stock <> 5 then
    raise exception 'duplicate cancel changed stock';
  end if;
end;
$$;

-- 6) Item without mapping never creates a stock commitment.
do $$
declare
  v_before integer;
  v_after integer;
  v_committed integer;
begin
  select count(*) into v_before from ifood_internal.stock_commitments
   where external_item_id = 'ext-item-unmapped';

  create temporary table ifood_mapping_unmapped_commit on commit drop as
  select *
    from public.commit_ifood_stock_for_event_v1(
      'merchant-mapping-a',
      'order-mapping-stock',
      'event-mapping-unmapped-only',
      jsonb_build_array(jsonb_build_object(
        'id', 'ext-item-unmapped', 'externalId', 'ext-item-unmapped',
        'name', 'Mystery Item', 'quantity', 1, 'position', 2
      ))
    );

  select committed_count into v_committed from ifood_mapping_unmapped_commit;
  select count(*) into v_after from ifood_internal.stock_commitments
   where external_item_id = 'ext-item-unmapped';
  if v_committed <> 0 or v_before <> v_after then
    raise exception 'unmapped item moved stock or created a ledger row';
  end if;
end;
$$;

rollback;
