-- ZeloMenu delivery hardening
--
-- Keeps delivery configuration atomic, prevents direct client access to the
-- internal delivery tables, and preserves checkout intent when a quote cannot
-- be completed synchronously.

create table if not exists public.zelomenu_delivery_quote_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresa_perfil(id) on delete cascade,
  session_id uuid not null references public.zelomenu_cart_sessions(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'expired', 'cancelled')),
  reason_code text not null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  cart_snapshot jsonb not null default '{}'::jsonb,
  fulfillment_snapshot jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  last_error jsonb,
  resolved_fee numeric(10,2),
  resolved_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  resolved_at timestamptz,
  constraint uq_delivery_quote_request_session_key unique (session_id, idempotency_key)
);
create index if not exists idx_delivery_quote_requests_company_status
  on public.zelomenu_delivery_quote_requests(company_id, status, created_at desc);
create index if not exists idx_delivery_quote_requests_session
  on public.zelomenu_delivery_quote_requests(session_id, created_at desc);
alter table public.zelomenu_delivery_quote_requests enable row level security;
-- The server uses service_role. No browser role should read or mutate delivery
-- cache, ranges, or pending quote records directly.
drop policy if exists service_all_zelomenu_delivery_ranges on public.zelomenu_delivery_ranges;
drop policy if exists authenticated_read_zelomenu_delivery_ranges on public.zelomenu_delivery_ranges;
drop policy if exists authenticated_write_zelomenu_delivery_ranges on public.zelomenu_delivery_ranges;
drop policy if exists block_anon_zelomenu_delivery_ranges on public.zelomenu_delivery_ranges;
create policy block_anon_zelomenu_delivery_ranges on public.zelomenu_delivery_ranges
  as restrictive for all using (false) with check (false);
drop policy if exists service_all_zelomenu_delivery_cep_cache on public.zelomenu_delivery_cep_cache;
drop policy if exists block_anon_zelomenu_delivery_cep_cache on public.zelomenu_delivery_cep_cache;
create policy block_anon_zelomenu_delivery_cep_cache on public.zelomenu_delivery_cep_cache
  as restrictive for all using (false) with check (false);
drop policy if exists service_all_zelomenu_delivery_geocoding_cache on public.zelomenu_delivery_geocoding_cache;
drop policy if exists block_anon_zelomenu_delivery_geocoding_cache on public.zelomenu_delivery_geocoding_cache;
create policy block_anon_zelomenu_delivery_geocoding_cache on public.zelomenu_delivery_geocoding_cache
  as restrictive for all using (false) with check (false);
drop policy if exists service_all_zelomenu_delivery_distance_cache on public.zelomenu_delivery_distance_cache;
drop policy if exists block_anon_zelomenu_delivery_distance_cache on public.zelomenu_delivery_distance_cache;
create policy block_anon_zelomenu_delivery_distance_cache on public.zelomenu_delivery_distance_cache
  as restrictive for all using (false) with check (false);
drop policy if exists block_anon_zelomenu_delivery_quote_requests on public.zelomenu_delivery_quote_requests;
create policy block_anon_zelomenu_delivery_quote_requests on public.zelomenu_delivery_quote_requests
  as restrictive for all using (false) with check (false);
-- One transaction for address, ranges, and enabled state. This prevents the
-- admin page from exposing a half-saved delivery configuration.
create or replace function public.save_zelomenu_delivery_settings(
  p_empresa_id uuid,
  p_enabled boolean,
  p_address jsonb,
  p_ranges jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if jsonb_typeof(v_address) <> 'object' or jsonb_typeof(v_ranges) <> 'array' then
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

  select delivery_latitude, delivery_longitude, delivery_location_version
    into v_old_lat, v_old_lng, v_old_version
    from empresa_perfil
   where id = p_empresa_id
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'EMPRESA_NOT_FOUND';
  end if;

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
         delivery_config = jsonb_set(coalesce(delivery_config, '{}'::jsonb), '{enabled}', to_jsonb(coalesce(p_enabled, false)), true)
   where id = p_empresa_id;

  delete from zelomenu_delivery_ranges where company_id = p_empresa_id;

  insert into zelomenu_delivery_ranges(company_id, max_distance_m, delivery_price)
  select p_empresa_id,
         round((range_item->>'maxDistanceM')::numeric)::integer,
         round((range_item->>'price')::numeric, 2)
    from jsonb_array_elements(v_ranges) as range_item;
end;
$$;
revoke all on function public.save_zelomenu_delivery_settings(uuid, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_zelomenu_delivery_settings(uuid, boolean, jsonb, jsonb) to service_role;
