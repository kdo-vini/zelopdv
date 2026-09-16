-- iFood integration persistence foundation.
-- This schema is intentionally private: only the server-side service_role may
-- enqueue, claim, and finish work. Browser roles must never receive raw
-- provider payloads or queue leases.
begin;

create schema if not exists ifood_internal;

revoke all on schema ifood_internal from public, anon, authenticated;
grant usage on schema ifood_internal to service_role;

alter default privileges for role postgres in schema ifood_internal
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema ifood_internal
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema ifood_internal
  revoke execute on functions from public, anon, authenticated;

create table if not exists ifood_internal.connections (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  status text not null default 'pending',
  print_owner text not null default 'zelo',
  polling_cursor text,
  last_webhook_at timestamptz,
  last_poll_at timestamptz,
  last_token_at timestamptz,
  worker_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_connections_merchant_unique unique (merchant_id),
  constraint ifood_connections_merchant_check check (length(btrim(merchant_id)) between 1 and 200),
  constraint ifood_connections_status_check check (status in ('pending', 'active', 'degraded', 'paused', 'revoked')),
  constraint ifood_connections_print_owner_check check (print_owner in ('zelo', 'external'))
);

create table if not exists ifood_internal.event_inbox (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ifood_internal.connections(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  event_id text not null,
  external_order_id text,
  event_type text not null,
  external_revision bigint not null default 0,
  occurred_at timestamptz,
  payload jsonb not null,
  payload_hash text,
  received_at timestamptz not null default now(),
  payload_expires_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_owner text,
  lease_until timestamptz,
  last_error_code text,
  last_error text,
  dead_lettered_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_event_inbox_event_unique unique (event_id),
  constraint ifood_event_inbox_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint ifood_event_inbox_payload_size_check check (octet_length(payload::text) <= 262144),
  constraint ifood_event_inbox_retention_check check (payload_expires_at <= received_at + interval '7 days'),
  constraint ifood_event_inbox_attempts_check check (attempts >= 0),
  constraint ifood_event_inbox_max_attempts_check check (max_attempts between 1 and 20),
  constraint ifood_event_inbox_error_code_check check (last_error_code is null or length(last_error_code) <= 80),
  constraint ifood_event_inbox_last_error_check check (last_error is null or length(last_error) <= 500),
  constraint ifood_event_inbox_status_check check (status in ('queued', 'processing', 'processed', 'failed_retryable', 'failed_terminal', 'dead_letter'))
);

create table if not exists ifood_internal.order_refs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ifood_internal.connections(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  external_order_id text not null,
  zelo_order_id uuid not null references public.zelo_orders(id) on delete cascade,
  external_revision bigint not null default 0,
  external_status text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_order_refs_merchant_order_unique unique (merchant_id, external_order_id),
  constraint ifood_order_refs_zelo_order_unique unique (zelo_order_id)
);

create table if not exists ifood_internal.order_commands (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ifood_internal.connections(id) on delete cascade,
  order_ref_id uuid not null references ifood_internal.order_refs(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  external_order_id text not null,
  intent text not null,
  expected_external_revision bigint not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_owner text,
  lease_until timestamptz,
  response jsonb,
  last_error_code text,
  last_error text,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_order_commands_command_key_unique unique (connection_id, external_order_id, intent, expected_external_revision),
  constraint ifood_order_commands_idempotency_unique unique (idempotency_key),
  constraint ifood_order_commands_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint ifood_order_commands_payload_size_check check (octet_length(payload::text) <= 32768),
  constraint ifood_order_commands_attempts_check check (attempts >= 0),
  constraint ifood_order_commands_max_attempts_check check (max_attempts between 1 and 20),
  constraint ifood_order_commands_error_code_check check (last_error_code is null or length(last_error_code) <= 80),
  constraint ifood_order_commands_last_error_check check (last_error is null or length(last_error) <= 500),
  constraint ifood_order_commands_status_check check (status in ('queued', 'sending', 'accepted_http', 'confirmed_event', 'failed_retryable', 'failed_terminal', 'expired')),
  constraint ifood_order_commands_intent_check check (intent in ('confirm', 'start_preparation', 'ready_to_pickup', 'dispatch', 'cancel'))
);

create table if not exists ifood_internal.product_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ifood_internal.connections(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  external_item_id text not null,
  external_code text,
  product_id integer references public.produtos(id) on delete set null,
  mapping_status text not null default 'suggested',
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_product_mappings_item_unique unique (merchant_id, external_item_id),
  constraint ifood_product_mappings_status_check check (mapping_status in ('suggested', 'confirmed', 'disabled'))
);

create table if not exists ifood_internal.stock_commitments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references ifood_internal.connections(id) on delete cascade,
  order_ref_id uuid not null references ifood_internal.order_refs(id) on delete cascade,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  merchant_id text not null,
  external_order_id text not null,
  external_item_id text not null,
  product_id integer not null references public.produtos(id) on delete restrict,
  quantity integer not null,
  status text not null default 'committed',
  commit_event_id text,
  release_event_id text,
  committed_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifood_stock_commitments_item_unique unique (order_ref_id, external_item_id, product_id),
  constraint ifood_stock_commitments_quantity_check check (quantity > 0),
  constraint ifood_stock_commitments_status_check check (status in ('committed', 'released'))
);

-- The canonical order source check is intentionally restated so an existing
-- baseline that already knows WhatsApp keeps every historical source.
alter table public.zelo_orders drop constraint if exists zelo_orders_source_check;
alter table public.zelo_orders add constraint zelo_orders_source_check
  check (source = any (array[
    'zelomenu'::text, 'zelochat'::text, 'whatsapp'::text, 'manual'::text,
    'legacy_zelochat'::text, 'legacy_pedido'::text, 'mesa'::text, 'ifood'::text
  ]));

-- Foreign-key and queue access paths. Partial due indexes keep claims short
-- while lease indexes make expired work visible without scanning the queue.
create index if not exists ifood_connections_empresa_idx
  on ifood_internal.connections (empresa_id);
create index if not exists ifood_event_inbox_connection_idx
  on ifood_internal.event_inbox (connection_id, received_at, id);
create index if not exists ifood_event_inbox_empresa_idx
  on ifood_internal.event_inbox (empresa_id, received_at, id);
create index if not exists ifood_event_inbox_due_idx
  on ifood_internal.event_inbox (next_attempt_at, received_at, id)
  where status in ('queued', 'failed_retryable');
create index if not exists ifood_event_inbox_lease_idx
  on ifood_internal.event_inbox (lease_until, received_at, id)
  where status = 'processing';
create index if not exists ifood_event_inbox_merchant_order_idx
  on ifood_internal.event_inbox (merchant_id, external_order_id, external_revision);
create index if not exists ifood_order_refs_connection_idx
  on ifood_internal.order_refs (connection_id, external_order_id);
create index if not exists ifood_order_refs_empresa_idx
  on ifood_internal.order_refs (empresa_id, updated_at, id);
create index if not exists ifood_order_commands_order_ref_idx
  on ifood_internal.order_commands (order_ref_id, created_at, id);
create index if not exists ifood_order_commands_empresa_idx
  on ifood_internal.order_commands (empresa_id);
create index if not exists ifood_order_commands_connection_idx
  on ifood_internal.order_commands (connection_id, created_at, id);
create index if not exists ifood_order_commands_due_idx
  on ifood_internal.order_commands (next_attempt_at, created_at, id)
  where status = 'queued' or status = 'failed_retryable';
create index if not exists ifood_order_commands_lease_idx
  on ifood_internal.order_commands (lease_until, created_at, id)
  where status = 'sending';
create index if not exists ifood_product_mappings_connection_idx
  on ifood_internal.product_mappings (connection_id, external_item_id);
create index if not exists ifood_product_mappings_empresa_idx
  on ifood_internal.product_mappings (empresa_id);
create index if not exists ifood_product_mappings_product_idx
  on ifood_internal.product_mappings (product_id)
  where product_id is not null;
create index if not exists ifood_stock_commitments_order_ref_idx
  on ifood_internal.stock_commitments (order_ref_id, status, id);
create index if not exists ifood_stock_commitments_empresa_idx
  on ifood_internal.stock_commitments (empresa_id);
create index if not exists ifood_stock_commitments_connection_idx
  on ifood_internal.stock_commitments (connection_id, status, id);
create index if not exists ifood_stock_commitments_product_idx
  on ifood_internal.stock_commitments (product_id, status, id);

alter table ifood_internal.connections enable row level security;
alter table ifood_internal.event_inbox enable row level security;
alter table ifood_internal.order_refs enable row level security;
alter table ifood_internal.order_commands enable row level security;
alter table ifood_internal.product_mappings enable row level security;
alter table ifood_internal.stock_commitments enable row level security;

revoke all on table ifood_internal.connections from public, anon, authenticated;
revoke all on table ifood_internal.event_inbox from public, anon, authenticated;
revoke all on table ifood_internal.order_refs from public, anon, authenticated;
revoke all on table ifood_internal.order_commands from public, anon, authenticated;
revoke all on table ifood_internal.product_mappings from public, anon, authenticated;
revoke all on table ifood_internal.stock_commitments from public, anon, authenticated;
grant select, insert, update, delete on table ifood_internal.connections to service_role;
grant select, insert, update, delete on table ifood_internal.event_inbox to service_role;
grant select, insert, update, delete on table ifood_internal.order_refs to service_role;
grant select, insert, update, delete on table ifood_internal.order_commands to service_role;
grant select, insert, update, delete on table ifood_internal.product_mappings to service_role;
grant select, insert, update, delete on table ifood_internal.stock_commitments to service_role;

create or replace function public.enqueue_ifood_event_v1(
  p_connection_id uuid,
  p_event_id text,
  p_merchant_id text,
  p_external_order_id text,
  p_event_type text,
  p_external_revision bigint,
  p_occurred_at timestamptz,
  p_payload jsonb
) returns table (inbox_id uuid, event_id text, inserted boolean, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_id uuid;
  v_status text;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_connection_id is null or nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_event_type), '') is null then
    raise exception 'INVALID_EVENT_IDENTITY';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 262144 then
    raise exception 'PAYLOAD_TOO_LARGE_OR_INVALID';
  end if;

  select c.empresa_id
    into strict v_empresa_id
    from ifood_internal.connections as c
   where c.id = p_connection_id
     and c.merchant_id = p_merchant_id
     and c.status <> 'revoked';

  insert into ifood_internal.event_inbox (
    connection_id, empresa_id, merchant_id, event_id, external_order_id,
    event_type, external_revision, occurred_at, payload, payload_hash
  ) values (
    p_connection_id, v_empresa_id, p_merchant_id, p_event_id,
    nullif(btrim(p_external_order_id), ''), p_event_type,
    greatest(coalesce(p_external_revision, 0), 0), p_occurred_at, p_payload,
    md5(p_payload::text)
  )
  on conflict on constraint ifood_event_inbox_event_unique do nothing
  returning id, event_inbox.event_id, true, event_inbox.status
    into v_id, event_id, inserted, status;

  if v_id is not null then
    inbox_id := v_id;
    return next;
    return;
  end if;

  select e.id, e.event_id, false, e.status
    into inbox_id, event_id, inserted, status
    from ifood_internal.event_inbox as e
   where e.event_id = p_event_id;
  if inbox_id is null then
    raise exception 'EVENT_INSERT_RACE';
  end if;
  return next;
end;
$$;

create or replace function public.claim_ifood_events_v1(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
) returns table (
  inbox_id uuid,
  event_id text,
  connection_id uuid,
  empresa_id uuid,
  merchant_id text,
  external_order_id text,
  event_type text,
  external_revision bigint,
  occurred_at timestamptz,
  payload jsonb,
  attempts integer,
  lease_id uuid,
  lease_until timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_worker_id), '') is null or p_limit not between 1 and 100
     or p_lease_seconds not between 5 and 900 then
    raise exception 'INVALID_CLAIM_ARGUMENTS';
  end if;

  update ifood_internal.event_inbox as e
     set status = 'dead_letter',
         dead_lettered_at = coalesce(e.dead_lettered_at, now()),
         last_error_code = coalesce(e.last_error_code, 'max_attempts'),
         last_error = coalesce(e.last_error, 'maximum attempts exceeded'),
         lease_id = null, lease_owner = null, lease_until = null,
         updated_at = now()
   where (e.status in ('queued', 'failed_retryable') and e.attempts >= e.max_attempts)
      or (e.status = 'processing' and e.lease_until < now() and e.attempts >= e.max_attempts);

  return query
  with candidates as (
    select e.id
      from ifood_internal.event_inbox as e
     where (
       (
         e.status in ('queued', 'failed_retryable') and e.next_attempt_at <= now()
       ) or (
         e.status = 'processing' and e.lease_until < now()
       )
     )
       and e.attempts < e.max_attempts
     order by e.next_attempt_at, e.received_at, e.id
     for update skip locked
     limit p_limit
  ), claimed as (
    update ifood_internal.event_inbox as e
       set status = 'processing',
           attempts = e.attempts + 1,
           lease_id = gen_random_uuid(),
           lease_owner = p_worker_id,
           lease_until = now() + make_interval(secs => p_lease_seconds),
           updated_at = now()
      from candidates as c
     where e.id = c.id
     returning e.*
  )
  select c.id, c.event_id, c.connection_id, c.empresa_id, c.merchant_id,
         c.external_order_id, c.event_type, c.external_revision,
         c.occurred_at, c.payload, c.attempts, c.lease_id, c.lease_until,
         c.status
    from claimed as c
   order by c.next_attempt_at, c.received_at, c.id;
end;
$$;

create or replace function public.finish_ifood_event_v1(
  p_inbox_id uuid,
  p_lease_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_error_message text default null,
  p_next_attempt_at timestamptz default null
) returns table (inbox_id uuid, event_id text, status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_lease_id is null then
    raise exception 'INVALID_LEASE_ID';
  end if;
  if p_outcome not in ('processed', 'retryable', 'failed_retryable', 'terminal', 'failed_terminal', 'quarantine', 'dead_letter') then
    raise exception 'INVALID_FINISH_OUTCOME';
  end if;

  v_status := case
    when p_outcome = 'processed' then 'processed'
    when p_outcome in ('retryable', 'failed_retryable') then 'failed_retryable'
    else 'dead_letter'
  end;

  return query
  update ifood_internal.event_inbox as e
     set status = v_status,
         next_attempt_at = case when v_status = 'failed_retryable'
           then coalesce(p_next_attempt_at, now() + interval '1 minute') else e.next_attempt_at end,
         processed_at = case when v_status = 'processed' then now() else e.processed_at end,
         dead_lettered_at = case when v_status = 'dead_letter' then coalesce(e.dead_lettered_at, now()) else e.dead_lettered_at end,
         last_error_code = case when v_status = 'processed' then null else left(nullif(btrim(p_error_code), ''), 80) end,
         last_error = case when v_status = 'processed' then null else left(nullif(btrim(p_error_message), ''), 500) end,
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where e.id = p_inbox_id
     and e.status = 'processing'
     and p_lease_id is not null
     and e.lease_id = p_lease_id
  returning e.id, e.event_id, e.status, e.attempts;

  if not found then
    raise exception 'LEASE_LOST';
  end if;
end;
$$;

create or replace function public.claim_ifood_commands_v1(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
) returns table (
  command_id uuid,
  connection_id uuid,
  order_ref_id uuid,
  empresa_id uuid,
  merchant_id text,
  external_order_id text,
  intent text,
  expected_external_revision bigint,
  idempotency_key text,
  payload jsonb,
  attempts integer,
  lease_id uuid,
  lease_until timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_worker_id), '') is null or p_limit not between 1 and 100
     or p_lease_seconds not between 5 and 900 then
    raise exception 'INVALID_CLAIM_ARGUMENTS';
  end if;

  update ifood_internal.order_commands as c
     set status = case when c.status = 'sending' then 'failed_terminal' else 'expired' end,
         terminal_at = coalesce(c.terminal_at, now()),
         last_error_code = coalesce(c.last_error_code, 'max_attempts'),
         last_error = coalesce(c.last_error, 'maximum attempts exceeded'),
         lease_id = null, lease_owner = null, lease_until = null,
         updated_at = now()
   where ((c.status in ('queued', 'failed_retryable') and c.attempts >= c.max_attempts)
       or (c.status = 'sending' and c.lease_until < now() and c.attempts >= c.max_attempts));

  return query
  with candidates as (
    select c.id
      from ifood_internal.order_commands as c
     where (
       (
         c.status in ('queued', 'failed_retryable') and c.next_attempt_at <= now()
       ) or (
         c.status = 'sending' and c.lease_until < now()
       )
     )
       and c.attempts < c.max_attempts
     order by c.next_attempt_at, c.created_at, c.id
     for update skip locked
     limit p_limit
  ), claimed as (
    update ifood_internal.order_commands as c
       set status = 'sending',
           attempts = c.attempts + 1,
           lease_id = gen_random_uuid(),
           lease_owner = p_worker_id,
           lease_until = now() + make_interval(secs => p_lease_seconds),
           updated_at = now()
      from candidates as candidate
     where c.id = candidate.id
     returning c.*
  )
  select c.id, c.connection_id, c.order_ref_id, c.empresa_id, c.merchant_id,
         c.external_order_id, c.intent, c.expected_external_revision,
         c.idempotency_key, c.payload, c.attempts, c.lease_id, c.lease_until,
         c.status
    from claimed as c
   order by c.next_attempt_at, c.created_at, c.id;
end;
$$;

create or replace function public.finish_ifood_command_v1(
  p_command_id uuid,
  p_lease_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_error_message text default null,
  p_response jsonb default null,
  p_next_attempt_at timestamptz default null
) returns table (command_id uuid, status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_lease_id is null then
    raise exception 'INVALID_LEASE_ID';
  end if;
  if p_outcome not in ('accepted_http', 'confirmed_event', 'retryable', 'failed_retryable', 'terminal', 'failed_terminal', 'expired') then
    raise exception 'INVALID_FINISH_OUTCOME';
  end if;
  if p_response is not null and (jsonb_typeof(p_response) <> 'object' or octet_length(p_response::text) > 32768) then
    raise exception 'RESPONSE_TOO_LARGE_OR_INVALID';
  end if;

  v_status := case
    when p_outcome = 'accepted_http' then 'accepted_http'
    when p_outcome = 'confirmed_event' then 'confirmed_event'
    when p_outcome in ('retryable', 'failed_retryable') then 'failed_retryable'
    when p_outcome = 'expired' then 'expired'
    else 'failed_terminal'
  end;

  return query
  update ifood_internal.order_commands as c
     set status = v_status,
         next_attempt_at = case when v_status = 'failed_retryable'
           then coalesce(p_next_attempt_at, now() + interval '1 minute') else c.next_attempt_at end,
         response = coalesce(p_response, c.response),
         terminal_at = case when v_status in ('confirmed_event', 'failed_terminal', 'expired') then now() else c.terminal_at end,
         last_error_code = case when v_status in ('accepted_http', 'confirmed_event') then null else left(nullif(btrim(p_error_code), ''), 80) end,
         last_error = case when v_status in ('accepted_http', 'confirmed_event') then null else left(nullif(btrim(p_error_message), ''), 500) end,
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where c.id = p_command_id
     and c.status = 'sending'
     and p_lease_id is not null
     and c.lease_id = p_lease_id
  returning c.id, c.status, c.attempts;

  if not found then
    raise exception 'LEASE_LOST';
  end if;
end;
$$;

revoke all on function public.enqueue_ifood_event_v1(uuid, text, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.claim_ifood_events_v1(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_ifood_event_v1(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_ifood_commands_v1(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_ifood_command_v1(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_ifood_event_v1(uuid, text, text, text, text, bigint, timestamptz, jsonb) to service_role;
grant execute on function public.claim_ifood_events_v1(text, integer, integer) to service_role;
grant execute on function public.finish_ifood_event_v1(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_ifood_commands_v1(text, integer, integer) to service_role;
grant execute on function public.finish_ifood_command_v1(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;

comment on schema ifood_internal is
  'Private server-only iFood integration state; browser roles have no usage, table, or RPC grants.';

commit;
