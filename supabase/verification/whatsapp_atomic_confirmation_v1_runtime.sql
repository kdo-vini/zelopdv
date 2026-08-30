-- Behavioral verifier for the atomic WhatsApp confirmation migration.
-- Run only against the disposable local database through the gated Node harness.
begin;

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a4000000-0000-4000-8000-000000000001',
  'atomic-whatsapp-verifier@invalid.local',
  'authenticated', 'authenticated', '{}', '{}', now(), now()
);

insert into public.empresa_perfil (
  id, user_id, nome_exibicao, timezone, horario_semanal,
  delivery_config, delivery_latitude, delivery_longitude, delivery_location_version,
  zelomenu_scheduling_enabled, zelomenu_scheduling_lead_time_minutes
) values (
  'a4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001',
  'Loja do verificador atômico', 'America/Sao_Paulo',
  '{"sun":[{"start":"00:00","end":"24:00"}],"mon":[{"start":"00:00","end":"24:00"}],"tue":[{"start":"00:00","end":"24:00"}],"wed":[{"start":"00:00","end":"24:00"}],"thu":[{"start":"00:00","end":"24:00"}],"fri":[{"start":"00:00","end":"24:00"}],"sat":[{"start":"00:00","end":"24:00"}]}'::jsonb,
  '{"enabled":true,"pricingVersion":7,"timezone":"America/Sao_Paulo"}'::jsonb,
  -23.5505, -46.6333, 3, true, 30
);

insert into public.categorias (id, id_usuario, nome)
values (2147483000, 'a4000000-0000-4000-8000-000000000001', 'Categoria pública');

insert into public.produtos (
  id, id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual
) values
  (2147483001, 'a4000000-0000-4000-8000-000000000001', 2147483000, 'Base interna', 10, true, 10),
  (2147483002, 'a4000000-0000-4000-8000-000000000001', 2147483000, 'Bacon vinculado', 2, true, 1);

insert into public.zelomenu_product_publications (
  id, id_usuario, id_produto, nome_publico, visivel_online, pausado_manualmente
) values
  ('a4000000-0000-4000-8000-000000000011', 'a4000000-0000-4000-8000-000000000001', 2147483001, 'Base pública', true, false),
  ('a4000000-0000-4000-8000-000000000012', 'a4000000-0000-4000-8000-000000000001', 2147483002, 'Bacon público', false, false);

insert into public.zelomenu_modifier_groups (
  id, id_usuario, id_produto, nome, tipo, min_selecoes, max_selecoes,
  ativo, ordem, modo_preco, permite_quantidade, maximo_por_opcao
) values
  ('a4000000-0000-4000-8000-000000000021', 'a4000000-0000-4000-8000-000000000001', 2147483001,
   'Tamanho', 'variacao', 1, 1, true, 0, 'substituir', false, null),
  ('a4000000-0000-4000-8000-000000000022', 'a4000000-0000-4000-8000-000000000001', 2147483001,
   'Adicionais', 'adicional', 1, 2, true, 1, 'somar', true, 3);

insert into public.zelomenu_modifier_options (
  id, id_usuario, id_grupo, nome, price_delta, ativo, ordem
) values
  ('a4000000-0000-4000-8000-000000000031', 'a4000000-0000-4000-8000-000000000001',
   'a4000000-0000-4000-8000-000000000021', 'Grande', 12, true, 0),
  ('a4000000-0000-4000-8000-000000000032', 'a4000000-0000-4000-8000-000000000001',
   'a4000000-0000-4000-8000-000000000022', 'Bacon antigo', 99, true, 0);

insert into public.zelomenu_modifier_option_products (
  id_opcao, id_usuario, id_produto, price_override
) values (
  'a4000000-0000-4000-8000-000000000032',
  'a4000000-0000-4000-8000-000000000001', 2147483002, 1.50
);

insert into public.zelomenu_delivery_ranges (id, company_id, max_distance_m, delivery_price)
values ('a4000000-0000-4000-8000-000000000041', 'a4000000-0000-4000-8000-000000000002', 2000, 5);
insert into public.zelomenu_delivery_pricing_rules (
  id, company_id, label, start_minute, end_minute, enabled, days_of_week
) values (
  'a4000000-0000-4000-8000-000000000042', 'a4000000-0000-4000-8000-000000000002',
  'Faixa atual', 0, 1440, true, '{0,1,2,3,4,5,6}'
);
insert into public.zelomenu_delivery_pricing_rule_ranges (
  id, pricing_rule_id, max_distance_m, delivery_price
) values (
  'a4000000-0000-4000-8000-000000000043', 'a4000000-0000-4000-8000-000000000042', 2000, 7
);
insert into public.zelomenu_delivery_distance_cache (
  id, company_id, destination_address_hash, origin_location_version,
  latitude, longitude, distance_m, is_stale, expires_at
) values (
  'a4000000-0000-4000-8000-000000000044', 'a4000000-0000-4000-8000-000000000002',
  'fixture-address-hash', 3, -23.551, -46.634, 1000, false, now() + interval '1 hour'
);

set local role service_role;

do $$
declare
  v_input jsonb := jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object(
      'productId', 2147483001, 'quantity', 1, 'notes', 'Sem cebola',
      'selectedModifiers', jsonb_build_array(
        jsonb_build_object(
          'groupId', 'a4000000-0000-4000-8000-000000000021',
          'selectedOptions', jsonb_build_array(jsonb_build_object(
            'optionId', 'a4000000-0000-4000-8000-000000000031', 'quantity', 1
          ))
        ),
        jsonb_build_object(
          'groupId', 'a4000000-0000-4000-8000-000000000022',
          'selectedOptions', jsonb_build_array(jsonb_build_object(
            'optionId', 'a4000000-0000-4000-8000-000000000032', 'quantity', 2
          ))
        )
      )
    )),
    'observations', 'Sem guardanapo'
  );
  v_materialized jsonb;
  v_fulfillment jsonb;
  v_delivery jsonb;
  v_result jsonb;
  v_session uuid;
begin
  v_materialized := public.zelomenu_whatsapp_materialize_cart_v1(
    'a4000000-0000-4000-8000-000000000002', v_input
  );
  if v_materialized#>>'{cart,items,0,productName}' <> 'Base pública'
     or (v_materialized#>>'{cart,items,0,baseUnitPrice}')::numeric <> 10
     or (v_materialized#>>'{cart,items,0,modifierDeltaTotal}')::numeric <> 5
     or (v_materialized#>>'{cart,items,0,unitPrice}')::numeric <> 15
     or (v_materialized#>>'{cart,items,0,selectedModifiers,1,selectedOptions,0,quantity}')::integer <> 2
     or (v_materialized#>>'{cart,items,0,selectedModifiers,1,selectedOptions,0,priceDelta}')::numeric <> 1.5
     or v_materialized#>>'{cart,observations}' <> 'Sem guardanapo'
     or (v_materialized#>'{cart,items,0}') ? 'position'
     or jsonb_array_length(v_materialized->'issues') <> 1 then
    -- The only issue is aggregated linked stock: 2 Bacon requested, stock 1.
    raise exception 'nested_modifier_shape_ok failed: %', v_materialized;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_materialized->'issues') issue
     where issue->>'code' = 'stock_unavailable'
       and issue->>'productId' = '2147483002'
       and (issue->>'requiredQuantity')::numeric = 2
  ) then
    raise exception 'aggregate_linked_stock_review_ok failed: %', v_materialized;
  end if;

  v_fulfillment := jsonb_build_object(
    'type', 'delivery', 'asap', true, 'pickupDate', null, 'pickupTime', null,
    'deliveryAddress', 'Rua Fixture, 1', 'deliveryNeighborhood', 'Centro',
    'deliveryFee', 7, 'deliveryFeeToConfirm', false,
    'deliveryPostalCode', '01001000', 'deliveryNumber', '1', 'deliveryComplement', null,
    'deliveryStreet', 'Rua Fixture', 'deliveryCity', 'São Paulo', 'deliveryState', 'SP',
    'deliveryLatitude', -23.551, 'deliveryLongitude', -46.634, 'deliveryDistanceM', 1000,
    'deliveryStatus', 'eligible', 'deliveryCacheLayer', 'supabase',
    'deliveryQuoteRequestId', null, 'deliveryQuoteOverride', null,
    'deliveryPricingMode', 'custom_time', 'deliveryPricingRuleLabel', 'Faixa atual'
  );
  v_delivery := public.zelomenu_whatsapp_fulfillment_v1(
    'a4000000-0000-4000-8000-000000000002', v_fulfillment, now()
  );
  if jsonb_array_length(v_delivery->'issues') <> 0
     or (v_delivery->>'deliveryFee')::numeric <> 7
     or v_delivery#>>'{fulfillment,deliveryStatus}' <> 'eligible' then
    raise exception 'fresh_delivery_quote_ok failed: %', v_delivery;
  end if;

  update public.zelomenu_delivery_distance_cache
     set expires_at = now() - interval '1 second'
   where id = 'a4000000-0000-4000-8000-000000000044';
  v_delivery := public.zelomenu_whatsapp_fulfillment_v1(
    'a4000000-0000-4000-8000-000000000002', v_fulfillment, now()
  );
  if not exists (
    select 1 from jsonb_array_elements(v_delivery->'issues') issue
     where issue->>'code' = 'delivery_quote_stale'
  ) then
    raise exception 'stale_delivery_review_ok failed: %', v_delivery;
  end if;

  -- RPC proof for aggregate linked stock: review is persisted and no order exists.
  insert into public.zelomenu_cart_sessions (
    id, empresa_id, context, state, source_ref, customer_snapshot, cart_snapshot,
    fulfillment_snapshot, pricing_snapshot, payment_snapshot, revision
  ) values (
    'a4000000-0000-4000-8000-000000000051', 'a4000000-0000-4000-8000-000000000002',
    'whatsapp_order', 'cart_open', 'atomic-stock@s.whatsapp.net', '{}', v_input,
    '{"type":"pickup","asap":true,"pickupDate":null,"pickupTime":null,"deliveryAddress":null,"deliveryNeighborhood":null,"deliveryFee":0,"deliveryFeeToConfirm":false}'::jsonb,
    '{"subtotal":0,"deliveryFee":0,"discount":0,"couponCode":null,"couponDiscountType":null,"couponDiscountValue":null,"total":0}'::jsonb,
    '{"declaredMethod":null,"pixReceiptRequired":false,"pixReceiptApproved":false}', 1
  );
  v_result := public.confirm_whatsapp_zelo_order_atomic_v1(
    'a4000000-0000-4000-8000-000000000002', 'atomic-stock@s.whatsapp.net',
    'a4000000-0000-4000-8000-000000000051', 1, 'message-stock', 'idem-stock', null, null
  );
  if v_result->>'outcome' <> 'requires_review'
     or exists (select 1 from public.zelo_orders where zelomenu_session_id = 'a4000000-0000-4000-8000-000000000051') then
    raise exception 'aggregate_linked_stock_review_ok RPC failed: %', v_result;
  end if;

  -- Restore enough linked stock, rematerialize an exact canonical snapshot and
  -- prove an unchanged confirmation reaches create_zelo_order without a loop.
  update public.produtos set estoque_atual = 10 where id = 2147483002;
  update public.zelomenu_delivery_distance_cache
     set expires_at = now() + interval '1 hour'
   where id = 'a4000000-0000-4000-8000-000000000044';
  v_materialized := public.zelomenu_whatsapp_materialize_cart_v1(
    'a4000000-0000-4000-8000-000000000002', v_input
  );
  if jsonb_array_length(v_materialized->'issues') <> 0 then
    raise exception 'canonical fixture unexpectedly invalid: %', v_materialized;
  end if;
  v_session := 'a4000000-0000-4000-8000-000000000052';
  insert into public.zelomenu_cart_sessions (
    id, empresa_id, context, state, source_ref, customer_snapshot, cart_snapshot,
    fulfillment_snapshot, pricing_snapshot, payment_snapshot, revision
  ) values (
    v_session, 'a4000000-0000-4000-8000-000000000002',
    'whatsapp_order', 'cart_open', 'atomic-noop@s.whatsapp.net', '{}', v_materialized->'cart',
    '{"type":"pickup","asap":true,"pickupDate":null,"pickupTime":null,"deliveryAddress":null,"deliveryNeighborhood":null,"deliveryFee":0,"deliveryFeeToConfirm":false}'::jsonb,
    jsonb_build_object(
      'subtotal', (v_materialized->>'subtotal')::numeric, 'deliveryFee', 0, 'discount', 0,
      'couponCode', null, 'couponDiscountType', null, 'couponDiscountValue', null,
      'total', (v_materialized->>'subtotal')::numeric
    ),
    '{"declaredMethod":null,"pixReceiptRequired":false,"pixReceiptApproved":false}', 1
  );
  v_result := public.confirm_whatsapp_zelo_order_atomic_v1(
    'a4000000-0000-4000-8000-000000000002', 'atomic-noop@s.whatsapp.net',
    v_session, 1, 'message-noop', 'idem-noop', null, null
  );
  if v_result->>'outcome' <> 'confirmed'
     or not exists (select 1 from public.zelo_orders where zelomenu_session_id = v_session)
     or (select cart_snapshot from public.zelomenu_cart_sessions where id = v_session) is distinct from v_materialized->'cart' then
    raise exception 'canonical_noop_confirmed_ok failed: %', v_result;
  end if;
end
$$;

rollback;
