-- Fix runtime record ->> errors for non-empty delivery pricing rules.
-- Preserve the deployed function body, signature, SECURITY DEFINER and ACLs.
-- The six-argument overload delegates to this function.
CREATE OR REPLACE FUNCTION public.save_zelomenu_delivery_settings(p_empresa_id uuid, p_enabled boolean, p_address jsonb, p_ranges jsonb, p_pricing_rules jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_address jsonb := coalesce(p_address, '{}'::jsonb);
  v_postal text := regexp_replace(coalesce(v_address->>'postalCode', ''), '[^0-9]', '', 'g');
  v_number text := trim(coalesce(v_address->>'number', ''));
  v_complement text := nullif(trim(coalesce(v_address->>'complement', '')), '');
  v_street text := nullif(trim(coalesce(v_address->>'street', '')), '');
  v_neighborhood text := nullif(trim(coalesce(v_address->>'neighborhood', '')), '');
  v_city text := nullif(trim(coalesce(v_address->>'city', '')), '');
  v_state text := upper(nullif(trim(coalesce(v_address->>'state', '')), ''));
  v_lat double precision := nullif(v_address->>'latitude', '')::double precision;
  v_lng double precision := nullif(v_address->>'longitude', '')::double precision;
  v_old_lat double precision;
  v_old_lng double precision;
  v_old_version bigint;
  v_ranges jsonb := coalesce(p_ranges, '[]'::jsonb);
  v_pricing_rules jsonb := coalesce(p_pricing_rules, '[]'::jsonb);
  v_current_config jsonb;
  v_rule jsonb;
  v_rule_id uuid;
begin
  if jsonb_typeof(v_address) <> 'object' or jsonb_typeof(v_ranges) <> 'array' or jsonb_typeof(v_pricing_rules) <> 'array' then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if p_enabled and (
    v_postal !~ '^[0-9]{8}$' or v_number = '' or v_street is null or v_city is null or
    v_state is null or v_state !~ '^[A-Z]{2}$' or v_lat is null or v_lng is null or
    v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 or
    jsonb_array_length(v_ranges) = 0
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if v_lat is not null and v_lng is null or v_lat is null and v_lng is not null then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) as range_item
    where coalesce((range_item->>'maxDistanceM')::numeric, 0) <= 0
       or coalesce((range_item->>'maxDistanceM')::numeric, 0) <> trunc((range_item->>'maxDistanceM')::numeric)
       or coalesce((range_item->>'price')::numeric, -1) < 0
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) as a
    join jsonb_array_elements(v_ranges) as b
      on (a->>'maxDistanceM') = (b->>'maxDistanceM')
     and a is distinct from b
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  -- Validate pricing rules
  if jsonb_array_length(v_pricing_rules) > 0 then
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as rule
      where nullif(trim(rule->>'label'), '') is null
         or (rule->>'startMinute')::int is null
         or (rule->>'endMinute')::int is null
         or (rule->>'startMinute')::int = (rule->>'endMinute')::int
         or (rule->>'startMinute')::int < 0
         or (rule->>'startMinute')::int >= 1440
         or (rule->>'endMinute')::int < 0
         or (rule->>'endMinute')::int > 1440
         or jsonb_array_length(rule->'pricesByDistance') = 0
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RULE_INVALID';
    end if;

    -- Validate rule overlaps (defense-in-depth; domain validation is primary)
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as a
      join jsonb_array_elements(v_pricing_rules) as b on a::text < b::text
      where (
        -- Two intervals overlap iff one's start is inside the other's interval
        -- Standard interval (start < end): contains if start <= point < end
        -- Midnight-crossing (start > end): contains if point >= start or point < end
        (
          (b->>'startMinute')::int < (b->>'endMinute')::int
          and (a->>'startMinute')::int >= (b->>'startMinute')::int
          and (a->>'startMinute')::int < (b->>'endMinute')::int
        ) or (
          (b->>'startMinute')::int > (b->>'endMinute')::int
          and ((a->>'startMinute')::int >= (b->>'startMinute')::int
            or (a->>'startMinute')::int < (b->>'endMinute')::int)
        ) or
        (
          (a->>'startMinute')::int < (a->>'endMinute')::int
          and (b->>'startMinute')::int >= (a->>'startMinute')::int
          and (b->>'startMinute')::int < (a->>'endMinute')::int
        ) or (
          (a->>'startMinute')::int > (a->>'endMinute')::int
          and ((b->>'startMinute')::int >= (a->>'startMinute')::int
            or (b->>'startMinute')::int < (a->>'endMinute')::int)
        )
      )
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RULE_OVERLAP';
    end if;

    -- Validate each rule's prices cover all current ranges
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as rule
      cross join jsonb_array_elements(v_ranges) as rng
      where not exists (
        select 1
        from jsonb_array_elements(rule->'pricesByDistance') as p
        where (p->>'maxDistanceM')::int = round((rng->>'maxDistanceM')::numeric)::int
          and (p->>'price')::numeric >= 0
      )
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RANGE_PRICE_MISSING';
    end if;
  end if;

  -- Lock company row and read current state
  select delivery_latitude, delivery_longitude, delivery_location_version, delivery_config
    into v_old_lat, v_old_lng, v_old_version, v_current_config
    from empresa_perfil
   where id = p_empresa_id
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'EMPRESA_NOT_FOUND';
  end if;

  -- Update address and config
  update empresa_perfil
     set delivery_postal_code = nullif(v_postal, ''),
         delivery_number = nullif(v_number, ''),
         delivery_complement = v_complement,
         delivery_street = v_street,
         delivery_neighborhood = v_neighborhood,
         delivery_city = v_city,
         delivery_state = v_state,
         delivery_latitude = v_lat,
         delivery_longitude = v_lng,
         delivery_location_version = case
           when v_old_lat is distinct from v_lat or v_old_lng is distinct from v_lng
             then coalesce(v_old_version, 0) + 1
           else coalesce(v_old_version, 0)
         end,
         delivery_config = jsonb_set(
           jsonb_set(
             coalesce(delivery_config, '{}'::jsonb),
             '{enabled}',
             to_jsonb(coalesce(p_enabled, false)),
             true
           ),
           '{pricingVersion}',
           to_jsonb(coalesce((v_current_config->>'pricingVersion')::int, 0) + 1),
           true
         )
   where id = p_empresa_id;

  -- Replace ranges
  delete from zelomenu_delivery_ranges where company_id = p_empresa_id;

  insert into zelomenu_delivery_ranges(company_id, max_distance_m, delivery_price)
  select p_empresa_id,
         round((range_item->>'maxDistanceM')::numeric)::integer,
         round((range_item->>'price')::numeric, 2)
    from jsonb_array_elements(v_ranges) as range_item;

  -- Replace pricing rules
  delete from zelomenu_delivery_pricing_rules where company_id = p_empresa_id;

  for v_rule in select value from jsonb_array_elements(v_pricing_rules) loop
    insert into zelomenu_delivery_pricing_rules(company_id, label, start_minute, end_minute, enabled, days_of_week)
    values (
      p_empresa_id,
      trim(v_rule->>'label'),
      (v_rule->>'startMinute')::smallint,
      (v_rule->>'endMinute')::smallint,
      coalesce((v_rule->>'enabled')::boolean, true),
      coalesce(
        (select array_agg(d::smallint) from jsonb_array_elements_text(v_rule->'daysOfWeek') as d),
        '{0,1,2,3,4,5,6}'::smallint[]
      )
    )
    returning id into v_rule_id;

    insert into zelomenu_delivery_pricing_rule_ranges(pricing_rule_id, max_distance_m, delivery_price)
    select v_rule_id,
           (p->>'maxDistanceM')::integer,
           round((p->>'price')::numeric, 2)
      from jsonb_array_elements(v_rule->'pricesByDistance') as p;
  end loop;
end;
$function$
;
