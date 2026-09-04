-- Public checkout: bind token/revision, snapshots, canonical order and coupon in one commit.
-- No historical redemption is deleted or guessed to be an orphan.
begin;

create or replace function public.confirm_public_zelo_order_atomic(
  p_session_id uuid,
  p_token_hash text,
  p_expected_revision integer,
  p_idempotency_key text,
  p_snapshots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  s public.zelomenu_cart_sessions;
  c public.zelomenu_coupons;
  o public.zelo_orders;
  v_owner uuid;
  v_code text;
  v_phone text;
  v_subtotal numeric;
  v_fee numeric;
  v_discount numeric := 0;
  v_result jsonb;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,120}$' then
    raise exception using errcode = 'ZL400', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  select * into s from public.zelomenu_cart_sessions where id = p_session_id for update;
  if not found or s.archived_at is not null or s.context <> 'public_order' then
    raise exception using errcode = 'ZL404', message = 'CART_NOT_FOUND';
  end if;
  if s.current_token_hash is distinct from p_token_hash or not exists (
    select 1 from public.zelomenu_cart_tokens t where t.session_id = s.id
      and t.token_hash = p_token_hash and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now())
  ) then
    raise exception using errcode = 'ZL410', message = 'STALE_CART_TOKEN';
  end if;

  -- A lost response may be retried with the previous revision. Only this session's
  -- existing order is eligible for replay; an idempotency key cannot cross sessions.
  select * into o from public.zelo_orders where zelomenu_session_id = s.id for update;
  if found then
    return public.create_zelo_order(s.id, s.revision, p_idempotency_key, '{}'::jsonb, null);
  end if;
  if exists (select 1 from public.zelo_orders where empresa_id = s.empresa_id and idempotency_key = p_idempotency_key) then
    raise exception using errcode = 'ZL409', message = 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  if s.state <> 'cart_open' then
    raise exception using errcode = 'ZL409', message = 'CART_ALREADY_CLOSED';
  end if;
  if p_expected_revision is null or s.revision <> p_expected_revision then
    raise exception using errcode = 'ZL409', message = 'REVISION_CONFLICT';
  end if;
  if jsonb_typeof(p_snapshots->'cart') is distinct from 'object'
    or jsonb_typeof(p_snapshots->'pricing') is distinct from 'object'
    or jsonb_typeof(p_snapshots->'fulfillment') is distinct from 'object'
    or jsonb_typeof(p_snapshots->'payment') is distinct from 'object' then
    raise exception using errcode = 'ZL400', message = 'INVALID_SNAPSHOTS';
  end if;

  select user_id into v_owner from public.empresa_perfil where id = s.empresa_id;
  v_code := nullif(s.pricing_snapshot->>'couponCode', '');
  if nullif(p_snapshots#>>'{pricing,couponCode}', '') is distinct from v_code then
    raise exception using errcode = 'ZL409', message = 'COUPON_CHANGED';
  end if;
  v_subtotal := (p_snapshots#>>'{pricing,subtotal}')::numeric;
  v_fee := (p_snapshots#>>'{pricing,deliveryFee}')::numeric;
  if v_subtotal is null or v_fee is null or v_subtotal < 0 or v_fee < 0 then
    raise exception using errcode = 'ZL400', message = 'INVALID_TOTAL';
  end if;
  if v_code is not null then
    select * into c from public.zelomenu_coupons
      where id_usuario = v_owner and code = v_code for update;
    if not found or not c.active then
      raise exception using errcode = 'ZL400', message = 'COUPON_INVALID';
    end if;
    if c.starts_at > now() or c.expires_at < now() then
      raise exception using errcode = 'ZL400', message = 'COUPON_EXPIRED';
    end if;
    if c.min_order_value is not null and v_subtotal < c.min_order_value then
      raise exception using errcode = 'ZL400', message = 'COUPON_MIN_NOT_MET';
    end if;
    v_phone := regexp_replace(coalesce(s.customer_snapshot->>'phone', ''), '[^0-9]', '', 'g');
    if v_phone !~ '^[0-9]{8,15}$' then
      raise exception using errcode = 'ZL400', message = 'CUSTOMER_DETAILS_REQUIRED';
    end if;
    if exists (select 1 from public.zelomenu_coupon_redemptions where coupon_id = c.id and customer_phone = v_phone) then
      raise exception using errcode = 'ZL409', message = 'COUPON_ALREADY_USED';
    end if;
    v_discount := case c.discount_type
      when 'valor' then least(c.discount_value, v_subtotal)
      when 'percentual' then round(v_subtotal * c.discount_value / 100, 2)
      when 'frete_gratis' then v_fee end;
    v_discount := round(greatest(0, least(v_discount, v_subtotal + v_fee)), 2);
  end if;
  if (p_snapshots#>>'{pricing,discount}')::numeric is distinct from v_discount then
    raise exception using errcode = 'ZL409', message = 'COUPON_CHANGED';
  end if;

  -- create_zelo_order intentionally reads the locked session, not its p_snapshots argument.
  update public.zelomenu_cart_sessions set
    cart_snapshot = p_snapshots->'cart', fulfillment_snapshot = p_snapshots->'fulfillment',
    pricing_snapshot = p_snapshots->'pricing', payment_snapshot = p_snapshots->'payment',
    updated_at = now()
    where id = s.id;
  v_result := public.create_zelo_order(s.id, s.revision, p_idempotency_key, '{}'::jsonb, null);
  select * into o from public.zelo_orders where id = (v_result->>'orderId')::uuid;
  if not found or o.zelomenu_session_id is distinct from s.id then
    raise exception using errcode = 'ZL409', message = 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  if v_code is not null then
    begin
      insert into public.zelomenu_coupon_redemptions(coupon_id, id_usuario, customer_phone, order_id)
        values (c.id, v_owner, v_phone, o.id);
    exception when unique_violation then
      raise exception using errcode = 'ZL409', message = 'COUPON_ALREADY_USED';
    end;
  end if;
  return v_result;
end
$function$;

revoke all on function public.confirm_public_zelo_order_atomic(uuid,text,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_public_zelo_order_atomic(uuid,text,integer,text,jsonb) to service_role;
comment on function public.confirm_public_zelo_order_atomic(uuid,text,integer,text,jsonb) is
  'Server-only public checkout; snapshots, canonical order and one-per-phone coupon redemption share one transaction. Never release a redemption after an ambiguous HTTP result.';
commit;
