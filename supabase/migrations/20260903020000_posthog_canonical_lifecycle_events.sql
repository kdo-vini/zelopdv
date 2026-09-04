-- Server-side lifecycle analytics from the canonical database state.
-- This intentionally sends no names, emails, customer data, or sale values.

create schema if not exists posthog_analytics;
revoke all on schema posthog_analytics from public;

create or replace view posthog_analytics.user_lifecycle
with (security_barrier = true)
as
with confirmed_payments as (
  select
    user_id,
    min(paid_at) filter (
      where status = 'paid'
        and paid_at is not null
    ) as first_paid_at
  from public.billing_payments
  where provider = 'abacatepay'
  group by user_id
),
first_sales as (
  select
    id_usuario as user_id,
    min(coalesce(data_hora, created_at)) as first_sale_at
  from public.vendas
  where id_usuario is not null
  group by id_usuario
)
select
  s.user_id::text as distinct_id,
  s.payment_provider,
  s.status as subscription_status,
  s.plan_tier,
  case
    when s.payment_provider = 'abacatepay' then cp.first_paid_at
    when s.payment_provider = 'stripe'
      and s.status in ('active', 'past_due', 'canceled') then s.created_at
    else null
  end as paid_at,
  case
    when s.payment_provider = 'abacatepay'
      and cp.first_paid_at is not null then 'billing_payments.paid_at'
    when s.payment_provider = 'stripe'
      and s.status in ('active', 'past_due', 'canceled') then 'subscriptions.created_at'
    else null
  end as paid_at_source,
  fs.first_sale_at,
  fs.first_sale_at is not null as has_first_sale
from public.subscriptions s
left join confirmed_payments cp on cp.user_id = s.user_id
left join first_sales fs on fs.user_id = s.user_id
where s.user_id is not null
  and s.payment_provider in ('stripe', 'abacatepay');

comment on view posthog_analytics.user_lifecycle is
  'Minimal PostHog lifecycle source. Stripe confirmation uses canonical subscription creation; AbacatePay uses paid billing payment. Contains no PII or financial values.';

create or replace view posthog_analytics.funnel_events
with (security_barrier = true)
as
select
  distinct_id,
  'payment_confirmed'::text as event_name,
  paid_at as event_time,
  payment_provider,
  subscription_status,
  plan_tier
from posthog_analytics.user_lifecycle
where paid_at is not null
union all
select
  distinct_id,
  'first_sale_completed'::text as event_name,
  first_sale_at as event_time,
  payment_provider,
  subscription_status,
  plan_tier
from posthog_analytics.user_lifecycle
where first_sale_at is not null;

comment on view posthog_analytics.funnel_events is
  'Canonical Stripe + AbacatePay payment confirmation and first-sale milestones for PostHog.';

revoke all on posthog_analytics.user_lifecycle from public;
revoke all on posthog_analytics.funnel_events from public;

create or replace function posthog_analytics.enqueue_event(
  p_event text,
  p_distinct_id uuid,
  p_timestamp timestamptz,
  p_insert_id text,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, net, posthog_analytics
as $$
begin
  if p_distinct_id is null or p_timestamp is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://us.i.posthog.com/capture/',
    body := jsonb_build_object(
      'api_key', 'phc_CXmgcLT8WcJZthvNhGJ3URzZj7MkYco88dg49hNhUYG8',
      'event', p_event,
      'distinct_id', p_distinct_id::text,
      'timestamp', p_timestamp,
      'properties', jsonb_build_object(
        '$insert_id', p_insert_id,
        '$process_person_profile', false,
        'source', 'supabase_canonical'
      ) || coalesce(p_properties, '{}'::jsonb)
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Analytics must never block billing or sale persistence.
    raise warning 'PostHog enqueue failed for event %: %', p_event, sqlerrm;
end;
$$;

revoke all on function posthog_analytics.enqueue_event(text, uuid, timestamptz, text, jsonb)
  from public;

create or replace function posthog_analytics.capture_subscription_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, posthog_analytics
as $$
begin
  if new.user_id is not null
    and new.payment_provider in ('stripe', 'abacatepay')
    and new.status = 'active'
    and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform posthog_analytics.enqueue_event(
      'payment_confirmed',
      new.user_id,
      coalesce(new.updated_at, now()),
      'payment_confirmed:' || new.id::text || ':' || coalesce(new.updated_at, now())::text,
      jsonb_build_object(
        'payment_provider', new.payment_provider,
        'subscription_status', new.status,
        'plan_tier', new.plan_tier,
        'paid_at_source', 'subscriptions.active_transition'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function posthog_analytics.capture_subscription_activation()
  from public;

drop trigger if exists posthog_capture_subscription_activation
  on public.subscriptions;
create trigger posthog_capture_subscription_activation
after insert or update of status on public.subscriptions
for each row
execute function posthog_analytics.capture_subscription_activation();

create or replace function posthog_analytics.capture_first_sale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, posthog_analytics
as $$
declare
  v_subscription public.subscriptions%rowtype;
begin
  if new.id_usuario is null or exists (
    select 1
    from public.vendas v
    where v.id_usuario = new.id_usuario
      and v.id <> new.id
  ) then
    return new;
  end if;

  select s.*
    into v_subscription
  from public.subscriptions s
  where s.user_id = new.id_usuario
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  perform posthog_analytics.enqueue_event(
    'first_sale_completed',
    new.id_usuario,
    coalesce(new.data_hora, new.created_at, now()),
    'first_sale_completed:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'payment_provider', v_subscription.payment_provider,
      'subscription_status', v_subscription.status,
      'plan_tier', v_subscription.plan_tier
    ))
  );

  return new;
end;
$$;

revoke all on function posthog_analytics.capture_first_sale()
  from public;

drop trigger if exists posthog_capture_first_sale on public.vendas;
create trigger posthog_capture_first_sale
after insert on public.vendas
for each row
execute function posthog_analytics.capture_first_sale();

-- Idempotent historical seed. PostHog deduplicates on the deterministic insert id.
select posthog_analytics.enqueue_event(
  fe.event_name,
  fe.distinct_id::uuid,
  fe.event_time,
  'historical:' || fe.event_name || ':' || fe.distinct_id,
  jsonb_build_object(
    'payment_provider', fe.payment_provider,
    'subscription_status', fe.subscription_status,
    'plan_tier', fe.plan_tier,
    'historical_backfill', true
  )
)
from posthog_analytics.funnel_events fe;

