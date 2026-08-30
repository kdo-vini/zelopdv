-- Single transactional confirmation boundary for conversational WhatsApp
-- orders. It deliberately delegates final aggregate creation to the existing
-- canonical create_zelo_order function; no parallel order engine is created.
create or replace function public.confirm_whatsapp_zelo_order_atomic_v1(
  p_empresa_id uuid,
  p_source_ref text,
  p_session_id uuid,
  p_expected_revision integer,
  p_message_id text,
  p_idempotency_key text,
  p_pessoa_id uuid,
  p_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_role boolean := coalesce(current_setting('role', true) = 'service_role', false);
  s public.zelomenu_cart_sessions;
  v_token public.zelomenu_whatsapp_confirmation_tokens;
  v_order public.zelo_orders;
  v_item jsonb;
  v_cart jsonb := jsonb_build_object('items', '[]'::jsonb);
  v_pricing jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_materialized_item jsonb;
  v_product record;
  v_modifier_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_result jsonb;
  v_message_ids jsonb;
  v_changed boolean := false;
begin
  if not v_service_role then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_empresa_id is null or p_session_id is null
     or nullif(trim(p_source_ref), '') is null
     or p_expected_revision is null or p_expected_revision <= 0
     or nullif(trim(p_message_id), '') is null
     or nullif(trim(p_idempotency_key), '') is null
     or (p_token_hash is not null and lower(p_token_hash) !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = 'ZL400', message = 'WHATSAPP_CONFIRMATION_INPUT_INVALID';
  end if;

  -- Universal order: session before optional confirmation token.
  select * into s
    from public.zelomenu_cart_sessions
   where id = p_session_id
   for update;
  if not found or s.context <> 'whatsapp_order'
     or s.empresa_id <> p_empresa_id or s.source_ref <> p_source_ref then
    return jsonb_build_object('outcome', 'conflict', 'revision', coalesce(s.revision, null), 'snapshot', to_jsonb(s));
  end if;

  select * into v_order
    from public.zelo_orders
   where zelomenu_session_id = s.id
   for update;
  if found then
    return jsonb_build_object(
      'outcome', 'confirmed', 'alreadyConfirmed', true,
      'orderId', v_order.id, 'revision', s.revision, 'snapshot', to_jsonb(s)
    );
  end if;
  if s.state <> 'cart_open' or s.revision <> p_expected_revision then
    return jsonb_build_object('outcome', 'conflict', 'revision', s.revision, 'snapshot', to_jsonb(s));
  end if;

  if p_token_hash is not null then
    select * into v_token
      from public.zelomenu_whatsapp_confirmation_tokens
     where token_hash = lower(p_token_hash)
       and session_id = s.id
     for update;
    if not found or v_token.empresa_id <> p_empresa_id or v_token.source_ref <> p_source_ref
       or v_token.revision <> p_expected_revision or v_token.consumed_at is not null
       or v_token.invalidated_at is not null or v_token.expires_at <= now() then
      raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_INVALID';
    end if;
  end if;

  -- Re-materialize every line by public IDs. Publication, pause, current
  -- product price and stock are live database facts, never caller snapshots.
  if jsonb_typeof(s.cart_snapshot->'items') <> 'array' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'items_invalid'));
  else
    for v_item in select value from jsonb_array_elements(s.cart_snapshot->'items') loop
      select p.id, p.nome, p.preco, p.controlar_estoque, p.estoque_atual
        into v_product
        from public.produtos p
        join public.empresa_perfil ep on ep.id = s.empresa_id and ep.user_id = p.id_usuario
        join public.zelomenu_product_publications pub
          on pub.id_produto = p.id and pub.id_usuario = p.id_usuario
         and pub.visivel_online = true and pub.pausado_manualmente = false
       where p.id = nullif(v_item->>'productId', '')::bigint
       for update of p;
      if not found then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'product_unavailable', 'productId', v_item->>'productId'));
        continue;
      end if;
      if coalesce((v_item->>'quantity')::integer, 0) not between 1 and 999 then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'quantity_invalid', 'productId', v_product.id));
        continue;
      end if;
      if coalesce(v_product.controlar_estoque, false)
         and coalesce(v_product.estoque_atual, 0) < (v_item->>'quantity')::integer then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'stock_unavailable', 'productId', v_product.id));
        continue;
      end if;
      select coalesce(sum(o.price_delta), 0) into v_modifier_total
        from jsonb_array_elements(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) chosen
        join public.zelomenu_modifier_groups g
          on g.id = nullif(chosen->>'groupId', '')::uuid and g.id_produto = v_product.id and g.ativo = true
        join public.zelomenu_modifier_options o
          on o.id = nullif(chosen->>'optionId', '')::uuid and o.id_grupo = g.id and o.ativo = true;
      if jsonb_array_length(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) <> (
        select count(*) from jsonb_array_elements(coalesce(v_item->'selectedModifiers', '[]'::jsonb)) chosen
          join public.zelomenu_modifier_groups g on g.id = nullif(chosen->>'groupId', '')::uuid and g.id_produto = v_product.id and g.ativo = true
          join public.zelomenu_modifier_options o on o.id = nullif(chosen->>'optionId', '')::uuid and o.id_grupo = g.id and o.ativo = true
      ) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'modifier_unavailable', 'productId', v_product.id));
        continue;
      end if;
      v_materialized_item := jsonb_build_object(
        'productId', v_product.id, 'productName', v_product.nome,
        'unitPrice', v_product.preco + v_modifier_total,
        'quantity', (v_item->>'quantity')::integer,
        'lineTotal', (v_product.preco + v_modifier_total) * (v_item->>'quantity')::integer,
        'position', coalesce((v_item->>'position')::integer, 0),
        'selectedModifiers', coalesce(v_item->'selectedModifiers', '[]'::jsonb),
        'notes', nullif(v_item->>'notes', '')
      );
      v_cart := jsonb_set(v_cart, '{items}', (v_cart->'items') || jsonb_build_array(v_materialized_item));
      v_subtotal := v_subtotal + (v_product.preco + v_modifier_total) * (v_item->>'quantity')::integer;
    end loop;
  end if;

  -- Delivery, coverage and opening-hour quotes are persisted by the menu
  -- materializer. A stale/missing current validation fails closed into review;
  -- this RPC never confirms an unquoted delivery or unavailable store slot.
  if coalesce(s.fulfillment_snapshot->>'type', 'pickup') = 'delivery'
     and (coalesce(s.fulfillment_snapshot->>'deliveryStatus', '') not in ('quoted', 'available')
          or coalesce((s.fulfillment_snapshot->>'deliveryFeeToConfirm')::boolean, false)) then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_revalidation_required'));
  end if;
  if coalesce((s.fulfillment_snapshot->>'asap')::boolean, false)
     and coalesce((s.last_revalidation->>'storeOpen')::boolean, true) = false then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'store_closed'));
  end if;

  v_delivery_fee := coalesce((s.fulfillment_snapshot->>'deliveryFee')::numeric, 0);
  v_discount := coalesce((s.pricing_snapshot->>'discount')::numeric, 0);
  v_pricing := jsonb_build_object('subtotal', v_subtotal, 'deliveryFee', v_delivery_fee,
    'discount', v_discount, 'total', v_subtotal + v_delivery_fee - v_discount);
  v_changed := s.cart_snapshot is distinct from v_cart or s.pricing_snapshot is distinct from v_pricing
    or jsonb_array_length(v_issues) > 0;
  if v_changed then
    v_message_ids := coalesce(s.metadata->'processedMessageIds', '[]'::jsonb) || to_jsonb(p_message_id);
    update public.zelomenu_cart_sessions
       set cart_snapshot = v_cart,
           pricing_snapshot = v_pricing,
           last_revalidated_at = now(),
           last_revalidation = jsonb_build_object('checkedAt', now(), 'ok', false, 'issues', v_issues,
             'previewCart', v_cart, 'previewPricing', v_pricing),
           metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object('processedMessageIds', v_message_ids),
           revision = s.revision + 1,
           updated_at = now()
     where id = s.id;
    if p_token_hash is not null then
      update public.zelomenu_whatsapp_confirmation_tokens
         set invalidated_at = now()
       where id = v_token.id and invalidated_at is null and consumed_at is null;
    end if;
    return jsonb_build_object('outcome', 'requires_review', 'alreadyConfirmed', false,
      'revision', s.revision + 1, 'issues', v_issues, 'cart', v_cart, 'pricing', v_pricing);
  end if;

  v_result := public.create_zelo_order(s.id, s.revision, p_idempotency_key, '{}'::jsonb, p_pessoa_id);
  update public.zelomenu_cart_sessions
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'processedMessageIds', coalesce(metadata->'processedMessageIds', '[]'::jsonb) || to_jsonb(p_message_id)
         ), updated_at = now()
   where id = s.id;
  if p_token_hash is not null then
    update public.zelomenu_whatsapp_confirmation_tokens
       set consumed_at = coalesce(consumed_at, now())
     where id = v_token.id;
  end if;
  return jsonb_build_object('outcome', 'confirmed', 'alreadyConfirmed', coalesce((v_result->>'alreadyConfirmed')::boolean, false),
    'orderId', v_result->>'orderId', 'revision', s.revision);
end
$$;

comment on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text) is
  'Confirmação WhatsApp atômica server-only: lock sessão→token, rematerializa catálogo vivo e delega criação ao create_zelo_order canônico; mudanças retornam requires_review.';

revoke all on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_zelo_order_atomic_v1(uuid, text, uuid, integer, text, text, uuid, text)
  to service_role;
