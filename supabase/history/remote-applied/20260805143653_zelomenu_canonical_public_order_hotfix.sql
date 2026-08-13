-- Keep the public checkout on the canonical order engine even while an older
-- ZeloMenu server bundle is still calling confirm_zelomenu_cart directly.
-- `table_order` remains on the legacy implementation until its own cutover.
begin;
do $$
begin
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb)') is null then
    raise exception 'create_zelo_order(uuid,integer,text,jsonb) is required';
  end if;

  if to_regprocedure('public.confirm_zelomenu_cart_legacy(uuid,text,integer,text)') is null then
    alter function public.confirm_zelomenu_cart(uuid, text, integer, text)
      rename to confirm_zelomenu_cart_legacy;
  end if;
end
$$;
create or replace function public.confirm_zelomenu_cart(
  p_session_id uuid,
  p_token_hash text,
  p_expected_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  s public.zelomenu_cart_sessions;
begin
  select * into s
  from public.zelomenu_cart_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'ZL404', message = 'CART_NOT_FOUND';
  end if;
  if s.current_token_hash is distinct from p_token_hash then
    raise exception using errcode = 'ZL410', message = 'STALE_CART_TOKEN';
  end if;
  if s.revision <> p_expected_revision then
    raise exception using errcode = 'ZL409', message = 'REVISION_CONFLICT';
  end if;

  if s.context = 'public_order' then
    return public.create_zelo_order(
      s.id,
      p_expected_revision,
      p_idempotency_key,
      jsonb_build_object('empresaId', s.empresa_id, 'source', 'zelomenu')
    );
  end if;

  return public.confirm_zelomenu_cart_legacy(
    p_session_id,
    p_token_hash,
    p_expected_revision,
    p_idempotency_key
  );
end
$function$;
revoke all on function public.confirm_zelomenu_cart(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.confirm_zelomenu_cart(uuid, text, integer, text) to service_role;
revoke all on function public.confirm_zelomenu_cart_legacy(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.confirm_zelomenu_cart_legacy(uuid, text, integer, text) to service_role;
-- Backfill only uncanonical ZeloMenu orders that still have a confirmed public
-- cart session. The stable legacy idempotency key makes this block rerunnable.
do $$
declare
  legacy record;
  canonical jsonb;
  canonical_id uuid;
begin
  for legacy in
    select
      z.id as legacy_id,
      z.empresa_id,
      s.id as session_id,
      s.customer_snapshot,
      s.cart_snapshot,
      s.fulfillment_snapshot,
      s.pricing_snapshot,
      s.payment_snapshot
    from public.zelochat_orders z
    join public.zelomenu_cart_sessions s
      on s.metadata ->> 'productionOrderId' = z.id::text
    where z.source = 'zelomenu'
      and z.status = 'pending'
      and s.state in ('confirmed_waiting_review', 'confirmed_waiting_payment')
      and not exists (
        select 1 from public.zelo_orders o
        where o.legacy_zelochat_order_id = z.id
      )
  loop
    canonical := public.create_zelo_order(
      null,
      1,
      'legacy:zelochat:' || legacy.legacy_id::text,
      jsonb_build_object(
        'empresaId', legacy.empresa_id,
        'source', 'zelomenu',
        'customer', coalesce(legacy.customer_snapshot, '{}'::jsonb),
        'cart', coalesce(legacy.cart_snapshot, '{}'::jsonb),
        'fulfillment', coalesce(legacy.fulfillment_snapshot, '{}'::jsonb),
        'pricing', coalesce(legacy.pricing_snapshot, '{}'::jsonb),
        'payment', coalesce(legacy.payment_snapshot, '{}'::jsonb)
      )
    );
    canonical_id := (canonical ->> 'orderId')::uuid;

    update public.zelo_orders
    set legacy_zelochat_order_id = legacy.legacy_id,
        zelomenu_session_id = legacy.session_id
    where id = canonical_id;

    update public.zelochat_orders
    set zelomenu_session_id = legacy.session_id
    where id = legacy.legacy_id;

    update public.zelomenu_cart_sessions
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('canonicalOrderId', canonical_id),
        updated_at = now()
    where id = legacy.session_id;
  end loop;
end
$$;
commit;
