-- Transactional runtime verification for the WhatsApp confirmation-token contract.
-- The disposable-baseline harness applies forward migrations before this file.
-- All rows are rolled back, including the auth fixture.

begin;

create temporary table whatsapp_confirmation_fixture (
  owner_id uuid not null,
  empresa_id uuid not null,
  session_id uuid not null,
  expired_session_id uuid not null,
  source_ref text not null,
  expired_source_ref text not null,
  first_hash text not null,
  second_hash text not null,
  confirmation_hash text not null,
  expired_hash text not null,
  confirmation_token_id uuid,
  order_id uuid
) on commit drop;

insert into whatsapp_confirmation_fixture (
  owner_id, empresa_id, session_id, expired_session_id, source_ref,
  expired_source_ref, first_hash, second_hash, confirmation_hash, expired_hash
) values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  '5511999990001@s.whatsapp.net', '5511999990002@s.whatsapp.net',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64)
);

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select owner_id,
       'codex-whatsapp-confirmation-' || owner_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from whatsapp_confirmation_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_id, owner_id, 'Empresa de verificação WhatsApp'
  from whatsapp_confirmation_fixture;

insert into public.zelomenu_cart_sessions (
  id, empresa_id, context, state, source_ref, customer_snapshot, cart_snapshot,
  fulfillment_snapshot, pricing_snapshot, payment_snapshot, revision
)
select session_id, empresa_id, 'whatsapp_order', 'cart_open', source_ref,
       jsonb_build_object('name', 'Cliente de verificação'),
       jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
         'productName', 'Produto de verificação', 'unitPrice', 0,
         'quantity', 1, 'lineTotal', 0, 'position', 0
       ))),
       jsonb_build_object('type', 'pickup'),
       jsonb_build_object('subtotal', 0, 'deliveryFee', 0, 'discount', 0),
       jsonb_build_object('pixReceiptRequired', false, 'pixReceiptApproved', false),
       1
  from whatsapp_confirmation_fixture
union all
select expired_session_id, empresa_id, 'whatsapp_order', 'cart_open', expired_source_ref,
       '{}'::jsonb,
       jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
         'productName', 'Produto expirado', 'unitPrice', 0,
         'quantity', 1, 'lineTotal', 0, 'position', 0
       ))),
       jsonb_build_object('type', 'pickup'),
       jsonb_build_object('subtotal', 0, 'deliveryFee', 0, 'discount', 0),
       jsonb_build_object('pixReceiptRequired', false, 'pixReceiptApproved', false),
       1
  from whatsapp_confirmation_fixture;

do $$
begin
  if to_regprocedure('public.issue_whatsapp_zelo_confirmation_token(text,uuid,text,uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.confirm_whatsapp_zelo_order(text,uuid,text,integer,text,uuid)') is null then
    raise exception 'WhatsApp confirmation RPC contract is missing';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.issue_whatsapp_zelo_confirmation_token(text,uuid,text,uuid,integer,timestamp with time zone)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.issue_whatsapp_zelo_confirmation_token(text,uuid,text,uuid,integer,timestamp with time zone)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.confirm_whatsapp_zelo_order(text,uuid,text,integer,text,uuid)',
    'execute'
  ) then
    raise exception 'WhatsApp confirmation RPC grants changed';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare
  f whatsapp_confirmation_fixture%rowtype;
  issued jsonb;
begin
  select * into f from whatsapp_confirmation_fixture;
  issued := public.issue_whatsapp_zelo_confirmation_token(
    f.first_hash, f.empresa_id, f.source_ref, f.session_id, 1, now() + interval '10 minutes'
  );
  if issued->>'tokenId' is null or issued->>'sessionId' <> f.session_id::text then
    raise exception 'first token issuance returned an invalid binding';
  end if;

  -- A replacement is atomic: the old live token is invalidated before the new
  -- one becomes live, leaving exactly one unconsumed/non-invalidated row.
  perform public.issue_whatsapp_zelo_confirmation_token(
    f.second_hash, f.empresa_id, f.source_ref, f.session_id, 1, now() + interval '10 minutes'
  );
  if not exists (
    select 1 from public.zelomenu_whatsapp_confirmation_tokens
     where token_hash = f.first_hash and invalidated_at is not null
  ) or (select count(*) from public.zelomenu_whatsapp_confirmation_tokens
         where session_id = f.session_id and consumed_at is null and invalidated_at is null) <> 1 then
    raise exception 'token replacement did not invalidate the prior live token atomically';
  end if;

  begin
    perform public.issue_whatsapp_zelo_confirmation_token(
      repeat('e', 64), f.empresa_id, 'wrong-jid@s.whatsapp.net', f.session_id, 1, now() + interval '10 minutes'
    );
    raise exception 'issuance accepted a mismatched JID';
  exception when sqlstate 'ZL403' then
    null;
  end;

  issued := public.issue_whatsapp_zelo_confirmation_token(
    f.confirmation_hash, f.empresa_id, f.source_ref, f.session_id, 1, now() + interval '10 minutes'
  );
  update whatsapp_confirmation_fixture set confirmation_token_id = (issued->>'tokenId')::uuid;
end;
$$;

do $$
declare
  f whatsapp_confirmation_fixture%rowtype;
begin
  select * into f from whatsapp_confirmation_fixture;
  -- Direct setup emulates an old expired row. Issuance must invalidate it too,
  -- rather than leaving it to occupy the partial one-live-token index.
  insert into public.zelomenu_whatsapp_confirmation_tokens (
    token_hash, empresa_id, session_id, source_ref, revision, expires_at, created_at
  ) values (
    f.expired_hash, f.empresa_id, f.expired_session_id, f.expired_source_ref, 1,
    now() - interval '1 hour', now() - interval '2 hours'
  );
  begin
    perform public.confirm_whatsapp_zelo_order(
      f.expired_hash, f.empresa_id, f.expired_source_ref, 1, 'caller-key-ignored', null
    );
    raise exception 'expired token was accepted';
  exception when sqlstate 'ZL410' then
    null;
  end;
  perform public.issue_whatsapp_zelo_confirmation_token(
    repeat('f', 64), f.empresa_id, f.expired_source_ref, f.expired_session_id, 1, now() + interval '10 minutes'
  );
  if not exists (
    select 1 from public.zelomenu_whatsapp_confirmation_tokens
     where token_hash = f.expired_hash and invalidated_at is not null
  ) then
    raise exception 'expired token was not invalidated by replacement';
  end if;
end;
$$;

do $$
declare
  f whatsapp_confirmation_fixture%rowtype;
  confirmed jsonb;
  retry jsonb;
  canonical_key text;
begin
  select * into f from whatsapp_confirmation_fixture;
  begin
    perform public.confirm_whatsapp_zelo_order(
      f.confirmation_hash, f.empresa_id, 'wrong-jid@s.whatsapp.net', 1, 'collision-key', null
    );
    raise exception 'confirmation accepted a mismatched JID';
  exception when sqlstate 'ZL403' then
    null;
  end;

  confirmed := public.confirm_whatsapp_zelo_order(
    f.confirmation_hash, f.empresa_id, f.source_ref, 1, 'collision-key', null
  );
  update whatsapp_confirmation_fixture set order_id = (confirmed->>'orderId')::uuid;
  canonical_key := 'whatsapp:' || f.session_id::text || ':' || f.confirmation_token_id::text;
  if (select count(*) from public.zelo_orders where zelomenu_session_id = f.session_id) <> 1
     or not exists (
       select 1 from public.zelo_orders
        where id = (confirmed->>'orderId')::uuid
          and source = 'whatsapp'
          and idempotency_key = canonical_key
     ) or not exists (
       select 1 from public.zelomenu_whatsapp_confirmation_tokens
        where id = f.confirmation_token_id and consumed_at is not null
     ) then
    raise exception 'confirmation did not create/consume the canonical bound order';
  end if;

  retry := public.confirm_whatsapp_zelo_order(
    f.confirmation_hash, f.empresa_id, f.source_ref, 1, 'different-caller-key', null
  );
  if retry->>'orderId' <> confirmed->>'orderId'
     or coalesce((retry->>'alreadyConfirmed')::boolean, false) is not true
     or (select count(*) from public.zelo_orders where zelomenu_session_id = f.session_id) <> 1 then
    raise exception 'same-token retry was not idempotent';
  end if;

  begin
    perform public.issue_whatsapp_zelo_confirmation_token(
      repeat('9', 64), f.empresa_id, f.source_ref, f.session_id, 1, now() + interval '10 minutes'
    );
    raise exception 'issuance accepted a confirmed cart';
  exception when sqlstate 'ZL409' then
    null;
  end;
end;
$$;

rollback;
