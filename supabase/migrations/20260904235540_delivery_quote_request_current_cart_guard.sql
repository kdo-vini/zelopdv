-- Forward-only guard for the currently attached delivery request. Existing ACL is preserved.
begin;
CREATE OR REPLACE FUNCTION public.resolve_zelomenu_delivery_quote_request(p_company_id uuid, p_request_id uuid, p_fee numeric, p_resolved_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(request_id uuid, session_id uuid, next_revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request public.zelomenu_delivery_quote_requests%rowtype;
  v_session public.zelomenu_cart_sessions%rowtype;
  v_fulfillment jsonb;
  v_pricing jsonb;
  v_subtotal numeric;
  v_discount numeric;
  v_revision bigint;
  v_now timestamptz := now();
  v_snapshot jsonb := coalesce(p_resolved_snapshot, '{}'::jsonb);
begin
  if p_fee is null or p_fee < 0 or p_fee > 100000 then
    raise exception using errcode = 'ZL400', message = 'INVALID_FEE';
  end if;

  select * into v_request
    from public.zelomenu_delivery_quote_requests
   where id = p_request_id
     and company_id = p_company_id
     and status = 'pending'
   for update;

  if not found then
    raise exception using errcode = 'ZL409', message = 'QUOTE_REQUEST_NOT_PENDING';
  end if;

  select * into v_session
    from public.zelomenu_cart_sessions
   where id = v_request.session_id
     and empresa_id = p_company_id
     and state = 'cart_open'
   for update;

  if not found then
    raise exception using errcode = 'ZL409', message = 'CART_SESSION_NOT_OPEN';
  end if;

  -- The request must still be the quote attached by the cart's successful CAS.
  -- An orphan from a failed CAS or a later address edit cannot override this cart.
  if v_session.fulfillment_snapshot->>'deliveryQuoteRequestId' is distinct from v_request.id::text then
    raise exception using errcode = 'ZL409', message = 'QUOTE_REQUEST_STALE';
  end if;

  v_subtotal := coalesce(nullif(v_session.pricing_snapshot->>'subtotal', '')::numeric, 0);
  v_discount := coalesce(nullif(v_session.pricing_snapshot->>'discount', '')::numeric, 0);
  v_pricing := jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(v_session.pricing_snapshot, '{}'::jsonb), '{deliveryFee}', to_jsonb(round(p_fee, 2)), true),
      '{total}',
      to_jsonb(round(v_subtotal + p_fee - least(greatest(v_discount, 0), v_subtotal + p_fee), 2)),
      true
    ),
    '{discount}',
    to_jsonb(round(least(greatest(v_discount, 0), v_subtotal + p_fee), 2)),
    true
  );

  v_fulfillment := coalesce(v_session.fulfillment_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'deliveryFee', round(p_fee, 2),
      'deliveryFeeToConfirm', false,
      'deliveryStatus', 'eligible',
      'deliveryCacheLayer', coalesce(v_snapshot->>'cacheLayer', 'manual'),
      'deliveryQuoteRequestId', v_request.id::text,
      'deliveryQuoteOverride', jsonb_build_object(
        'requestId', v_request.id::text,
        'fee', round(p_fee, 2),
        'distanceM', v_snapshot->'distanceM',
        'address', v_snapshot->'address',
        'coordinates', v_snapshot->'coordinates',
        'cacheLayer', coalesce(v_snapshot->>'cacheLayer', 'manual')
      )
    );

  v_revision := v_session.revision + 1;
  update public.zelomenu_cart_sessions
     set fulfillment_snapshot = v_fulfillment,
         pricing_snapshot = v_pricing,
         revision = v_revision,
         last_revalidated_at = v_now,
         last_revalidation = jsonb_build_object(
           'checkedAt', v_now,
           'ok', true,
           'issues', '[]'::jsonb,
           'previewCart', v_session.cart_snapshot,
           'previewPricing', v_pricing,
           'previewPayment', v_session.payment_snapshot
         ),
         updated_at = v_now
   where id = v_session.id;

  update public.zelomenu_delivery_quote_requests
     set status = 'resolved',
         resolved_fee = round(p_fee, 2),
         resolved_snapshot = v_snapshot || jsonb_build_object('fee', round(p_fee, 2)),
         resolved_at = v_now,
         updated_at = v_now
   where id = v_request.id;

  return query select v_request.id, v_session.id, v_revision;
end;
$function$;

commit;
