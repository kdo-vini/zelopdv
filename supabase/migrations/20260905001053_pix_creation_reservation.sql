-- Reserve before contacting AbacatePay. A lost HTTP response must never unlock
-- another POST. Existing payment/settlement history and RLS remain unchanged.
begin;
alter table public.billing_payments add column if not exists creation_state text;
alter table public.billing_payments add constraint billing_payments_creation_state_check
  check (creation_state is null or creation_state in ('dispatching', 'unknown', 'ready', 'not_sent'));

create or replace function public.reserve_pix_payment(
  p_user_id uuid, p_plan_tier text, p_amount_cents integer,
  p_mesas boolean, p_acessos boolean, p_menu boolean, p_metadata jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_payment public.billing_payments%rowtype;
  v_sub_id uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_amount_cents is null or p_amount_cents <= 0
     or p_plan_tier is null or p_plan_tier not in ('pdv', 'chat', 'bundle') then
    raise exception 'Invalid Pix reservation';
  end if;
  -- Separate API instances and admin/customer requests serialize per owner.
  perform pg_advisory_xact_lock(hashtextextended('pix-create:' || p_user_id::text, 0));
  select * into v_payment from public.billing_payments
    where user_id = p_user_id and provider = 'abacatepay' and method = 'pix'
      and (creation_state in ('dispatching', 'unknown') or status = 'pending')
    order by (creation_state in ('dispatching', 'unknown')) desc nulls last,
      created_at desc, id desc limit 1 for update;
  if found then
    if v_payment.creation_state in ('dispatching', 'unknown')
       or v_payment.provider_payment_id is null or v_payment.br_code is null then
      return jsonb_build_object('action', 'blocked', 'payment', to_jsonb(v_payment));
    end if;
    -- A timestamp alone is not evidence that a late payment did not settle.
    if v_payment.expires_at is not null and v_payment.expires_at <= v_now then
      return jsonb_build_object('action', 'check', 'payment', to_jsonb(v_payment));
    end if;
    if v_payment.plan_tier = p_plan_tier and v_payment.amount_expected_cents = p_amount_cents
       and v_payment.has_mesas_addon = p_mesas and v_payment.has_acessos_addon = p_acessos
       and v_payment.has_zelo_menu = p_menu then
      return jsonb_build_object('action', 'reuse', 'payment', to_jsonb(v_payment));
    end if;
    return jsonb_build_object('action', 'selection_conflict', 'payment', to_jsonb(v_payment));
  end if;
  select id into v_sub_id from public.subscriptions where user_id = p_user_id
    order by updated_at desc nulls last, created_at desc nulls last limit 1;
  insert into public.billing_payments (
    id, user_id, subscription_id, provider, method, kind, status, creation_state,
    plan_tier, has_mesas_addon, has_acessos_addon, has_zelo_menu,
    amount_expected_cents, currency, external_reference, metadata, created_at, updated_at
  ) values (
    v_id, p_user_id, v_sub_id, 'abacatepay', 'pix',
    case when v_sub_id is null then 'subscription_start' else 'subscription_renewal' end,
    'pending', 'dispatching', p_plan_tier, p_mesas, p_acessos, p_menu,
    p_amount_cents, 'BRL', 'pix_' || v_id::text,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'paymentId', v_id, 'userId', p_user_id, 'planTier', p_plan_tier,
      'kind', case when v_sub_id is null then 'subscription_start' else 'subscription_renewal' end,
      'addons', jsonb_build_object('mesas', p_mesas, 'acessos', p_acessos, 'menu', p_menu),
      'billingCycle', 'monthly'), v_now, v_now
  ) returning * into v_payment;
  return jsonb_build_object('action', 'create', 'payment', to_jsonb(v_payment));
end;
$$;

create or replace function public.complete_pix_creation(
  p_payment_id uuid, p_user_id uuid, p_outcome text, p_remote jsonb default null
) returns public.billing_payments language plpgsql security invoker set search_path = '' as $$
declare
  v_payment public.billing_payments%rowtype;
  v_provider_id text := nullif(p_remote->>'id', '');
begin
  select * into v_payment from public.billing_payments
    where id = p_payment_id and user_id = p_user_id and provider = 'abacatepay' and method = 'pix'
    for update;
  if not found then raise exception 'Pix reservation not found'; end if;
  if p_outcome in ('unknown', 'not_sent') then
    -- A webhook/another recovery may already have attached and settled it.
    if v_payment.creation_state = 'dispatching' and v_payment.provider_payment_id is null then
      update public.billing_payments set creation_state = p_outcome,
        status = case when p_outcome = 'not_sent' then 'failed' else status end,
        updated_at = clock_timestamp() where id = v_payment.id returning * into v_payment;
    end if;
    return v_payment;
  end if;
  if p_outcome is distinct from 'ready' or v_provider_id is null
     or p_remote->>'amount' is null then
    raise exception 'Invalid Pix creation outcome';
  end if;
  if (v_payment.provider_payment_id is not null and v_payment.provider_payment_id <> v_provider_id)
     or (p_remote->>'externalId' is not null and p_remote->>'externalId' <> v_payment.external_reference)
     or (p_remote->>'amount' is not null and (p_remote->>'amount')::integer <> v_payment.amount_expected_cents)
     or (p_remote->'metadata'->>'paymentId' is not null and p_remote->'metadata'->>'paymentId' <> v_payment.id::text)
     or (p_remote->'metadata'->>'userId' is not null and p_remote->'metadata'->>'userId' <> v_payment.user_id::text) then
    raise exception 'Pix provider identity or amount mismatch';
  end if;
  update public.billing_payments set
    creation_state = 'ready', provider_payment_id = v_provider_id, provider_checkout_id = v_provider_id,
    br_code = coalesce(nullif(p_remote->>'brCode', ''), br_code),
    qr_code_base64 = coalesce(nullif(p_remote->>'brCodeBase64', ''), qr_code_base64),
    expires_at = coalesce((p_remote->>'expiresAt')::timestamptz, expires_at),
    updated_at = clock_timestamp()
    where id = v_payment.id returning * into v_payment;
  -- Business status/paid_at are owned by settle_pix_payment, not creation.
  return v_payment;
end;
$$;

revoke all on function public.reserve_pix_payment(uuid,text,integer,boolean,boolean,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.complete_pix_creation(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_pix_payment(uuid,text,integer,boolean,boolean,boolean,jsonb) to service_role;
grant execute on function public.complete_pix_creation(uuid,uuid,text,jsonb) to service_role;
commit;
