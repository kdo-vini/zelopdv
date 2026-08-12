-- Webhook reliability round 2.
--
-- The application currently settles a paid Pix payment by updating
-- subscriptions and billing_payments in separate HTTP requests. This RPC
-- keeps the existing business rules but executes the payment row lock,
-- subscription renewal and payment update in one database transaction.
-- It is intentionally service-role only: browser clients do not call it.

create or replace function public.settle_pix_payment(
  p_payment_id uuid,
  p_provider_status text,
  p_mapped_status text,
  p_amount_paid_cents integer default null,
  p_expires_at timestamptz default null,
  p_paid_at timestamptz default null,
  p_external_reference text default null
)
returns public.billing_payments
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payment public.billing_payments%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_result public.billing_payments%rowtype;
  v_subscription_id uuid;
  v_now timestamptz := clock_timestamp();
  v_base_date timestamptz;
  v_next_period_end timestamptz;
  v_final_status text;
  v_final_provider_status text;
  v_paid_at timestamptz;
begin
  select *
    into v_payment
    from public.billing_payments
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'Pix payment % not found', p_payment_id
      using errcode = 'P0002';
  end if;

  v_final_status := coalesce(nullif(p_mapped_status, ''), v_payment.status);
  v_final_provider_status := coalesce(nullif(p_provider_status, ''), v_payment.provider_status);

  if v_payment.provider <> 'abacatepay' or v_payment.method <> 'pix' then
    raise exception 'Payment % is not an AbacatePay Pix payment', p_payment_id
      using errcode = 'P0001';
  end if;

  if p_external_reference is not null
     and p_external_reference <> v_payment.external_reference then
    raise exception 'External reference diverges for payment %', p_payment_id
      using errcode = 'P0001';
  end if;

  if v_final_status = 'paid' then
    if coalesce(p_amount_paid_cents, v_payment.amount_paid_cents, v_payment.amount_expected_cents)
      < v_payment.amount_expected_cents then
      v_final_status := 'failed';
      v_final_provider_status := 'PAID_AMOUNT_MISMATCH';
    else
      -- The payment row lock makes webhook + polling retries serialize. Only
      -- the first transaction with no paid_at may renew the subscription.
      if v_payment.paid_at is null then
        select *
          into v_subscription
          from public.subscriptions
         where user_id = v_payment.user_id
         order by updated_at desc nulls last, created_at desc nulls last
         limit 1
         for update;

        if found then
          v_subscription_id := v_subscription.id;
          v_base_date := greatest(
            v_now,
            coalesce(v_subscription.current_period_end, '-infinity'::timestamptz),
            coalesce(v_subscription.manually_extended_until, '-infinity'::timestamptz)
          );
        else
          v_base_date := v_now;
        end if;

        v_next_period_end := v_base_date + interval '1 month';

        if v_subscription_id is null then
          insert into public.subscriptions (
            user_id,
            status,
            current_period_end,
            cancel_at_period_end,
            payment_provider,
            billing_type,
            plan_tier,
            has_mesas_addon,
            has_acessos_addon,
            has_zelo_menu,
            monthly_value_cents,
            created_at,
            updated_at
          ) values (
            v_payment.user_id,
            'active',
            v_next_period_end,
            false,
            'abacatepay',
            'PIX',
            coalesce(v_payment.plan_tier, 'pdv'),
            coalesce(v_payment.has_mesas_addon, false),
            coalesce(v_payment.has_acessos_addon, false),
            coalesce(v_payment.has_zelo_menu, false),
            v_payment.amount_expected_cents,
            v_now,
            v_now
          ) returning id into v_subscription_id;
        else
          update public.subscriptions
             set status = 'active',
                 current_period_end = v_next_period_end,
                 cancel_at_period_end = false,
                 payment_provider = 'abacatepay',
                 billing_type = 'PIX',
                 plan_tier = coalesce(v_payment.plan_tier, 'pdv'),
                 has_mesas_addon = coalesce(v_payment.has_mesas_addon, false),
                 has_acessos_addon = coalesce(v_payment.has_acessos_addon, false),
                 has_zelo_menu = coalesce(v_payment.has_zelo_menu, false),
                 monthly_value_cents = v_payment.amount_expected_cents,
                 updated_at = v_now
           where id = v_subscription_id;
        end if;

        v_paid_at := coalesce(p_paid_at, v_now);
      end if;
    end if;
  end if;

  update public.billing_payments
     set provider_status = v_final_provider_status,
         status = v_final_status,
         amount_paid_cents = coalesce(p_amount_paid_cents, amount_paid_cents),
         expires_at = coalesce(p_expires_at, expires_at),
         paid_at = case
           when v_final_status = 'paid' then coalesce(paid_at, v_paid_at, p_paid_at, v_now)
           else paid_at
         end,
         subscription_id = case
           when v_final_status = 'paid' then coalesce(v_subscription_id, subscription_id)
           else subscription_id
         end,
         updated_at = v_now
   where id = v_payment.id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.settle_pix_payment(uuid, text, text, integer, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.settle_pix_payment(uuid, text, text, integer, timestamptz, timestamptz, text)
  to service_role;
