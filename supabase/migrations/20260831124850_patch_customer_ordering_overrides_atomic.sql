-- Atomic, allowlisted merge for ZeloChat-owned customer ordering preferences.
-- Null removes only the addressed key; concurrent patches cannot overwrite
-- unrelated preferences because the relationship is locked before the merge.
begin;

create or replace function public.patch_zelochat_customer_ordering_overrides(
  p_empresa_id uuid,
  p_owner_user_id uuid,
  p_pessoa_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_role boolean := coalesce(current_setting('role', true) = 'service_role', false);
  v_relationship public.zelochat_customer_relationships;
  v_key text;
  v_value jsonb;
  v_next jsonb;
  v_address text;
  v_neighborhood text;
  v_complement text;
  v_city text;
  v_state text;
  v_postal_code text;
  v_reference text;
begin
  if not v_service_role then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_empresa_id is null or p_owner_user_id is null or p_pessoa_id is null or p_patch is null
     or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_PATCH_INVALID';
  end if;
  if exists (
    select 1
      from jsonb_object_keys(p_patch) patch_key
     where patch_key <> all(array[
       'fulfillmentType', 'deliveryAddress', 'paymentMethod', 'habitualTime'
     ]::text[])
  ) then
    raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_PATCH_KEY_INVALID';
  end if;

  perform 1
    from public.empresa_perfil ep
   where ep.id = p_empresa_id
     and ep.user_id = p_owner_user_id;
  if not found then
    raise exception using errcode = 'ZL404', message = 'ORDERING_OVERRIDES_TENANT_INVALID';
  end if;
  perform 1
    from public.pessoas person
   where person.id = p_pessoa_id
     and person.id_usuario = p_owner_user_id
     and person.tipo = 'cliente';
  if not found then
    raise exception using errcode = 'ZL404', message = 'CUSTOMER_NOT_FOUND';
  end if;

  -- A row lock cannot protect a relationship that does not exist yet. The
  -- tenant/person advisory key serializes first creation as well as updates;
  -- the row lock remains the durable merge boundary once the row exists.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_empresa_id::text || ':' || p_pessoa_id::text, 0)
  );
  insert into public.zelochat_customer_relationships (
    empresa_id, id_usuario, pessoa_id, ordering_overrides, updated_by
  ) values (
    p_empresa_id, p_owner_user_id, p_pessoa_id, '{}'::jsonb, p_owner_user_id
  )
  on conflict (empresa_id, pessoa_id) do nothing;

  select * into v_relationship
    from public.zelochat_customer_relationships relationship
   where relationship.empresa_id = p_empresa_id
     and relationship.pessoa_id = p_pessoa_id
     and relationship.id_usuario = p_owner_user_id
   for update;
  if not found then
    raise exception using errcode = 'ZL409', message = 'ORDERING_OVERRIDES_RELATIONSHIP_CONFLICT';
  end if;
  v_next := coalesce(v_relationship.ordering_overrides, '{}'::jsonb);

  for v_key, v_value in
    select patch.key, patch.value from jsonb_each(p_patch) patch order by patch.key
  loop
    if jsonb_typeof(v_value) = 'null' then
      v_next := v_next - v_key;
      continue;
    end if;

    if v_key = 'fulfillmentType' then
      if jsonb_typeof(v_value) <> 'string'
         or v_value #>> '{}' not in ('delivery', 'pickup') then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_FULFILLMENT_INVALID';
      end if;
    elsif v_key = 'paymentMethod' then
      if jsonb_typeof(v_value) <> 'string'
         or nullif(btrim(v_value #>> '{}'), '') is null
         or char_length(v_value #>> '{}') > 80
         or (v_value #>> '{}') ~ '[[:cntrl:]]' then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_PAYMENT_INVALID';
      end if;
      v_value := to_jsonb(btrim(regexp_replace(v_value #>> '{}', '[[:space:]]+', ' ', 'g')));
    elsif v_key = 'habitualTime' then
      if jsonb_typeof(v_value) <> 'string'
         or v_value #>> '{}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_TIME_INVALID';
      end if;
    elsif v_key = 'deliveryAddress' then
      if jsonb_typeof(v_value) <> 'object'
         or exists (
           select 1 from jsonb_object_keys(v_value) address_key
            where address_key <> all(array[
              'address', 'neighborhood', 'complement', 'city', 'state', 'postalCode', 'reference'
            ]::text[])
         ) then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_ADDRESS_INVALID';
      end if;
      if jsonb_typeof(v_value->'address') <> 'string'
         or nullif(btrim(v_value->>'address'), '') is null
         or char_length(v_value->>'address') > 240
         or (v_value->>'address') ~ '[[:cntrl:]]' then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_ADDRESS_INVALID';
      end if;
      if exists (
        select 1 from (values
          ('neighborhood', 120), ('complement', 120), ('city', 120),
          ('state', 40), ('postalCode', 20), ('reference', 160)
        ) allowed(field, max_length)
        where v_value ? allowed.field
          and (
            jsonb_typeof(v_value->allowed.field) not in ('string', 'null')
            or (jsonb_typeof(v_value->allowed.field) = 'string' and (
              char_length(v_value->>allowed.field) > allowed.max_length
              or (v_value->>allowed.field) ~ '[[:cntrl:]]'
            ))
          )
      ) then
        raise exception using errcode = 'ZL400', message = 'ORDERING_OVERRIDES_ADDRESS_INVALID';
      end if;

      v_address := btrim(regexp_replace(v_value->>'address', '[[:space:]]+', ' ', 'g'));
      v_neighborhood := nullif(btrim(regexp_replace(v_value->>'neighborhood', '[[:space:]]+', ' ', 'g')), '');
      v_complement := nullif(btrim(regexp_replace(v_value->>'complement', '[[:space:]]+', ' ', 'g')), '');
      v_city := nullif(btrim(regexp_replace(v_value->>'city', '[[:space:]]+', ' ', 'g')), '');
      v_state := nullif(btrim(regexp_replace(v_value->>'state', '[[:space:]]+', ' ', 'g')), '');
      v_postal_code := nullif(btrim(regexp_replace(v_value->>'postalCode', '[[:space:]]+', ' ', 'g')), '');
      v_reference := nullif(btrim(regexp_replace(v_value->>'reference', '[[:space:]]+', ' ', 'g')), '');
      v_value := jsonb_build_object(
        'address', v_address,
        'neighborhood', v_neighborhood,
        'complement', v_complement,
        'city', v_city,
        'state', v_state,
        'postalCode', v_postal_code,
        'reference', v_reference
      );
    end if;

    v_next := jsonb_set(v_next, array[v_key], v_value, true);
  end loop;

  update public.zelochat_customer_relationships
     set ordering_overrides = v_next,
         updated_by = p_owner_user_id,
         updated_at = now()
   where id = v_relationship.id;
  return v_next;
end
$$;

comment on function public.patch_zelochat_customer_ordering_overrides(uuid, uuid, uuid, jsonb) is
  'Merge atômico server-only dos padrões de pedido do cliente; null remove somente a chave informada.';

revoke all on function public.patch_zelochat_customer_ordering_overrides(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.patch_zelochat_customer_ordering_overrides(uuid, uuid, uuid, jsonb)
  to service_role;

commit;
