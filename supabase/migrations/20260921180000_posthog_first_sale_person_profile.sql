-- Forward-only: allow PostHog person profile processing on canonical lifecycle
-- events (first_sale_completed / payment_confirmed). The original enqueue_event
-- always sent `$process_person_profile: false`, which left first_sale as an
-- anonymous-looking capture even after client identify.
--
-- Do not edit 20260903020000_posthog_canonical_lifecycle_events.sql.

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
        '$process_person_profile', true,
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

comment on function posthog_analytics.enqueue_event(text, uuid, timestamptz, text, jsonb) is
  'Enqueue PostHog capture for canonical lifecycle events; person profiles enabled.';
