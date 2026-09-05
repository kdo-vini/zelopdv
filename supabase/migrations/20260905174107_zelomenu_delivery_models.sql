-- ZeloMenu: cada empresa usa um único modelo de cálculo de entrega.
-- A configuração do modelo inativo permanece armazenada para permitir a troca
-- sem recadastrar dados.

alter table public.empresa_perfil
  add column if not exists delivery_mode text not null default 'distance';

alter table public.empresa_perfil
  drop constraint if exists empresa_perfil_delivery_mode_check;

alter table public.empresa_perfil
  add constraint empresa_perfil_delivery_mode_check
  check (delivery_mode in ('distance', 'neighborhood'));

comment on column public.empresa_perfil.delivery_mode is
  'Modelo ativo do delivery no ZeloMenu: distance ou neighborhood. A configuração do modelo inativo é preservada.';

create table if not exists public.zelomenu_delivery_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.empresa_perfil(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_name text not null check (length(normalized_name) between 1 and 120),
  delivery_price numeric(10,2) not null check (delivery_price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_zelomenu_delivery_neighborhood_name unique (company_id, normalized_name)
);

create index if not exists idx_zelomenu_delivery_neighborhoods_company_active_order
  on public.zelomenu_delivery_neighborhoods(company_id, active, sort_order, name);

comment on table public.zelomenu_delivery_neighborhoods is
  'ZeloMenu: bairros cadastrados para delivery por bairro. Registros inativos são preservados.';

comment on column public.zelomenu_delivery_neighborhoods.normalized_name is
  'Nome normalizado pelo backend para impedir duplicidades e validar pedidos conversacionais.';

create or replace function public.zelomenu_normalize_delivery_neighborhood_name_v1(p_name text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select regexp_replace(
    translate(
      lower(btrim(p_name)),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ),
    '\s+', ' ', 'g'
  );
$$;

comment on function public.zelomenu_normalize_delivery_neighborhood_name_v1(text) is
  'Normaliza nomes de bairros para o cadastro e para a validação exata dos pedidos via WhatsApp.';

alter table public.zelomenu_delivery_neighborhoods enable row level security;
drop policy if exists block_anon_zelomenu_delivery_neighborhoods on public.zelomenu_delivery_neighborhoods;
create policy block_anon_zelomenu_delivery_neighborhoods
  on public.zelomenu_delivery_neighborhoods
  as restrictive for all
  to public
  using (false)
  with check (false);

revoke all on table public.zelomenu_delivery_neighborhoods from public, anon, authenticated;
grant all on table public.zelomenu_delivery_neighborhoods to service_role;

-- Backfill idempotente do formato antigo { neighborhoods: [{ name, fee }] }.
-- Empresas existentes continuam no modelo distance, mesmo quando já possuem
-- bairros legados, para não alterar o comportamento publicado sem escolha do
-- operador.
insert into public.zelomenu_delivery_neighborhoods(
  company_id, name, normalized_name, delivery_price, active, sort_order
)
select ep.id,
       btrim(item->>'name'),
       public.zelomenu_normalize_delivery_neighborhood_name_v1(item->>'name'),
       round((item->>'fee')::numeric, 2),
       true,
       (items.ordinality - 1)::integer
  from public.empresa_perfil ep
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(ep.delivery_config->'neighborhoods') = 'array'
        then ep.delivery_config->'neighborhoods'
      else '[]'::jsonb
    end
 ) with ordinality as items(item, ordinality)
 where nullif(btrim(item->>'name'), '') is not null
   and coalesce(item->>'fee', '') ~ '^\d+(?:\.\d+)?$'
   and (item->>'fee')::numeric >= 0
on conflict (company_id, normalized_name) do update
  set name = excluded.name,
      delivery_price = excluded.delivery_price,
      active = true,
      sort_order = excluded.sort_order,
      updated_at = now();

-- RPC nova: salva o modelo ativo sem substituir o estado do modelo inativo.
-- O painel chama esta função com service_role; os dados não são expostos pela
-- API Data para clientes anônimos.
create or replace function public.save_zelomenu_delivery_configuration(
  p_empresa_id uuid,
  p_enabled boolean,
  p_mode text,
  p_address jsonb,
  p_ranges jsonb,
  p_neighborhoods jsonb,
  p_pricing_rules jsonb,
  p_estimated_delivery_minutes integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_neighborhood jsonb;
  v_name text;
  v_normalized text;
  v_price numeric;
  v_active boolean;
  v_sort integer;
begin
  if p_empresa_id is null
     or p_mode not in ('distance', 'neighborhood')
     or jsonb_typeof(coalesce(p_address, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_ranges, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_neighborhoods, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_pricing_rules, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if p_estimated_delivery_minutes is not null
     and (p_estimated_delivery_minutes < 1 or p_estimated_delivery_minutes > 1440) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_ESTIMATED_MINUTES_INVALID';
  end if;

  -- Reusa a validação já existente de endereço, faixas e regras somente no
  -- modelo por distância. Assim, trocar para bairro não exige CEP da loja.
  if p_mode = 'distance' then
    perform public.save_zelomenu_delivery_settings(
      p_empresa_id,
      coalesce(p_enabled, false),
      coalesce(p_address, '{}'::jsonb),
      coalesce(p_ranges, '[]'::jsonb),
      coalesce(p_pricing_rules, '[]'::jsonb)
    );
  else
    if exists (
      select 1
        from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) as item
       where jsonb_typeof(item) <> 'object'
          or nullif(btrim(item->>'name'), '') is null
          or coalesce(item->>'price', '') !~ '^\d+(\.\d+)?$'
          or case
            when coalesce(item->>'price', '') ~ '^\d+(\.\d+)?$'
              then (item->>'price')::numeric < 0
            else false
          end
          or (
            item ? 'active'
            and lower(coalesce(item->>'active', '')) not in ('true', 'false')
          )
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
    end if;

    if exists (
      select 1
        from (
          select public.zelomenu_normalize_delivery_neighborhood_name_v1(item->>'name') as normalized_name,
                 count(*) as total
            from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) as item
           group by 1
          having count(*) > 1
        ) duplicates
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_NEIGHBORHOOD_DUPLICATE';
    end if;

    if coalesce(p_enabled, false) and not exists (
      select 1
        from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) as item
       where coalesce((item->>'active')::boolean, true)
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_NEIGHBORHOOD_REQUIRED';
    end if;

    -- Bloqueia a empresa durante a substituição lógica da lista.
    perform 1 from public.empresa_perfil where id = p_empresa_id for update;
    if not found then
      raise exception using errcode = 'ZL404', message = 'EMPRESA_NOT_FOUND';
    end if;

    for v_neighborhood in select value from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) loop
      v_name := btrim(v_neighborhood->>'name');
      v_normalized := public.zelomenu_normalize_delivery_neighborhood_name_v1(v_name);
      v_price := round((v_neighborhood->>'price')::numeric, 2);
      v_active := lower(coalesce(v_neighborhood->>'active', 'true')) = 'true';
      v_sort := case
        when coalesce(v_neighborhood->>'sortOrder', '') ~ '^\d+$'
          then greatest((v_neighborhood->>'sortOrder')::integer, 0)
        else 0
      end;

      insert into public.zelomenu_delivery_neighborhoods(
        company_id, name, normalized_name, delivery_price, active, sort_order, updated_at
      ) values (
        p_empresa_id, v_name, v_normalized, v_price, v_active, v_sort, now()
      )
      on conflict (company_id, normalized_name) do update
        set name = excluded.name,
            delivery_price = excluded.delivery_price,
            active = excluded.active,
            sort_order = excluded.sort_order,
            updated_at = now();
    end loop;

    update public.zelomenu_delivery_neighborhoods existing
       set active = false,
           updated_at = now()
     where existing.company_id = p_empresa_id
       and not exists (
         select 1
           from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) as item
          where public.zelomenu_normalize_delivery_neighborhood_name_v1(item->>'name') = existing.normalized_name
       );
  end if;

  update public.empresa_perfil
     set delivery_mode = p_mode,
         zelomenu_delivery_estimated_minutes = p_estimated_delivery_minutes,
         delivery_config = jsonb_set(
           jsonb_set(
             coalesce(delivery_config, '{}'::jsonb),
             '{enabled}', to_jsonb(coalesce(p_enabled, false)), true
           ),
           '{mode}', to_jsonb(p_mode), true
         )
   where id = p_empresa_id;

  if not found then
    raise exception using errcode = 'ZL404', message = 'EMPRESA_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.save_zelomenu_delivery_configuration(uuid, boolean, text, jsonb, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.save_zelomenu_delivery_configuration(uuid, boolean, text, jsonb, jsonb, jsonb, jsonb, integer)
  to service_role;

notify pgrst, 'reload schema';

-- Atualiza a validação atômica já existente do WhatsApp sem duplicar a grande
-- rotina de rematerialização de produtos/modificadores. A função é lida do
-- catálogo do próprio banco, recebe a regra por bairro e é recriada com a
-- mesma assinatura/OID, mantendo as referências das RPCs existentes.
do $migration$
declare
  v_definition text;
  v_position integer;
  v_branch text := $branch$
  -- zelomenu_delivery_neighborhood_branch_v1
  if coalesce(ep.delivery_mode, 'distance') = 'neighborhood' then
    if coalesce(ep.delivery_config->>'enabled', 'false') <> 'true' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_unavailable'));
      v_fulfillment := v_fulfillment - array[
        'deliveryPostalCode', 'deliveryLatitude', 'deliveryLongitude',
        'deliveryDistanceM', 'deliveryQuoteRequestId', 'deliveryQuoteOverride',
        'deliveryPricingMode', 'deliveryPricingRuleLabel'
      ];
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFee}', '0'::jsonb, true);
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFeeToConfirm}', 'true'::jsonb, true);
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryStatus}', '"unavailable"'::jsonb, true);
      return jsonb_build_object('fulfillment', v_fulfillment, 'deliveryFee', 0, 'issues', v_issues);
    end if;

    if coalesce(v_fulfillment->>'deliveryStatus', '') <> 'eligible'
       or coalesce(v_fulfillment->>'deliveryFeeToConfirm', 'false') = 'true' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_revalidation_required'));
    end if;

    select neighborhood.id, neighborhood.name, neighborhood.delivery_price
      into v_rule
      from public.zelomenu_delivery_neighborhoods neighborhood
     where neighborhood.company_id = p_empresa_id
       and neighborhood.active = true
       and (
         (
           coalesce(v_fulfillment->>'deliveryNeighborhoodId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           and neighborhood.id = (v_fulfillment->>'deliveryNeighborhoodId')::uuid
         )
         or (
           nullif(btrim(v_fulfillment->>'deliveryNeighborhoodId'), '') is null
           and neighborhood.normalized_name = public.zelomenu_normalize_delivery_neighborhood_name_v1(
             coalesce(v_fulfillment->>'deliveryNeighborhood', '')
           )
         )
       )
     order by neighborhood.sort_order, neighborhood.name, neighborhood.id
     limit 1;

    if not found then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_neighborhood_invalid'));
      v_fulfillment := v_fulfillment - array[
        'deliveryPostalCode', 'deliveryLatitude', 'deliveryLongitude',
        'deliveryDistanceM', 'deliveryQuoteRequestId', 'deliveryQuoteOverride',
        'deliveryPricingMode', 'deliveryPricingRuleLabel'
      ];
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryMode}', '"neighborhood"'::jsonb, true);
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFee}', '0'::jsonb, true);
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFeeToConfirm}', 'true'::jsonb, true);
      v_fulfillment := jsonb_set(v_fulfillment, '{deliveryStatus}', '"unavailable"'::jsonb, true);
      return jsonb_build_object('fulfillment', v_fulfillment, 'deliveryFee', 0, 'issues', v_issues);
    end if;

    v_fee := round(v_rule.delivery_price, 2);
    v_stored_fee := case
      when coalesce(v_fulfillment->>'deliveryFee', '') ~ '^\d+(?:\.\d+)?$'
        then (v_fulfillment->>'deliveryFee')::numeric
      else 0
    end;
    if v_stored_fee is distinct from v_fee then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'delivery_quote_changed'));
    end if;

    v_fulfillment := v_fulfillment - array[
      'deliveryPostalCode', 'deliveryLatitude', 'deliveryLongitude',
      'deliveryDistanceM', 'deliveryQuoteRequestId', 'deliveryQuoteOverride',
      'deliveryPricingMode', 'deliveryPricingRuleLabel'
    ];
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryMode}', '"neighborhood"'::jsonb, true);
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryNeighborhoodId}', to_jsonb(v_rule.id), true);
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryNeighborhood}', to_jsonb(v_rule.name), true);
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFee}', to_jsonb(v_fee), true);
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryFeeToConfirm}', 'false'::jsonb, true);
    v_fulfillment := jsonb_set(v_fulfillment, '{deliveryStatus}', '"eligible"'::jsonb, true);
    return jsonb_build_object('fulfillment', v_fulfillment, 'deliveryFee', v_fee, 'issues', v_issues);
  end if;

$branch$;
begin
  select pg_get_functiondef(
    'public.zelomenu_whatsapp_fulfillment_v1(uuid,uuid,jsonb,timestamptz)'::regprocedure
  ) into v_definition;
  if position('zelomenu_delivery_neighborhood_branch_v1' in v_definition) = 0 then
    v_position := position('v_delivery_status := coalesce' in v_definition);
    if v_position = 0 then
      raise exception 'Não foi possível localizar o ponto de extensão da validação WhatsApp.';
    end if;
    v_definition := overlay(v_definition placing v_branch || E'\n' from v_position for 0);
    execute v_definition;
  end if;
end;
$migration$;

-- O lock da confirmação inclui os bairros, para impedir que uma alteração de
-- preço/ativação concorra com a leitura do preço canônico do pedido.
do $migration$
declare
  v_definition text;
  v_position integer;
  v_neighborhood_lock text := $lock$
  for v_lock in select id from public.zelomenu_delivery_neighborhoods where company_id = p_empresa_id order by id for update loop null; end loop;
$lock$;
begin
  select pg_get_functiondef(
    'public.confirm_whatsapp_zelo_order_atomic_v1(uuid,text,uuid,integer,text,text,uuid,text)'::regprocedure
  ) into v_definition;
  if position('zelomenu_delivery_neighborhoods where company_id = p_empresa_id' in v_definition) = 0 then
    v_position := position('for v_lock in select id from public.zelomenu_delivery_ranges' in v_definition);
    if v_position = 0 then
      raise exception 'Não foi possível localizar o lock de faixas da confirmação WhatsApp.';
    end if;
    v_definition := overlay(v_definition placing v_neighborhood_lock || E'\n' from v_position for 0);
    execute v_definition;
  end if;
end;
$migration$;

-- Cerca adicional na confirmação pública: o preço do bairro é sempre lido por
-- ID no banco, e o snapshot precisa conter os campos obrigatórios do modelo.
do $migration$
declare
  v_definition text;
  v_position integer;
  v_guard text := $guard$
  if coalesce((select delivery_mode from public.empresa_perfil where id = s.empresa_id), 'distance') = 'neighborhood'
     and p_snapshots#>>'{fulfillment,type}' = 'delivery' then
    if nullif(btrim(p_snapshots#>>'{fulfillment,deliveryStreet}'), '') is null
       or nullif(btrim(p_snapshots#>>'{fulfillment,deliveryNumber}'), '') is null then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_ADDRESS_REQUIRED';
    end if;
    if coalesce(p_snapshots#>>'{fulfillment,deliveryStatus}', '') <> 'eligible'
       or coalesce(p_snapshots#>>'{fulfillment,deliveryFeeToConfirm}', 'true') <> 'false' then
      raise exception using errcode = 'ZL409', message = 'DELIVERY_REVALIDATION_REQUIRED';
    end if;
    if not exists (
      select 1
        from public.zelomenu_delivery_neighborhoods neighborhood
       where neighborhood.company_id = s.empresa_id
         and neighborhood.active = true
         and neighborhood.id = case
           when coalesce(p_snapshots#>>'{fulfillment,deliveryNeighborhoodId}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             then (p_snapshots#>>'{fulfillment,deliveryNeighborhoodId}')::uuid
           else null
         end
    ) then
      raise exception using errcode = 'ZL409', message = 'DELIVERY_NEIGHBORHOOD_INVALID';
    end if;
    if (
      case
        when coalesce(p_snapshots#>>'{pricing,deliveryFee}', '') ~ '^\d+(?:\.\d+)?$'
          then (p_snapshots#>>'{pricing,deliveryFee}')::numeric
        else -1
      end
    ) is distinct from (
      select neighborhood.delivery_price
        from public.zelomenu_delivery_neighborhoods neighborhood
       where neighborhood.company_id = s.empresa_id
         and neighborhood.active = true
         and neighborhood.id = (p_snapshots#>>'{fulfillment,deliveryNeighborhoodId}')::uuid
    ) then
      raise exception using errcode = 'ZL409', message = 'DELIVERY_QUOTE_CHANGED';
    end if;
  end if;

$guard$;
begin
  select pg_get_functiondef(
    'public.confirm_public_zelo_order_atomic(uuid,text,integer,text,jsonb)'::regprocedure
  ) into v_definition;
  if position('DELIVERY_NEIGHBORHOOD_INVALID' in v_definition) = 0 then
    v_position := position('select user_id into v_owner' in v_definition);
    if v_position = 0 then
      raise exception 'Não foi possível localizar o ponto de extensão da confirmação pública.';
    end if;
    v_definition := overlay(v_definition placing v_guard || E'\n' from v_position for 0);
    execute v_definition;
  end if;
end;
$migration$;

revoke all on function public.zelomenu_normalize_delivery_neighborhood_name_v1(text) from public, anon, authenticated;
grant execute on function public.zelomenu_normalize_delivery_neighborhood_name_v1(text) to service_role;

notify pgrst, 'reload schema';
