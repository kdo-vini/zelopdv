-- Atomic confirmation boundary for conversational WhatsApp orders.
-- The helpers below intentionally mirror ZeloMenu's persisted cart contract so
-- the final comparison is between canonical JSONB snapshots, not approximations.

alter table public.zelomenu_modifier_groups
  add column if not exists minimo_total_quantidade integer not null default 0;
alter table public.zelomenu_modifier_groups
  add column if not exists maximo_total_quantidade integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'zelomenu_modifier_groups_minimo_total_quantidade_check'
       and conrelid = 'public.zelomenu_modifier_groups'::regclass
  ) then
    alter table public.zelomenu_modifier_groups
      add constraint zelomenu_modifier_groups_minimo_total_quantidade_check
      check (minimo_total_quantidade >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'zelomenu_modifier_groups_maximo_total_quantidade_check'
       and conrelid = 'public.zelomenu_modifier_groups'::regclass
  ) then
    alter table public.zelomenu_modifier_groups
      add constraint zelomenu_modifier_groups_maximo_total_quantidade_check
      check (maximo_total_quantidade is null or maximo_total_quantidade >= minimo_total_quantidade);
  end if;
end
$$;

create or replace function public.zelomenu_whatsapp_minute_in_windows_v1(
  p_windows jsonb,
  p_minute integer
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(bool_or(
    case
      when start_minute < end_minute then p_minute between start_minute and end_minute
      when start_minute > end_minute then p_minute >= start_minute or p_minute <= end_minute
      when start_minute = 0 and end_minute = 0 then true
      else false
    end
  ), false)
  from (
    select
      case
        when slot->>'start' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          then split_part(slot->>'start', ':', 1)::integer * 60
             + split_part(slot->>'start', ':', 2)::integer
        else null
      end as start_minute,
      case
        when slot->>'end' = '24:00' then 1440
        when slot->>'end' = '00:00' and slot->>'start' <> '00:00' then 1440
        when slot->>'end' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          then split_part(slot->>'end', ':', 1)::integer * 60
             + split_part(slot->>'end', ':', 2)::integer
        else null
      end as end_minute
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_windows) = 'array' then p_windows
        when jsonb_typeof(p_windows->'windows') = 'array' then p_windows->'windows'
        else '[]'::jsonb
      end
    ) as item(slot)
  ) parsed
  where start_minute is not null and end_minute is not null
$$;

create or replace function public.zelomenu_whatsapp_fulfillment_v1(
  p_empresa_id uuid,
  p_session_id uuid,
  p_fulfillment jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ep public.empresa_perfil;
  v_issues jsonb := '[]'::jsonb;
  v_fulfillment jsonb := coalesce(p_fulfillment, '{}'::jsonb);
  v_timezone text;
  v_local timestamp;
  v_local_minute integer;
  v_day_of_week integer;
  v_day_key text;
  v_closed_label text;
  v_windows jsonb;
  v_has_weekly boolean;
  v_open boolean := false;
  v_asap boolean := false;
  v_pickup_at timestamptz;
  v_start integer;
  v_end integer;
  v_delivery_status text;
  v_distance integer;
  v_fee numeric(10,2) := 0;
  v_stored_fee numeric(10,2) := 0;
  v_range_max integer;
  v_rule record;
  v_rule_fee numeric(10,2);
  v_pricing_mode text;
  v_pricing_label text;
  v_fresh_quote boolean := false;
begin
  select * into ep from public.empresa_perfil where id = p_empresa_id;
  if not found then
    return jsonb_build_object(
      'fulfillment', v_fulfillment,
      'deliveryFee', 0,
      'issues', jsonb_build_array(jsonb_build_object('code', 'store_config_unavailable'))
    );
  end if;

  v_timezone := coalesce(nullif(ep.delivery_config->>'timezone', ''), nullif(ep.timezone, ''), 'America/Sao_Paulo');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    return jsonb_build_object(
      'fulfillment', v_fulfillment,
      'deliveryFee', 0,
      'issues', jsonb_build_array(jsonb_build_object('code', 'store_timezone_invalid'))
    );
  end if;

  v_asap := coalesce(v_fulfillment->>'asap', 'false') = 'true';
  begin
    if v_asap then
      v_local := p_now at time zone v_timezone;
    else
      if coalesce(ep.zelomenu_scheduling_enabled, false) = false then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'scheduling_disabled'));
      end if;
      if coalesce(v_fulfillment->>'pickupDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(v_fulfillment->>'pickupTime', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'pickup_datetime_invalid'));
        v_local := p_now at time zone v_timezone;
      else
        v_local := ((v_fulfillment->>'pickupDate') || ' ' || (v_fulfillment->>'pickupTime'))::timestamp;
        v_pickup_at := v_local at time zone v_timezone;
        if v_pickup_at < p_now + make_interval(mins => greatest(coalesce(ep.zelomenu_scheduling_lead_time_minutes, 0), 0)) then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'pickup_lead_time'));
        end if;
      end if;
    end if;
  exception when others then
    v_local := p_now at time zone v_timezone;
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'pickup_datetime_invalid'));
  end;

  v_local_minute := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_day_of_week := extract(dow from v_local)::integer;
  v_day_key := (array['sun','mon','tue','wed','thu','fri','sat'])[v_day_of_week + 1];
  v_closed_label := (array['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[v_day_of_week + 1];
  v_has_weekly := jsonb_typeof(ep.horario_semanal) = 'object' and exists (
    select 1
      from jsonb_each(ep.horario_semanal) day_entry
     where jsonb_array_length(
       case
         when jsonb_typeof(day_entry.value) = 'array' then day_entry.value
         when jsonb_typeof(day_entry.value->'windows') = 'array' then day_entry.value->'windows'
         else '[]'::jsonb
       end
     ) > 0
  );

  if v_has_weekly then
    v_windows := ep.horario_semanal->v_day_key;
    v_open := public.zelomenu_whatsapp_minute_in_windows_v1(v_windows, v_local_minute);
  elsif ep.horario_abertura is null or ep.horario_fechamento is null then
    -- This is the canonical legacy behavior: an unconfigured hours profile
    -- does not invent a closed day, but it is read live under the profile lock.
    v_open := true;
  elsif v_closed_label = any(coalesce(ep.dias_fechamento, array[]::text[])) then
    v_open := false;
  else
    if ep.horario_abertura !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       or ep.horario_fechamento !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      v_open := false;
    else
      v_start := split_part(ep.horario_abertura, ':', 1)::integer * 60
        + split_part(ep.horario_abertura, ':', 2)::integer;
      v_end := split_part(ep.horario_fechamento, ':', 1)::integer * 60
        + split_part(ep.horario_fechamento, ':', 2)::integer;
      v_open := case
        when v_start < v_end then v_local_minute between v_start and v_end
        when v_start > v_end then v_local_minute >= v_start or v_local_minute <= v_end
        else false
      end;
    end if;
  end if;
  if not v_open then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', case when v_asap then 'store_closed' else 'pickup_outside_hours' end
    ));
  end if;

  if coalesce(v_fulfillment->>'type', 'pickup') <> 'delivery' then
    return jsonb_build_object('fulfillment', v_fulfillment, 'deliveryFee', 0, 'issues', v_issues);
  end if;

  v_delivery_status := coalesce(v_fulfillment->>'deliveryStatus', '');
  if v_delivery_status <> 'eligible'
     or coalesce(v_fulfillment->>'deliveryFeeToConfirm', 'false') = 'true' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_revalidation_required'));
  end if;
  if coalesce(ep.delivery_config->>'enabled', 'false') <> 'true'
     or ep.delivery_latitude is null or ep.delivery_longitude is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_unavailable'));
  end if;
  if coalesce(v_fulfillment->>'deliveryDistanceM', '') !~ '^\d+$'
     or coalesce(v_fulfillment->>'deliveryLatitude', '') !~ '^-?\d+(?:\.\d+)?$'
     or coalesce(v_fulfillment->>'deliveryLongitude', '') !~ '^-?\d+(?:\.\d+)?$' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_quote_invalid'));
    v_distance := null;
  else
    v_distance := (v_fulfillment->>'deliveryDistanceM')::integer;
  end if;

  if v_distance is not null then
    select exists (
      select 1
        from public.zelomenu_delivery_distance_cache cache
       where cache.company_id = p_empresa_id
         and cache.origin_location_version = ep.delivery_location_version
         and cache.distance_m = v_distance
         and abs(cache.latitude - (v_fulfillment->>'deliveryLatitude')::double precision) < 0.0000001
         and abs(cache.longitude - (v_fulfillment->>'deliveryLongitude')::double precision) < 0.0000001
         and cache.is_stale = false
         and cache.expires_at > p_now
    ) or exists (
      select 1
        from public.zelomenu_delivery_quote_requests request
       where request.id = case
         when coalesce(v_fulfillment->>'deliveryQuoteRequestId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           then (v_fulfillment->>'deliveryQuoteRequestId')::uuid
         else null
         end
         and request.company_id = p_empresa_id
         and request.session_id = p_session_id
         and request.status = 'resolved'
         and request.expires_at > p_now
         and case
           when coalesce(request.resolved_snapshot->>'originLocationVersion', '') ~ '^\d+$'
             then (request.resolved_snapshot->>'originLocationVersion')::bigint
           else -1
         end = ep.delivery_location_version
         and request.resolved_fee = case
           when coalesce(v_fulfillment->>'deliveryFee', '') ~ '^\d+(?:\.\d+)?$'
             then (v_fulfillment->>'deliveryFee')::numeric
           else -1
         end
         and case
           when coalesce(request.resolved_snapshot->>'distanceM', '') ~ '^\d+$'
             then (request.resolved_snapshot->>'distanceM')::integer
           else -1
         end = v_distance
    ) into v_fresh_quote;
    if not v_fresh_quote then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_quote_stale'));
    end if;

    select delivery.max_distance_m, delivery.delivery_price
      into v_range_max, v_fee
      from public.zelomenu_delivery_ranges delivery
     where delivery.company_id = p_empresa_id
       and delivery.max_distance_m >= v_distance
     order by delivery.max_distance_m
     limit 1;
    if not found then
      v_fee := 0;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_out_of_area'));
    else
      if exists (
        select 1 from public.zelomenu_delivery_pricing_rules
         where company_id = p_empresa_id
      ) then
        v_pricing_mode := 'standard';
      end if;
      select rule.id, rule.label
        into v_rule
        from public.zelomenu_delivery_pricing_rules rule
       where rule.company_id = p_empresa_id
         and rule.enabled = true
         and v_day_of_week = any(rule.days_of_week)
         and case
           when rule.start_minute < rule.end_minute
             then v_local_minute >= rule.start_minute and v_local_minute < rule.end_minute
           when rule.start_minute > rule.end_minute
             then v_local_minute >= rule.start_minute or v_local_minute < rule.end_minute
           else false
         end
       order by rule.created_at, rule.id
       limit 1;
      if found then
        select rule_range.delivery_price
          into v_rule_fee
          from public.zelomenu_delivery_pricing_rule_ranges rule_range
         where rule_range.pricing_rule_id = v_rule.id
           and rule_range.max_distance_m = v_range_max;
        if found then
          v_fee := v_rule_fee;
          v_pricing_mode := 'custom_time';
          v_pricing_label := v_rule.label;
        end if;
      end if;
    end if;
  end if;

  v_stored_fee := case
    when coalesce(v_fulfillment->>'deliveryFee', '') ~ '^\d+(?:\.\d+)?$'
      then (v_fulfillment->>'deliveryFee')::numeric
    else 0
  end;
  if v_stored_fee is distinct from v_fee
     or coalesce(v_fulfillment->>'deliveryPricingMode', '') is distinct from coalesce(v_pricing_mode, '')
     or coalesce(v_fulfillment->>'deliveryPricingRuleLabel', '') is distinct from coalesce(v_pricing_label, '') then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_quote_changed'));
  end if;

  v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFee}', to_jsonb(v_fee), true);
  v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFeeToConfirm}', 'false'::jsonb, true);
  v_fulfillment := jsonb_set(v_fulfillment, '{deliveryStatus}', to_jsonb('eligible'::text), true);
  if v_pricing_mode is null then
    v_fulfillment := v_fulfillment - 'deliveryPricingMode';
  else
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryPricingMode}', to_jsonb(v_pricing_mode), true);
  end if;
  v_fulfillment := jsonb_set(v_fulfillment, '{deliveryPricingRuleLabel}', to_jsonb(v_pricing_label), true);
  return jsonb_build_object('fulfillment', v_fulfillment, 'deliveryFee', v_fee, 'issues', v_issues);
end
$$;

create or replace function public.zelomenu_whatsapp_materialize_cart_v1(
  p_empresa_id uuid,
  p_cart jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_item jsonb;
  v_item_quantity integer;
  v_product record;
  v_group record;
  v_group_input jsonb;
  v_option record;
  v_selected_options jsonb;
  v_selected_groups jsonb;
  v_cart jsonb := jsonb_build_object(
    'items', '[]'::jsonb,
    'observations', case when p_cart ? 'observations' then p_cart->'observations' else 'null'::jsonb end
  );
  v_requirements jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_item_issues integer;
  v_distinct_count integer;
  v_total_quantity integer;
  v_option_count integer;
  v_additions numeric(14,2);
  v_base_override numeric(14,2);
  v_base_price numeric(14,2);
  v_unit_price numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_stock record;
begin
  select user_id into v_owner from public.empresa_perfil where id = p_empresa_id;
  if not found then
    return jsonb_build_object('cart', v_cart, 'subtotal', 0, 'issues',
      jsonb_build_array(jsonb_build_object('code', 'store_config_unavailable')), 'requirements', v_requirements);
  end if;
  if jsonb_typeof(p_cart->'items') <> 'array'
     or jsonb_array_length(p_cart->'items') not between 1 and 50 then
    return jsonb_build_object('cart', v_cart, 'subtotal', 0, 'issues',
      jsonb_build_array(jsonb_build_object('code', 'items_invalid')), 'requirements', v_requirements);
  end if;

  for v_item in select value from jsonb_array_elements(p_cart->'items') loop
    v_item_issues := jsonb_array_length(v_issues);
    if coalesce(v_item->>'productId', '') !~ '^\d+$'
       or coalesce(v_item->>'quantity', '') !~ '^[1-9]\d{0,2}$' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'item_invalid'));
      continue;
    end if;
    v_item_quantity := (v_item->>'quantity')::integer;

    select p.id, p.preco, p.controlar_estoque, p.estoque_atual,
           coalesce(nullif(btrim(pub.nome_publico), ''), p.nome) as public_name
      into v_product
      from public.produtos p
      join public.empresa_perfil profile on profile.id = p_empresa_id and profile.user_id = p.id_usuario
      join public.categorias category on category.id = p.id_categoria and category.id_usuario = p.id_usuario
      join public.zelomenu_product_publications pub
        on pub.id_produto = p.id and pub.id_usuario = p.id_usuario
       and pub.visivel_online = true and pub.pausado_manualmente = false
     where p.id = (v_item->>'productId')::bigint;
    if not found or (coalesce(v_product.controlar_estoque, false) and coalesce(v_product.estoque_atual, 0) <= 0) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'product_unavailable', 'productId', v_item->>'productId'
      ));
      continue;
    end if;

    if jsonb_typeof(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) <> 'array' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_invalid', 'productId', v_product.id));
      continue;
    end if;
    if exists (
      select 1
        from jsonb_array_elements(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) chosen
        left join public.zelomenu_modifier_groups known
          on known.id = case
            when chosen->>'groupId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (chosen->>'groupId')::uuid
            else null
          end
         and known.id_produto = v_product.id and known.id_usuario = v_owner and known.ativo = true
       where known.id is null or jsonb_typeof(chosen->'selectedOptions') <> 'array'
    ) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_unavailable', 'productId', v_product.id));
      continue;
    end if;

    if exists (
      select 1
        from public.zelomenu_modifier_groups required_group
       where required_group.id_produto = v_product.id
         and required_group.id_usuario = v_owner
         and required_group.ativo = true
         and required_group.min_selecoes > 0
         and (
           select count(*)
             from public.zelomenu_modifier_options available_option
             left join public.zelomenu_modifier_option_products link
               on link.id_opcao = available_option.id and link.id_usuario = v_owner
             left join public.produtos linked_product
               on linked_product.id = link.id_produto and linked_product.id_usuario = v_owner
            where available_option.id_grupo = required_group.id
              and available_option.id_usuario = v_owner
              and available_option.ativo = true
              and (link.id_opcao is null or (
                linked_product.id is not null
                and (not coalesce(linked_product.controlar_estoque, false) or coalesce(linked_product.estoque_atual, 0) > 0)
              ))
         ) < required_group.min_selecoes
    ) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'required_group_unavailable', 'productId', v_product.id
      ));
      continue;
    end if;

    v_selected_groups := '[]'::jsonb;
    v_additions := 0;
    v_base_override := null;
    for v_group in
      select g.*
        from public.zelomenu_modifier_groups g
       where g.id_produto = v_product.id and g.id_usuario = v_owner and g.ativo = true
       order by g.ordem, g.id
    loop
      select jsonb_build_object('selectedOptions', coalesce(jsonb_agg(option_input order by group_ord, option_ord), '[]'::jsonb))
        into v_group_input
        from (
          select option_input, group_ord, option_ord
            from jsonb_array_elements(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) with ordinality chosen(group_input, group_ord)
            cross join lateral jsonb_array_elements(chosen.group_input->'selectedOptions') with ordinality options(option_input, option_ord)
           where chosen.group_input->>'groupId' = v_group.id::text
        ) selected;

      if exists (
        select 1
          from jsonb_array_elements(v_group_input->'selectedOptions') raw(option_input)
          left join public.zelomenu_modifier_options o
            on o.id = case
              when raw.option_input->>'optionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (raw.option_input->>'optionId')::uuid
              else null
            end
           and o.id_grupo = v_group.id and o.id_usuario = v_owner and o.ativo = true
          left join public.zelomenu_modifier_option_products link
            on link.id_opcao = o.id and link.id_usuario = v_owner
          left join public.produtos linked_product
            on linked_product.id = link.id_produto and linked_product.id_usuario = v_owner
         where o.id is null
            or coalesce(raw.option_input->>'quantity', '') !~ '^[1-9]\d{0,8}$'
            or (not v_group.permite_quantidade and case
              when coalesce(raw.option_input->>'quantity', '') ~ '^[1-9]\d{0,8}$'
                then (raw.option_input->>'quantity')::integer <> 1
              else true
            end)
            or (link.id_opcao is not null and (
              linked_product.id is null
              or (coalesce(linked_product.controlar_estoque, false) and coalesce(linked_product.estoque_atual, 0) <= 0)
            ))
      ) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_unavailable', 'productId', v_product.id));
        exit;
      end if;

      select count(distinct option_input->>'optionId')
        into v_distinct_count
        from jsonb_array_elements(v_group_input->'selectedOptions') raw(option_input);
      if v_distinct_count < v_group.min_selecoes
         or (v_group.max_selecoes is not null and v_distinct_count > v_group.max_selecoes) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_selection_bounds', 'productId', v_product.id));
        exit;
      end if;

      select coalesce(sum((option_input->>'quantity')::integer), 0)::integer
        into v_total_quantity
        from jsonb_array_elements(v_group_input->'selectedOptions') selected(option_input);
      if v_total_quantity < v_group.minimo_total_quantidade
         or (v_group.maximo_total_quantidade is not null
             and v_total_quantity > v_group.maximo_total_quantidade) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'modifier_total_quantity_bounds', 'productId', v_product.id,
          'groupId', v_group.id, 'selectedQuantity', v_total_quantity,
          'minimumQuantity', v_group.minimo_total_quantidade,
          'maximumQuantity', v_group.maximo_total_quantidade
        ));
        exit;
      end if;

      v_selected_options := '[]'::jsonb;
      v_option_count := 0;
      for v_option in
        with raw as (
          select option_input, ordinality
            from jsonb_array_elements(v_group_input->'selectedOptions') with ordinality input(option_input, ordinality)
        )
        select o.id, coalesce(nullif(publication.nome_publico, ''), linked_product.nome, o.nome) as option_name,
               coalesce(link.price_override, linked_product.preco, o.price_delta)::numeric(10,2) as resolved_price,
               sum((raw.option_input->>'quantity')::integer)::integer as quantity,
               min(raw.ordinality) as first_ordinality,
               linked_product.id as linked_product_id
          from raw
          join public.zelomenu_modifier_options o
            on o.id = (raw.option_input->>'optionId')::uuid
           and o.id_grupo = v_group.id and o.id_usuario = v_owner and o.ativo = true
          left join public.zelomenu_modifier_option_products link
            on link.id_opcao = o.id and link.id_usuario = v_owner
          left join public.produtos linked_product
            on linked_product.id = link.id_produto and linked_product.id_usuario = v_owner
          left join public.zelomenu_product_publications publication
            on publication.id_produto = linked_product.id and publication.id_usuario = v_owner
         group by o.id, publication.nome_publico, linked_product.nome, o.nome,
                  link.price_override, linked_product.preco, o.price_delta, linked_product.id
         order by min(raw.ordinality)
      loop
        if (not v_group.permite_quantidade and v_option.quantity <> 1)
           or (v_group.maximo_por_opcao is not null and v_option.quantity > v_group.maximo_por_opcao) then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_quantity_invalid', 'productId', v_product.id));
          exit;
        end if;
        v_selected_options := v_selected_options || jsonb_build_array(jsonb_build_object(
          'optionId', v_option.id,
          'optionName', v_option.option_name,
          'priceDelta', v_option.resolved_price,
          'quantity', v_option.quantity
        ));
        v_option_count := v_option_count + 1;
        if v_group.modo_preco = 'substituir' then
          v_base_override := v_option.resolved_price;
        else
          v_additions := v_additions + v_option.resolved_price * v_option.quantity;
        end if;
        if v_option.linked_product_id is not null then
          v_requirements := v_requirements || jsonb_build_array(jsonb_build_object(
            'product_id', v_option.linked_product_id,
            'linked_product_id', v_option.linked_product_id,
            'required_quantity', v_option.quantity * v_item_quantity
          ));
        end if;
      end loop;
      if jsonb_array_length(v_issues) > v_item_issues then exit; end if;
      if v_option_count > 0 then
        v_selected_groups := v_selected_groups || jsonb_build_array(jsonb_build_object(
          'groupId', v_group.id,
          'groupName', v_group.nome,
          'kind', v_group.tipo,
          'selectedOptions', v_selected_options
        ));
      end if;
    end loop;
    if jsonb_array_length(v_issues) > v_item_issues then continue; end if;

    v_base_price := v_product.preco;
    v_unit_price := round(coalesce(v_base_override, v_base_price) + v_additions, 2);
    v_line_total := round(v_unit_price * v_item_quantity, 2);
    v_cart := jsonb_set(v_cart, '{items}', (v_cart->'items') || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'productName', v_product.public_name,
      'baseUnitPrice', v_base_price,
      'selectedModifiers', v_selected_groups,
      'modifierDeltaTotal', round(v_unit_price - v_base_price, 2),
      'quantity', v_item_quantity,
      'unitPrice', v_unit_price,
      'lineTotal', v_line_total,
      'notes', nullif(btrim(left(v_item->>'notes', 200)), '')
    )));
    v_subtotal := v_subtotal + v_line_total;
    v_requirements := v_requirements || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'linked_product_id', null,
      'required_quantity', v_item_quantity
    ));
  end loop;

  for v_stock in
    select p.id, p.controlar_estoque, p.estoque_atual,
           sum(requirement.required_quantity)::numeric as required_quantity,
           bool_or(requirement.linked_product_id is not null) as includes_linked
      from jsonb_to_recordset(v_requirements) as requirement(
        product_id bigint,
        linked_product_id bigint,
        required_quantity numeric
      )
      join public.produtos p on p.id = requirement.product_id and p.id_usuario = v_owner
     group by p.id, p.controlar_estoque, p.estoque_atual
  loop
    if coalesce(v_stock.controlar_estoque, false)
       and coalesce(v_stock.estoque_atual, 0) < v_stock.required_quantity then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'stock_unavailable',
        'productId', v_stock.id,
        'requiredQuantity', v_stock.required_quantity,
        'availableQuantity', coalesce(v_stock.estoque_atual, 0),
        'linked', v_stock.includes_linked
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'cart', v_cart,
    'subtotal', round(v_subtotal, 2),
    'issues', v_issues,
    'requirements', v_requirements
  );
end
$$;

create or replace function public.confirm_whatsapp_zelo_order_atomic_v1(
  p_empresa_id uuid,
  p_source_ref text,
  p_session_id uuid,
  p_expected_revision integer,
  p_message_id text,
  p_idempotency_key text,
  p_pessoa_id uuid,
  p_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_role boolean := coalesce(current_setting('role', true) = 'service_role', false);
  s public.zelomenu_cart_sessions;
  v_token public.zelomenu_whatsapp_confirmation_tokens;
  v_order public.zelo_orders;
  v_lock record;
  v_materialized jsonb;
  v_fulfillment_result jsonb;
  v_cart jsonb;
  v_fulfillment jsonb;
  v_pricing jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_subtotal numeric(14,2);
  v_delivery_fee numeric(14,2);
  v_discount numeric(14,2);
  v_result jsonb;
  v_message_ids jsonb;
  v_changed boolean;
  v_updated integer;
begin
  if not v_service_role then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_empresa_id is null or p_session_id is null
     or nullif(trim(p_source_ref), '') is null
     or p_expected_revision is null or p_expected_revision <= 0
     or nullif(trim(p_message_id), '') is null
     or nullif(trim(p_idempotency_key), '') is null
     or (p_token_hash is not null and lower(p_token_hash) !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = 'ZL400', message = 'WHATSAPP_CONFIRMATION_INPUT_INVALID';
  end if;

  -- Universal lock order: cart session before optional confirmation token.
  select * into s
    from public.zelomenu_cart_sessions
   where id = p_session_id
   for update;
  if not found or s.context <> 'whatsapp_order'
     or s.empresa_id <> p_empresa_id or s.source_ref <> p_source_ref then
    return jsonb_build_object('outcome', 'conflict', 'revision', coalesce(s.revision, null), 'snapshot', to_jsonb(s));
  end if;

  select * into v_order
    from public.zelo_orders
   where zelomenu_session_id = s.id
   for update;
  if found then
    return jsonb_build_object(
      'outcome', 'confirmed', 'alreadyConfirmed', true,
      'orderId', v_order.id, 'revision', s.revision, 'snapshot', to_jsonb(s)
    );
  end if;
  if s.state <> 'cart_open' or s.revision <> p_expected_revision then
    return jsonb_build_object('outcome', 'conflict', 'revision', s.revision, 'snapshot', to_jsonb(s));
  end if;

  if p_token_hash is not null then
    select * into v_token
      from public.zelomenu_whatsapp_confirmation_tokens
     where token_hash = lower(p_token_hash)
       and session_id = s.id
     for update;
    if not found or v_token.empresa_id <> p_empresa_id or v_token.source_ref <> p_source_ref
       or v_token.revision <> p_expected_revision or v_token.consumed_at is not null
       or v_token.invalidated_at is not null or v_token.expires_at <= now() then
      raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_INVALID';
    end if;
  end if;

  -- Lock every mutable fact consumed below. Each table is locked in a stable
  -- table/id order; the profile lock covers hours, scheduling and delivery config.
  perform 1 from public.empresa_perfil where id = p_empresa_id for update;
  for v_lock in
    select p.id
      from public.produtos p
      join public.empresa_perfil ep on ep.id = p_empresa_id and ep.user_id = p.id_usuario
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and p.id = (item->>'productId')::bigint
     order by p.id for update of p
  loop null; end loop;
  for v_lock in
    select category.id
      from public.categorias category
      join public.produtos p on p.id_categoria = category.id and p.id_usuario = category.id_usuario
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and p.id = (item->>'productId')::bigint
     order by category.id for update of category
  loop null; end loop;
  for v_lock in
    select publication.id
      from public.zelomenu_product_publications publication
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and publication.id_produto = (item->>'productId')::bigint
     where publication.id_usuario = (select user_id from public.empresa_perfil where id = p_empresa_id)
     order by publication.id for update of publication
  loop null; end loop;
  for v_lock in
    select modifier_group.id
      from public.zelomenu_modifier_groups modifier_group
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and modifier_group.id_produto = (item->>'productId')::bigint
     where modifier_group.id_usuario = (select user_id from public.empresa_perfil where id = p_empresa_id)
     order by modifier_group.id for update of modifier_group
  loop null; end loop;
  for v_lock in
    select modifier_option.id
      from public.zelomenu_modifier_options modifier_option
      join public.zelomenu_modifier_groups modifier_group on modifier_group.id = modifier_option.id_grupo
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and modifier_group.id_produto = (item->>'productId')::bigint
     where modifier_option.id_usuario = (select user_id from public.empresa_perfil where id = p_empresa_id)
     order by modifier_option.id for update of modifier_option
  loop null; end loop;
  for v_lock in
    select link.id_opcao
      from public.zelomenu_modifier_option_products link
      join public.zelomenu_modifier_options modifier_option on modifier_option.id = link.id_opcao
      join public.zelomenu_modifier_groups modifier_group on modifier_group.id = modifier_option.id_grupo
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and modifier_group.id_produto = (item->>'productId')::bigint
     where link.id_usuario = (select user_id from public.empresa_perfil where id = p_empresa_id)
     order by link.id_opcao for update of link
  loop null; end loop;
  for v_lock in
    select linked_product.id
      from public.produtos linked_product
      join public.zelomenu_modifier_option_products link on link.id_produto = linked_product.id
      join public.zelomenu_modifier_options modifier_option on modifier_option.id = link.id_opcao
      join public.zelomenu_modifier_groups modifier_group on modifier_group.id = modifier_option.id_grupo
      join jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb)) item
        on item->>'productId' ~ '^\d+$' and modifier_group.id_produto = (item->>'productId')::bigint
     where linked_product.id_usuario = (select user_id from public.empresa_perfil where id = p_empresa_id)
     order by linked_product.id for update of linked_product
  loop null; end loop;
  for v_lock in select id from public.zelomenu_delivery_ranges where company_id = p_empresa_id order by id for update loop null; end loop;
  for v_lock in select id from public.zelomenu_delivery_pricing_rules where company_id = p_empresa_id order by id for update loop null; end loop;
  for v_lock in
    select rule_range.id
      from public.zelomenu_delivery_pricing_rule_ranges rule_range
      join public.zelomenu_delivery_pricing_rules rule on rule.id = rule_range.pricing_rule_id
     where rule.company_id = p_empresa_id order by rule_range.id for update of rule_range
  loop null; end loop;
  for v_lock in select id from public.zelomenu_delivery_distance_cache where company_id = p_empresa_id order by id for update loop null; end loop;
  if coalesce(s.fulfillment_snapshot->>'deliveryQuoteRequestId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    perform 1 from public.zelomenu_delivery_quote_requests
     where id = (s.fulfillment_snapshot->>'deliveryQuoteRequestId')::uuid
       and company_id = p_empresa_id
       and session_id = s.id
     for update;
  end if;

  v_materialized := public.zelomenu_whatsapp_materialize_cart_v1(p_empresa_id, s.cart_snapshot);
  v_cart := v_materialized->'cart';
  v_subtotal := coalesce((v_materialized->>'subtotal')::numeric, 0);
  v_issues := v_issues || coalesce(v_materialized->'issues', '[]'::jsonb);

  v_fulfillment_result := public.zelomenu_whatsapp_fulfillment_v1(
    p_empresa_id, s.id, s.fulfillment_snapshot, now()
  );
  v_fulfillment := v_fulfillment_result->'fulfillment';
  v_delivery_fee := coalesce((v_fulfillment_result->>'deliveryFee')::numeric, 0);
  v_issues := v_issues || coalesce(v_fulfillment_result->'issues', '[]'::jsonb);

  v_discount := case
    when coalesce(s.pricing_snapshot->>'discount', '') ~ '^\d+(?:\.\d+)?$'
      then (s.pricing_snapshot->>'discount')::numeric
    else 0
  end;
  v_pricing := jsonb_build_object(
    'subtotal', round(v_subtotal, 2),
    'deliveryFee', round(v_delivery_fee, 2),
    'discount', round(v_discount, 2),
    'couponCode', case when s.pricing_snapshot ? 'couponCode' then s.pricing_snapshot->'couponCode' else 'null'::jsonb end,
    'couponDiscountType', case when s.pricing_snapshot ? 'couponDiscountType' then s.pricing_snapshot->'couponDiscountType' else 'null'::jsonb end,
    'couponDiscountValue', case when s.pricing_snapshot ? 'couponDiscountValue' then s.pricing_snapshot->'couponDiscountValue' else 'null'::jsonb end,
    'total', round(v_subtotal + v_delivery_fee - v_discount, 2)
  );
  v_changed := s.cart_snapshot is distinct from v_cart
    or s.fulfillment_snapshot is distinct from v_fulfillment
    or s.pricing_snapshot is distinct from v_pricing
    or jsonb_array_length(v_issues) > 0;
  if v_changed then
    v_message_ids := coalesce(s.metadata->'processedMessageIds', '[]'::jsonb) || to_jsonb(p_message_id);
    update public.zelomenu_cart_sessions
       set cart_snapshot = v_cart,
           fulfillment_snapshot = v_fulfillment,
           pricing_snapshot = v_pricing,
           last_revalidated_at = now(),
           last_revalidation = jsonb_build_object(
             'checkedAt', now(), 'ok', false, 'issues', v_issues,
             'previewCart', v_cart, 'previewFulfillment', v_fulfillment, 'previewPricing', v_pricing
           ),
           metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object('processedMessageIds', v_message_ids),
           revision = s.revision + 1,
           updated_at = now()
     where id = s.id and revision = s.revision;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      return jsonb_build_object('outcome', 'conflict', 'revision', s.revision, 'snapshot', to_jsonb(s));
    end if;
    if p_token_hash is not null then
      update public.zelomenu_whatsapp_confirmation_tokens
         set invalidated_at = now()
       where id = v_token.id and invalidated_at is null and consumed_at is null;
    end if;
    return jsonb_build_object(
      'outcome', 'requires_review', 'alreadyConfirmed', false,
      'revision', s.revision + 1, 'issues', v_issues,
      'cart', v_cart, 'fulfillment', v_fulfillment, 'pricing', v_pricing
    );
  end if;

  v_result := public.create_zelo_order(s.id, s.revision, p_idempotency_key, '{}'::jsonb, p_pessoa_id);
  update public.zelomenu_cart_sessions
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'processedMessageIds', coalesce(metadata->'processedMessageIds', '[]'::jsonb) || to_jsonb(p_message_id)
         ), updated_at = now()
   where id = s.id;
  if p_token_hash is not null then
    update public.zelomenu_whatsapp_confirmation_tokens
       set consumed_at = coalesce(consumed_at, now())
     where id = v_token.id;
  end if;
  return jsonb_build_object(
    'outcome', 'confirmed',
    'alreadyConfirmed', coalesce((v_result->>'alreadyConfirmed')::boolean, false),
    'orderId', v_result->>'orderId',
    'revision', s.revision
  );
end
$$;

comment on function public.zelomenu_whatsapp_materialize_cart_v1(uuid, jsonb) is
  'Rematerializa o shape canônico do carrinho WhatsApp por IDs vivos, incluindo modifiers aninhados, linked products e requisitos de estoque agregáveis.';
comment on function public.zelomenu_whatsapp_fulfillment_v1(uuid, uuid, jsonb, timestamptz) is
  'Revalida horário ASAP/agendado e entrega contra configuração, cache, cobertura e preço vigentes.';
comment on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text) is
  'Confirmação WhatsApp atômica server-only: lock sessão→token→catálogo/config, rematerialização canônica e criação exclusiva via create_zelo_order.';

revoke all on function public.zelomenu_whatsapp_minute_in_windows_v1(jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.zelomenu_whatsapp_materialize_cart_v1(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.zelomenu_whatsapp_fulfillment_v1(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.zelomenu_whatsapp_minute_in_windows_v1(jsonb, integer) to service_role;
grant execute on function public.zelomenu_whatsapp_materialize_cart_v1(uuid, jsonb) to service_role;
grant execute on function public.zelomenu_whatsapp_fulfillment_v1(uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text)
  to service_role;
