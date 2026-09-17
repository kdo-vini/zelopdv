-- Progressive iFood product mapping and stock commitments.
--
-- Tables `ifood_internal.product_mappings` and `ifood_internal.stock_commitments`
-- already exist (foundation). This migration only adds service-role RPCs:
-- suggest/confirm mappings, commit stock on CONFIRMED, release on CANCELLED.
-- Stock balance and ledger rows change in the same transaction. Unmapped
-- items never move stock and never block the order.
begin;

create or replace function public.suggest_ifood_product_mapping_v1(
  p_empresa_id uuid,
  p_merchant_id text,
  p_external_item_id text,
  p_external_code text,
  p_item_name text
) returns table (
  outcome text,
  existing_mapping jsonb,
  exact_match jsonb,
  similar_matches jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_item_id text;
  v_external_code text;
  v_item_name text;
  v_connection ifood_internal.connections;
  v_owner uuid;
  v_existing ifood_internal.product_mappings;
  v_exact_product public.produtos;
  v_exact jsonb := null;
  v_similar jsonb := '[]'::jsonb;
  v_mapping_id uuid;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if p_empresa_id is null
     or nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_item_id), '') is null then
    raise exception 'INVALID_MAPPING_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_item_id := btrim(p_external_item_id);
  v_external_code := nullif(btrim(coalesce(p_external_code, '')), '');
  v_item_name := nullif(btrim(coalesce(p_item_name, '')), '');

  select c.*
    into v_connection
    from ifood_internal.connections as c
   where c.empresa_id = p_empresa_id
     and c.merchant_id = v_merchant_id
   for update;

  if not found then
    outcome := 'connection_not_found';
    existing_mapping := null;
    exact_match := null;
    similar_matches := '[]'::jsonb;
    return next;
    return;
  end if;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = p_empresa_id;
  if v_owner is null then
    raise exception 'INVALID_MAPPING_ARGUMENTS';
  end if;

  select m.*
    into v_existing
    from ifood_internal.product_mappings as m
   where m.merchant_id = v_merchant_id
     and m.external_item_id = v_external_item_id
   for update;

  if found then
    existing_mapping := jsonb_build_object(
      'id', v_existing.id,
      'merchantId', v_existing.merchant_id,
      'externalItemId', v_existing.external_item_id,
      'externalCode', v_existing.external_code,
      'productId', v_existing.product_id,
      'mappingStatus', v_existing.mapping_status
    );
  else
    existing_mapping := null;
  end if;

  -- Exact match is only by externalCode === produtos.id::text for this tenant.
  -- Never auto-confirm; at most upsert mapping_status = 'suggested'.
  if v_external_code is not null and v_external_code ~ '^[0-9]+$' then
    select p.*
      into v_exact_product
      from public.produtos as p
     where p.id_usuario = v_owner
       and p.id = v_external_code::integer;

    if found then
      v_exact := jsonb_build_object(
        'productId', v_exact_product.id,
        'name', v_exact_product.nome,
        'reason', 'external_code'
      );

      if v_existing.id is null then
        insert into ifood_internal.product_mappings (
          connection_id, empresa_id, merchant_id, external_item_id,
          external_code, product_id, mapping_status
        ) values (
          v_connection.id, p_empresa_id, v_merchant_id, v_external_item_id,
          v_external_code, v_exact_product.id, 'suggested'
        )
        returning id into v_mapping_id;

        existing_mapping := jsonb_build_object(
          'id', v_mapping_id,
          'merchantId', v_merchant_id,
          'externalItemId', v_external_item_id,
          'externalCode', v_external_code,
          'productId', v_exact_product.id,
          'mappingStatus', 'suggested'
        );
      elsif v_existing.mapping_status = 'suggested'
         and (v_existing.product_id is distinct from v_exact_product.id
              or v_existing.external_code is distinct from v_external_code) then
        update ifood_internal.product_mappings
           set product_id = v_exact_product.id,
               external_code = v_external_code,
               updated_at = now()
         where id = v_existing.id;

        existing_mapping := jsonb_build_object(
          'id', v_existing.id,
          'merchantId', v_merchant_id,
          'externalItemId', v_external_item_id,
          'externalCode', v_external_code,
          'productId', v_exact_product.id,
          'mappingStatus', 'suggested'
        );
      end if;
    end if;
  end if;

  -- Similar names are visual suggestions only — never written as mappings.
  if v_item_name is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', s.id,
      'name', s.nome,
      'reason', 'similar_name'
    ) order by s.nome), '[]'::jsonb)
      into v_similar
      from (
        select p.id, p.nome
          from public.produtos as p
         where p.id_usuario = v_owner
           and (
             lower(p.nome) = lower(v_item_name)
             or p.nome ilike ('%' || v_item_name || '%')
             or v_item_name ilike ('%' || p.nome || '%')
           )
           and (v_exact_product.id is null or p.id <> v_exact_product.id)
         order by
           case when lower(p.nome) = lower(v_item_name) then 0 else 1 end,
           length(p.nome),
           p.nome
         limit 5
      ) as s;
  end if;

  outcome := 'ok';
  exact_match := v_exact;
  similar_matches := coalesce(v_similar, '[]'::jsonb);
  return next;
end;
$$;

create or replace function public.confirm_ifood_product_mapping_v1(
  p_empresa_id uuid,
  p_merchant_id text,
  p_external_item_id text,
  p_product_id integer,
  p_external_code text default null,
  p_action text default 'confirm'
) returns table (
  outcome text,
  mapping_id uuid,
  mapping_status text,
  product_id integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_item_id text;
  v_external_code text;
  v_action text;
  v_connection ifood_internal.connections;
  v_owner uuid;
  v_product public.produtos;
  v_mapping ifood_internal.product_mappings;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if p_empresa_id is null
     or nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_item_id), '') is null
     or p_product_id is null then
    raise exception 'INVALID_MAPPING_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_item_id := btrim(p_external_item_id);
  v_external_code := nullif(btrim(coalesce(p_external_code, '')), '');
  v_action := lower(btrim(coalesce(p_action, 'confirm')));

  if v_action not in ('confirm', 'disable') then
    outcome := 'invalid_payload';
    mapping_id := null;
    mapping_status := null;
    product_id := null;
    return next;
    return;
  end if;

  select c.*
    into v_connection
    from ifood_internal.connections as c
   where c.empresa_id = p_empresa_id
     and c.merchant_id = v_merchant_id
   for update;

  if not found then
    outcome := 'connection_not_found';
    mapping_id := null;
    mapping_status := null;
    product_id := null;
    return next;
    return;
  end if;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = p_empresa_id;

  select p.*
    into v_product
    from public.produtos as p
   where p.id = p_product_id
     and p.id_usuario = v_owner
   for update;

  if not found then
    -- Cross-tenant or unknown product: never create the mapping.
    outcome := 'product_not_found';
    mapping_id := null;
    mapping_status := null;
    product_id := null;
    return next;
    return;
  end if;

  select m.*
    into v_mapping
    from ifood_internal.product_mappings as m
   where m.merchant_id = v_merchant_id
     and m.external_item_id = v_external_item_id
   for update;

  if found then
    update ifood_internal.product_mappings
       set product_id = v_product.id,
           external_code = coalesce(v_external_code, external_code),
           mapping_status = case when v_action = 'disable' then 'disabled' else 'confirmed' end,
           updated_at = now()
     where id = v_mapping.id
     returning * into v_mapping;
  else
    insert into ifood_internal.product_mappings (
      connection_id, empresa_id, merchant_id, external_item_id,
      external_code, product_id, mapping_status
    ) values (
      v_connection.id, p_empresa_id, v_merchant_id, v_external_item_id,
      v_external_code, v_product.id,
      case when v_action = 'disable' then 'disabled' else 'confirmed' end
    )
    returning * into v_mapping;
  end if;

  outcome := 'ok';
  mapping_id := v_mapping.id;
  mapping_status := v_mapping.mapping_status;
  product_id := v_mapping.product_id;
  return next;
end;
$$;

create or replace function public.commit_ifood_stock_for_event_v1(
  p_merchant_id text,
  p_external_order_id text,
  p_event_id text,
  p_items jsonb
) returns table (
  outcome text,
  committed_count integer,
  skipped_unmapped integer,
  skipped_insufficient integer,
  duplicate_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_order_id text;
  v_event_id text;
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_owner uuid;
  v_item jsonb;
  v_external_item_id text;
  v_quantity integer;
  v_position integer;
  v_mapping ifood_internal.product_mappings;
  v_product public.produtos;
  v_category public.categorias;
  v_commitment_id uuid;
  v_committed integer := 0;
  v_skipped_unmapped integer := 0;
  v_skipped_insufficient integer := 0;
  v_duplicates integer := 0;
  v_updated integer;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_order_id), '') is null
     or nullif(btrim(p_event_id), '') is null then
    raise exception 'INVALID_STOCK_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_order_id := btrim(p_external_order_id);
  v_event_id := btrim(p_event_id);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_STOCK_ARGUMENTS';
  end if;

  select r.*
    into v_ref
    from ifood_internal.order_refs as r
   where r.merchant_id = v_merchant_id
     and r.external_order_id = v_external_order_id
   for update;

  if not found then
    outcome := 'order_not_found';
    committed_count := 0;
    skipped_unmapped := 0;
    skipped_insufficient := 0;
    duplicate_count := 0;
    return next;
    return;
  end if;

  select zo.*
    into v_order
    from public.zelo_orders as zo
   where zo.id = v_ref.zelo_order_id
   for update;

  if not found then
    outcome := 'order_not_found';
    committed_count := 0;
    skipped_unmapped := 0;
    skipped_insufficient := 0;
    duplicate_count := 0;
    return next;
    return;
  end if;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = v_ref.empresa_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_external_item_id := nullif(btrim(coalesce(
      v_item->>'externalId',
      v_item->>'id',
      v_item->>'external_item_id',
      ''
    )), '');
    if v_external_item_id is null then
      v_skipped_unmapped := v_skipped_unmapped + 1;
      continue;
    end if;

    begin
      v_quantity := coalesce((v_item->>'quantity')::integer, 1);
    exception when others then
      v_quantity := 1;
    end;
    if v_quantity is null or v_quantity < 1 then
      v_quantity := 1;
    end if;

    begin
      v_position := (v_item->>'position')::integer;
    exception when others then
      v_position := null;
    end;

    select m.*
      into v_mapping
      from ifood_internal.product_mappings as m
     where m.merchant_id = v_merchant_id
       and m.external_item_id = v_external_item_id
       and m.mapping_status = 'confirmed'
       and m.product_id is not null;

    if not found then
      v_skipped_unmapped := v_skipped_unmapped + 1;
      continue;
    end if;

    select p.*
      into v_product
      from public.produtos as p
     where p.id = v_mapping.product_id
       and p.id_usuario = v_owner
     for update;

    if not found then
      v_skipped_unmapped := v_skipped_unmapped + 1;
      continue;
    end if;

    insert into ifood_internal.stock_commitments (
      connection_id, order_ref_id, empresa_id, merchant_id, external_order_id,
      external_item_id, product_id, quantity, status, commit_event_id
    ) values (
      v_ref.connection_id, v_ref.id, v_ref.empresa_id, v_merchant_id, v_external_order_id,
      v_external_item_id, v_product.id, v_quantity, 'committed', v_event_id
    )
    on conflict on constraint ifood_stock_commitments_item_unique do nothing
    returning id into v_commitment_id;

    if v_commitment_id is null then
      v_duplicates := v_duplicates + 1;
      -- Still refresh product_id on the canonical line when already committed.
      if v_position is not null then
        update public.zelo_order_items
           set product_id = v_product.id
         where order_id = v_order.id
           and position = v_position
           and product_id is null;
      end if;
      continue;
    end if;

    select c.*
      into v_category
      from public.categorias as c
     where c.id = v_product.id_categoria
     for update;

    if found and coalesce(v_category.controlar_estoque_compartilhado, false) then
      update public.categorias
         set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_quantity
       where id = v_category.id
         and coalesce(estoque_compartilhado_atual, 0) >= v_quantity;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        delete from ifood_internal.stock_commitments where id = v_commitment_id;
        v_skipped_insufficient := v_skipped_insufficient + 1;
        continue;
      end if;
    elsif coalesce(v_product.controlar_estoque, false) then
      update public.produtos
         set estoque_atual = coalesce(estoque_atual, 0) - v_quantity
       where id = v_product.id
         and coalesce(estoque_atual, 0) >= v_quantity;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        delete from ifood_internal.stock_commitments where id = v_commitment_id;
        v_skipped_insufficient := v_skipped_insufficient + 1;
        continue;
      end if;
    end if;
    -- Products without stock control still get a ledger row so cancel can
    -- remain a no-op release for that line without inventing balances.

    if v_position is not null then
      update public.zelo_order_items
         set product_id = v_product.id
       where order_id = v_order.id
         and position = v_position;
    else
      update public.zelo_order_items as oi
         set product_id = v_product.id
       where oi.id = (
         select candidate.id
           from public.zelo_order_items as candidate
          where candidate.order_id = v_order.id
            and candidate.product_id is null
            and (
              nullif(v_item->>'name', '') is null
              or candidate.name = v_item->>'name'
            )
          order by candidate.position
          limit 1
       );
    end if;

    v_committed := v_committed + 1;
    v_commitment_id := null;
  end loop;

  if v_committed > 0 and v_order.stock_committed_at is null then
    update public.zelo_orders
       set stock_committed_at = now(),
           updated_at = now()
     where id = v_order.id;
  end if;

  outcome := 'ok';
  committed_count := v_committed;
  skipped_unmapped := v_skipped_unmapped;
  skipped_insufficient := v_skipped_insufficient;
  duplicate_count := v_duplicates;
  return next;
end;
$$;

create or replace function public.release_ifood_stock_for_event_v1(
  p_merchant_id text,
  p_external_order_id text,
  p_event_id text
) returns table (
  outcome text,
  released_count integer,
  duplicate_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id text;
  v_external_order_id text;
  v_event_id text;
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_owner uuid;
  v_commitment ifood_internal.stock_commitments;
  v_product public.produtos;
  v_category public.categorias;
  v_released integer := 0;
  v_duplicates integer := 0;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_order_id), '') is null
     or nullif(btrim(p_event_id), '') is null then
    raise exception 'INVALID_STOCK_ARGUMENTS';
  end if;

  v_merchant_id := btrim(p_merchant_id);
  v_external_order_id := btrim(p_external_order_id);
  v_event_id := btrim(p_event_id);

  select r.*
    into v_ref
    from ifood_internal.order_refs as r
   where r.merchant_id = v_merchant_id
     and r.external_order_id = v_external_order_id
   for update;

  if not found then
    outcome := 'order_not_found';
    released_count := 0;
    duplicate_count := 0;
    return next;
    return;
  end if;

  select zo.*
    into v_order
    from public.zelo_orders as zo
   where zo.id = v_ref.zelo_order_id
   for update;

  select ep.user_id into v_owner
    from public.empresa_perfil as ep
   where ep.id = v_ref.empresa_id;

  for v_commitment in
    select c.*
      from ifood_internal.stock_commitments as c
     where c.order_ref_id = v_ref.id
     order by c.created_at, c.id
     for update
  loop
    if v_commitment.status = 'released' then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    select p.*
      into v_product
      from public.produtos as p
     where p.id = v_commitment.product_id
       and p.id_usuario = v_owner
     for update;

    if found then
      select c.*
        into v_category
        from public.categorias as c
       where c.id = v_product.id_categoria
       for update;

      if found and coalesce(v_category.controlar_estoque_compartilhado, false) then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_commitment.quantity
         where id = v_category.id;
      elsif coalesce(v_product.controlar_estoque, false) then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_commitment.quantity
         where id = v_product.id;
      end if;
    end if;

    update ifood_internal.stock_commitments
       set status = 'released',
           release_event_id = v_event_id,
           released_at = now(),
           updated_at = now()
     where id = v_commitment.id;

    v_released := v_released + 1;
  end loop;

  if v_released > 0 and v_order.id is not null and v_order.stock_released_at is null then
    update public.zelo_orders
       set stock_released_at = now(),
           updated_at = now()
     where id = v_order.id;
  end if;

  outcome := 'ok';
  released_count := v_released;
  duplicate_count := v_duplicates;
  return next;
end;
$$;

comment on function public.suggest_ifood_product_mapping_v1(uuid, text, text, text, text) is
  'Sugere mapeamento iFood por externalCode exato; nomes semelhantes sao so leitura.';
comment on function public.confirm_ifood_product_mapping_v1(uuid, text, text, integer, text, text) is
  'Confirma ou desativa vinculo manual iFood↔produto dentro do tenant.';
comment on function public.commit_ifood_stock_for_event_v1(text, text, text, jsonb) is
  'Compromete estoque uma vez por item mapeado no evento CONFIRMED, com ledger idempotente.';
comment on function public.release_ifood_stock_for_event_v1(text, text, text) is
  'Restaura estoque uma vez por compromisso ainda committed no evento CANCELLED.';

revoke all on function public.suggest_ifood_product_mapping_v1(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_ifood_product_mapping_v1(uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.commit_ifood_stock_for_event_v1(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_ifood_stock_for_event_v1(text, text, text) from public, anon, authenticated;

grant execute on function public.suggest_ifood_product_mapping_v1(uuid, text, text, text, text) to service_role;
grant execute on function public.confirm_ifood_product_mapping_v1(uuid, text, text, integer, text, text) to service_role;
grant execute on function public.commit_ifood_stock_for_event_v1(text, text, text, jsonb) to service_role;
grant execute on function public.release_ifood_stock_for_event_v1(text, text, text) to service_role;

commit;
