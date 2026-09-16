-- Transactional verification for the iFood webhook enqueue RPC. All fixtures
-- are rolled back; this never targets the linked project.
begin;

create temporary table ifood_webhook_verification_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  connection_active uuid not null,
  connection_revoked uuid not null
) on commit drop;

insert into ifood_webhook_verification_fixture
  (empresa_a, owner_a, connection_active, connection_revoked)
values
  (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-webhook-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_webhook_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood webhook verification'
  from ifood_webhook_verification_fixture;

grant select on ifood_webhook_verification_fixture to service_role;

set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.enqueue_ifood_webhook_event_v1(text,text,text,text,bigint,timestamptz,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enqueue_ifood_webhook_event_v1(text,text,text,text,bigint,timestamptz,jsonb)', 'EXECUTE') then
    raise exception 'browser role can execute the webhook enqueue RPC';
  end if;
  if not has_function_privilege('service_role', 'public.enqueue_ifood_webhook_event_v1(text,text,text,text,bigint,timestamptz,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute the webhook enqueue RPC';
  end if;
end;
$$;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_active, empresa_a, 'merchant-webhook-active', 'active'
  from ifood_webhook_verification_fixture
union all
select connection_revoked, empresa_a, 'merchant-webhook-revoked', 'revoked'
  from ifood_webhook_verification_fixture;

-- An event for an unknown merchant_id must be acknowledged as
-- `unknown_merchant`, never raise, and never touch the inbox table.
create temporary table ifood_webhook_unknown on commit drop as
select * from public.enqueue_ifood_webhook_event_v1(
  'event-webhook-unknown',
  'merchant-webhook-does-not-exist',
  'external-order-unknown',
  'PLC',
  0,
  now(),
  jsonb_build_object('id', 'event-webhook-unknown', 'merchantId', 'merchant-webhook-does-not-exist')
);

-- A revoked connection must be treated the same as an unknown merchant.
create temporary table ifood_webhook_revoked on commit drop as
select * from public.enqueue_ifood_webhook_event_v1(
  'event-webhook-revoked',
  'merchant-webhook-revoked',
  'external-order-revoked',
  'PLC',
  0,
  now(),
  jsonb_build_object('id', 'event-webhook-revoked', 'merchantId', 'merchant-webhook-revoked')
);

do $$
begin
  if (select outcome from ifood_webhook_unknown) <> 'unknown_merchant'
     or (select inbox_id from ifood_webhook_unknown) is not null then
    raise exception 'unknown merchant event was not ignored cleanly';
  end if;
  if (select outcome from ifood_webhook_revoked) <> 'unknown_merchant'
     or (select inbox_id from ifood_webhook_revoked) is not null then
    raise exception 'revoked connection event was not ignored cleanly';
  end if;
  if exists (
    select 1 from ifood_internal.event_inbox
     where event_id in ('event-webhook-unknown', 'event-webhook-revoked')
  ) then
    raise exception 'an ignored webhook event leaked into the inbox';
  end if;
end;
$$;

-- A known, non-revoked merchant is inserted, and a duplicate event_id is
-- idempotent and returns the same inbox row with outcome=duplicate.
create temporary table ifood_webhook_first on commit drop as
select * from public.enqueue_ifood_webhook_event_v1(
  'event-webhook-known',
  'merchant-webhook-active',
  'external-order-known',
  'PLC',
  0,
  now(),
  jsonb_build_object('id', 'event-webhook-known', 'merchantId', 'merchant-webhook-active')
);

create temporary table ifood_webhook_duplicate on commit drop as
select * from public.enqueue_ifood_webhook_event_v1(
  'event-webhook-known',
  'merchant-webhook-active',
  'external-order-known',
  'PLC',
  0,
  now(),
  jsonb_build_object('id', 'event-webhook-known', 'merchantId', 'merchant-webhook-active')
);

do $$
begin
  if (select outcome from ifood_webhook_first) <> 'inserted'
     or (select inbox_id from ifood_webhook_first) is null then
    raise exception 'known merchant event was not inserted';
  end if;
  if (select outcome from ifood_webhook_duplicate) <> 'duplicate'
     or (select inbox_id from ifood_webhook_duplicate) <> (select inbox_id from ifood_webhook_first) then
    raise exception 'duplicate webhook event was not idempotent';
  end if;
  if (select empresa_id from ifood_internal.event_inbox
       where id = (select inbox_id from ifood_webhook_first)) <> (select empresa_a from ifood_webhook_verification_fixture) then
    raise exception 'inserted event was not attributed to the resolved connection tenant';
  end if;
end;
$$;

rollback;
