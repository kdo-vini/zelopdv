


\if :{?zelo_disposable_baseline}
  \if :zelo_disposable_baseline
  \else
    \echo 'Refusing baseline restore: zelo_disposable_baseline must be truthy in the disposable local harness.'
    \quit 3
  \endif
\else
  \echo 'Refusing baseline restore: set zelo_disposable_baseline=1 in the disposable local harness.'
  \quit 3
\endif

-- A fresh local Supabase stack may auto-grant every table privilege to Data
-- API roles before this dump runs. Reset only that creation-time default; the
-- exact production object ACLs and final default privileges are restored below.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."agent_run_status" AS ENUM (
    'running',
    'success',
    'partial',
    'failed'
);


ALTER TYPE "public"."agent_run_status" OWNER TO "postgres";


CREATE TYPE "public"."approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);


ALTER TYPE "public"."approval_status" OWNER TO "postgres";


CREATE TYPE "public"."fit_status" AS ENUM (
    'qualified',
    'nurture',
    'ignore'
);


ALTER TYPE "public"."fit_status" OWNER TO "postgres";


CREATE TYPE "public"."lead_status" AS ENUM (
    'new',
    'qualified',
    'approved',
    'contacted',
    'replied',
    'interested',
    'meeting_scheduled',
    'won',
    'lost',
    'ignored',
    'blocked'
);


ALTER TYPE "public"."lead_status" OWNER TO "postgres";


CREATE TYPE "public"."message_direction" AS ENUM (
    'outbound',
    'inbound'
);


ALTER TYPE "public"."message_direction" OWNER TO "postgres";


CREATE TYPE "public"."outreach_status" AS ENUM (
    'draft',
    'queued',
    'sent',
    'failed',
    'bounced',
    'opened',
    'clicked'
);


ALTER TYPE "public"."outreach_status" OWNER TO "postgres";


CREATE TYPE "public"."product_fit" AS ENUM (
    'zelopdv',
    'zelochat',
    'both',
    'none'
);


ALTER TYPE "public"."product_fit" OWNER TO "postgres";


CREATE TYPE "public"."whatsapp_mode" AS ENUM (
    'draft_only',
    'approved_send_warm',
    'approved_template',
    'blocked_cold'
);


ALTER TYPE "public"."whatsapp_mode" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 select public.transition_zelo_order(p_order_id,p_expected_revision,'accept',p_actor_id,'{}') $$;


ALTER FUNCTION "public"."accept_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_empresa_membro_por_email"("p_id_empresa" integer, "p_email" "text", "p_role" "text" DEFAULT 'atendente'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid;
  v_is_admin boolean;
begin
  -- Confere se quem chama é admin (ou owner) da empresa
  select exists (
    select 1 from public.empresa_usuarios eu
    where eu.id_empresa = p_id_empresa and eu.id_usuario = auth.uid() and eu.role = 'admin'
  )
  or exists (
    select 1 from public.empresas e
    where e.id = p_id_empresa and e.id_owner = auth.uid()
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado';
  end if;

  -- Busca usuário por e-mail (em auth.users)
  select u.id into v_user from auth.users u where lower(u.email) = lower(p_email);
  if v_user is null then
    raise exception 'Usuário não encontrado para o e-mail informado';
  end if;

  -- Insere ou atualiza papel
  insert into public.empresa_usuarios(id_empresa, id_usuario, role)
  values (p_id_empresa, v_user, p_role)
  on conflict (id_empresa, id_usuario) do update set role = excluded.role;
end;
$$;


ALTER FUNCTION "public"."add_empresa_membro_por_email"("p_id_empresa" integer, "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("target_user_id" "uuid", "target_user_email" "text", "action_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_admin_email text;
  v_super_admin_id uuid;
begin
  select id, email into v_super_admin_id, v_admin_email
  from super_admins
  where user_id = auth.uid() and is_active = true;

  if v_super_admin_id is null then
    raise exception 'Unauthorized: Caller is not an active super_admin';
  end if;

  insert into admin_activity_logs (admin_id, admin_email, action, target_user_id, target_email, details)
  values (v_super_admin_id, v_admin_email, 'delete_user', target_user_id, target_user_email, action_details);

  perform public.delete_account(target_user_id, 'admin');
end;
$$;


ALTER FUNCTION "public"."admin_delete_user"("target_user_id" "uuid", "target_user_email" "text", "action_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_extend_subscription"("p_subscription_id" "uuid", "p_months" integer, "p_reason" "text", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_current_end timestamp with time zone;
  v_new_end timestamp with time zone;
  v_is_expired boolean;
  v_target_user_id uuid;
BEGIN
  -- Get current expiration and user_id
  SELECT current_period_end, user_id 
  INTO v_current_end, v_target_user_id
  FROM subscriptions
  WHERE id = p_subscription_id;
  
  IF v_current_end IS NULL THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada');
  END IF;
  
  -- Check if expired
  v_is_expired := v_current_end < now();
  
  -- Calculate new expiration
  -- If expired, start from now. If not expired, extend from current end.
  IF v_is_expired THEN
    v_new_end := now() + (p_months || ' months')::interval;
  ELSE
    v_new_end := v_current_end + (p_months || ' months')::interval;
  END IF;
  
  -- Update subscription (renew/activate)
  UPDATE subscriptions
  SET 
    current_period_end = v_new_end,
    status = 'active',  -- Reactivate if was canceled
    manually_extended_until = NULL,  -- Clear manual extension (now it's a real renewal)
    admin_notes = COALESCE(admin_notes || E'\n', '') || 
                  to_char(now(), 'DD/MM/YYYY HH24:MI') || ' - ' || p_reason,
    last_modified_by = p_admin_id,
    last_modified_at = now(),
    updated_at = now()
  WHERE id = p_subscription_id;
  
  -- Log action with emails
  INSERT INTO admin_activity_logs (
    admin_id, 
    admin_email, 
    action, 
    target_user_id, 
    target_email,
    details
  )
  SELECT 
    p_admin_id,
    sa.email,
    'renew_subscription',
    v_target_user_id,
    au.email,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'months_added', p_months,
      'new_expiry', v_new_end,
      'was_expired', v_is_expired,
      'reason', p_reason
    )
  FROM super_admins sa
  CROSS JOIN auth.users au
  WHERE sa.id = p_admin_id
    AND au.id = v_target_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_expiry', v_new_end,
    'was_expired', v_is_expired
  );
END;
$$;


ALTER FUNCTION "public"."admin_extend_subscription"("p_subscription_id" "uuid", "p_months" integer, "p_reason" "text", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_auth_users"() RETURNS TABLE("user_id" "uuid", "email" "text", "auth_created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "raw_user_meta_data" "jsonb", "nome_exibicao" "text", "contato" "text", "documento" "text", "modulo_pdv_ativo" boolean, "profile_created_at" timestamp with time zone, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    u.id as user_id,
    u.email,
    u.created_at as auth_created_at,
    u.last_sign_in_at,
    u.raw_user_meta_data,
    p.nome_exibicao,
    p.contato,
    p.documento,
    p.modulo_pdv_ativo,
    p.created_at as profile_created_at,
    p.last_seen_at
  from auth.users u
  left join public.empresa_perfil p on p.user_id = u.id
  where coalesce(auth.role(), '') = 'service_role'
     or public.is_active_super_admin()
  order by u.created_at desc;
$$;


ALTER FUNCTION "public"."admin_get_all_auth_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_sales_counts"("days_ago" integer DEFAULT 30) RETURNS TABLE("id_usuario" "uuid", "sales_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id_usuario, count(*)::bigint as sales_count
  from vendas
  where (coalesce(auth.role(), '') = 'service_role' or public.is_active_super_admin())
    and created_at >= now() - (days_ago || ' days')::interval
  group by id_usuario;
$$;


ALTER FUNCTION "public"."admin_get_sales_counts"("days_ago" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_total_sales_value"() RETURNS TABLE("id_usuario" "uuid", "total_revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_active_super_admin()
  ) then
    raise exception 'Unauthorized: Caller is not an active super_admin'
      using errcode = '42501';
  end if;

  return query
    select v.id_usuario, coalesce(sum(v.valor_total), 0)::numeric as total_revenue
    from vendas v
    group by v.id_usuario;
end;
$$;


ALTER FUNCTION "public"."admin_get_total_sales_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_users_last_seen"() RETURNS TABLE("user_id" "uuid", "effective_last_seen" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    au.id as user_id,
    greatest(
      ep.last_seen_at,
      au.last_sign_in_at,
      max(s.updated_at)
    ) as effective_last_seen
  from auth.users au
  left join public.empresa_perfil ep on ep.user_id = au.id
  left join auth.sessions s on s.user_id = au.id
  where coalesce(auth.role(), '') = 'service_role'
     or public.is_active_super_admin()
  group by au.id, ep.last_seen_at, au.last_sign_in_at;
$$;


ALTER FUNCTION "public"."admin_get_users_last_seen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_users_without_profile"("min_age_hours" integer DEFAULT 2) RETURNS TABLE("user_id" "uuid", "email" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT u.id, u.email, u.created_at
  FROM auth.users u
  LEFT JOIN public.empresa_perfil p ON p.user_id = u.id
  WHERE p.user_id IS NULL
    AND u.created_at < now() - (min_age_hours || ' hours')::interval
    AND u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.access_users au
      WHERE au.auth_user_id = u.id
         OR lower(au.email) = lower(u.email)
    )
  ORDER BY u.created_at DESC;
$$;


ALTER FUNCTION "public"."admin_get_users_without_profile"("min_age_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajustar_estoque_categoria"("p_categoria_id" bigint, "p_estoque" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result integer;
begin
  if p_estoque is null or p_estoque < 0 then
    raise exception 'Estoque inválido' using errcode = '22023';
  end if;

  if auth.role() = 'service_role' then
    update public.categorias
       set estoque_compartilhado_atual = p_estoque
     where id = p_categoria_id
     returning estoque_compartilhado_atual into v_result;
  else
    if v_actor is null then
      raise exception 'Não autorizado' using errcode = '42501';
    end if;

    v_owner := public.get_owner_user_id(v_actor);
    if v_actor <> v_owner and not exists (
      select 1
        from public.access_users au
        join public.access_roles ar
          on ar.id = au.role_id
         and ar.owner_user_id = au.owner_user_id
       where au.auth_user_id = v_actor
         and au.owner_user_id = v_owner
         and au.status = 'active'
         and ar.permissions @> '{"estoque.ajustar": true}'::jsonb
    ) then
      raise exception 'Sem permissão para ajustar estoque' using errcode = '42501';
    end if;

    update public.categorias
       set estoque_compartilhado_atual = p_estoque
     where id = p_categoria_id
       and id_usuario = v_owner
     returning estoque_compartilhado_atual into v_result;
  end if;

  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."ajustar_estoque_categoria"("p_categoria_id" bigint, "p_estoque" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajustar_estoque_produto"("p_produto_id" bigint, "p_estoque" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result integer;
begin
  if p_estoque is null or p_estoque < 0 then
    raise exception 'Estoque inválido' using errcode = '22023';
  end if;

  if auth.role() = 'service_role' then
    update public.produtos
       set estoque_atual = p_estoque
     where id = p_produto_id
     returning estoque_atual into v_result;
  else
    if v_actor is null then
      raise exception 'Não autorizado' using errcode = '42501';
    end if;

    v_owner := public.get_owner_user_id(v_actor);
    if v_actor <> v_owner and not exists (
      select 1
        from public.access_users au
        join public.access_roles ar
          on ar.id = au.role_id
         and ar.owner_user_id = au.owner_user_id
       where au.auth_user_id = v_actor
         and au.owner_user_id = v_owner
         and au.status = 'active'
         and ar.permissions @> '{"estoque.ajustar": true}'::jsonb
    ) then
      raise exception 'Sem permissão para ajustar estoque' using errcode = '42501';
    end if;

    update public.produtos
       set estoque_atual = p_estoque
     where id = p_produto_id
       and id_usuario = v_owner
     returning estoque_atual into v_result;
  end if;

  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."ajustar_estoque_produto"("p_produto_id" bigint, "p_estoque" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_payment" "jsonb", "p_actor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  o public.zelo_orders;
  v_sale jsonb;
  v_sale_payload jsonb;
  v_neg record;
begin
  select * into o from public.zelo_orders where id=p_order_id for update;
  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;
  if auth.role()<>'service_role' then
    if p_actor_id is null then p_actor_id:=auth.uid();
    elsif p_actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='FORGED_ACTOR'; end if;
    if not public.zelo_order_has_permission(o.empresa_id,'pedidos.receber') then
      raise exception using errcode='42501',message='ORDER_PERMISSION_DENIED',detail='pedidos.receber';
    end if;
  end if;
  if o.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
  if o.source = 'mesa' then
    raise exception using errcode='ZL409', message='MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED';
  end if;

  if o.sale_id is not null then return public.zelo_order_result(o)||jsonb_build_object('idempotent',true); end if;
  if o.status not in ('ready','out_for_delivery') then raise exception using errcode='ZL409',message='INVALID_ORDER_TRANSITION'; end if;

  -- Defensive invariant check: log (never block) if the decomposition
  -- below would produce a negative container price for any item.
  for v_neg in
    select b.id, b.name, (b.unit_price - coalesce(lt.per_unit_contribution,0)) as computed
    from (select id,name,unit_price,modifiers from public.zelo_order_items where order_id=o.id) b
    left join lateral (
      select sum((opt->>'priceDelta')::numeric * (case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)) as per_unit_contribution
      from jsonb_array_elements(coalesce(b.modifiers,'[]'::jsonb)) grp
      cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
      join public.zelomenu_modifier_option_products lp
        on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then (opt->>'optionId')::uuid end)
    ) lt on true
    where (b.unit_price - coalesce(lt.per_unit_contribution,0)) < 0
  loop
    raise warning 'ZL_NEGATIVE_CONTAINER_PRICE order_item=% name=% computed=%', v_neg.id, v_neg.name, v_neg.computed;
  end loop;

  v_sale_payload:=coalesce(p_payment,'{}')||jsonb_build_object(
    'client_sale_id','zelo-order:'||o.id,'valor_total',o.total,
    'forma_pagamento',coalesce(
      nullif(nullif(p_payment->>'forma_pagamento',''),'outro'),
      nullif(nullif(p_payment->>'formaPagamento',''),'outro'),
      nullif(o.payment->>'declaredMethod',''),
      nullif(o.payment->>'method',''),
      'outro'
    ),
    'tipo_pedido',case when coalesce(o.fulfillment->>'mode',o.fulfillment->>'type')='delivery'
      then 'delivery' else 'retirada' end,
    'taxa_entrega',o.delivery_fee,
    'itens',(
      with base as (
        select i.id, i.product_id, i.name, i.unit_price, i.quantity, i.position, i.modifiers
        from public.zelo_order_items i where i.order_id=o.id
      ),
      linked as (
        select
          b.id as item_id, b.position, b.quantity as item_quantity,
          lp.id_produto,
          (opt->>'optionName') as nome,
          (opt->>'priceDelta')::numeric as preco_unitario,
          (case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end) as option_quantity
        from base b
        cross join lateral jsonb_array_elements(coalesce(b.modifiers,'[]'::jsonb)) as grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) as opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
      ),
      linked_totals as (
        select item_id, sum(preco_unitario*option_quantity) as per_unit_contribution
        from linked group by item_id
      ),
      rows as (
        select b.position as pos, jsonb_build_object(
            'id_produto',b.product_id,'nome_produto_na_venda',b.name,
            'preco_unitario_na_venda',greatest(b.unit_price-coalesce(lt.per_unit_contribution,0),0),
            'quantidade',b.quantity
          ) as item
        from base b left join linked_totals lt on lt.item_id=b.id
        union all
        select l.position as pos, jsonb_build_object(
            'id_produto',l.id_produto,'nome_produto_na_venda',l.nome,
            'preco_unitario_na_venda',l.preco_unitario,
            'quantidade',l.option_quantity*l.item_quantity
          )
        from linked l
      )
      select coalesce(jsonb_agg(item order by pos),'[]'::jsonb) from rows
    ),
    'estoque','[]'::jsonb);
  v_sale:=public.criar_venda_completa(v_sale_payload);
  update public.zelo_orders set sale_id=(v_sale->>'id')::bigint where id=o.id;
  return public.transition_zelo_order(o.id,o.revision,'deliver',p_actor_id,jsonb_build_object('saleId',v_sale->>'id'));
end $_$;


ALTER FUNCTION "public"."close_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_payment" "jsonb", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comanda_aplicar_delta_item"("p_id_comanda" "uuid", "p_id_produto" integer, "p_delta" integer, "p_preco_unitario" numeric DEFAULT NULL::numeric, "p_modifiers" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_comanda record;
  v_produto record;
  v_item record;
  v_qtd_atual integer;
  v_qtd_delta integer;
  v_qtd_devolver integer;
  v_unit_price numeric(10,2);
  v_modifiers jsonb := coalesce(p_modifiers, '[]'::jsonb);
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if p_delta is null or p_delta = 0 then
    return;
  end if;
  if p_id_produto is null then
    raise exception 'Produto obrigatorio';
  end if;
  if jsonb_typeof(v_modifiers) <> 'array' then
    raise exception 'Montagem invalida';
  end if;

  if not v_service then
    v_owner := public.get_owner_user_id(v_actor);
  end if;

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;

  if not v_service and not public.fiado_actor_can('mesas.editar_itens', v_owner) then
    raise exception 'Voce nao tem permissao para editar itens da mesa.' using errcode = '42501';
  end if;

  select p.id, p.nome, p.preco, p.controlar_estoque, coalesce(p.estoque_atual, 0) as estoque_atual
    into v_produto
    from public.produtos p
   where p.id = p_id_produto
     and p.id_usuario = v_owner
   for update;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  v_unit_price := round(coalesce(p_preco_unitario, v_produto.preco)::numeric, 2);
  if v_unit_price < 0 then
    raise exception 'Preco invalido';
  end if;

  select *
    into v_item
    from public.comanda_itens
   where id_comanda = p_id_comanda
     and id_produto = p_id_produto
     and coalesce(modifiers, '[]'::jsonb) = v_modifiers
   for update;

  if p_delta > 0 then
    v_qtd_delta := p_delta;

    for v_stock in
      select requirements.id_produto,
             products.nome,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner
           and coalesce(estoque_atual, 0) >= v_stock.quantidade;
        if not found then
          raise exception 'Estoque insuficiente para "%".', v_stock.nome;
        end if;
      end if;
    end loop;

    if v_item.id is null then
      insert into public.comanda_itens (
        id_comanda, id_produto, quantidade, preco_unitario, observacao,
        estoque_baixado, modifiers, nome_produto_na_venda
      ) values (
        p_id_comanda, p_id_produto, v_qtd_delta, v_unit_price, null,
        exists (
          select 1
            from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
            join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
            left join public.categorias categories on categories.id = products.id_categoria
           where coalesce(products.controlar_estoque, false)
              or coalesce(categories.controlar_estoque_compartilhado, false)
        ),
        v_modifiers,
        v_produto.nome
      );
    else
      update public.comanda_itens
         set quantidade = greatest(1, round(coalesce(quantidade, 0))::integer) + v_qtd_delta,
             preco_unitario = v_unit_price,
             estoque_baixado = estoque_baixado or exists (
               select 1
                 from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_delta) requirements
                 join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
                 left join public.categorias categories on categories.id = products.id_categoria
                where coalesce(products.controlar_estoque, false)
                   or coalesce(categories.controlar_estoque_compartilhado, false)
             )
       where id = v_item.id;
    end if;
    return;
  end if;

  if v_item.id is null then
    raise exception 'Item nao encontrado na comanda';
  end if;

  v_qtd_atual := greatest(0, round(coalesce(v_item.quantidade, 0))::integer);
  v_qtd_devolver := least(abs(p_delta), v_qtd_atual);
  if v_qtd_devolver <= 0 then
    return;
  end if;

  if coalesce(v_item.estoque_baixado, false) then
    for v_stock in
      select requirements.id_produto,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(p_id_produto, v_modifiers, v_qtd_devolver) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner;
      end if;
    end loop;
  end if;

  if v_qtd_atual - v_qtd_devolver <= 0 then
    delete from public.comanda_itens where id = v_item.id;
  else
    update public.comanda_itens
       set quantidade = v_qtd_atual - v_qtd_devolver
     where id = v_item.id;
  end if;
end;
$$;


ALTER FUNCTION "public"."comanda_aplicar_delta_item"("p_id_comanda" "uuid", "p_id_produto" integer, "p_delta" integer, "p_preco_unitario" numeric, "p_modifiers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comanda_cancelar_com_estoque"("p_id_comanda" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if not v_service then v_owner := public.get_owner_user_id(v_actor); end if;

  select id, id_mesa, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;
  if not v_service and not public.fiado_actor_can('mesas.cancelar', v_owner) then
    raise exception 'Voce nao tem permissao para cancelar a comanda.' using errcode = '42501';
  end if;

  for v_linha in
    select id_produto, modifiers, greatest(1, round(coalesce(quantidade, 0))::integer) as quantidade
      from public.comanda_itens
     where id_comanda = p_id_comanda
       and coalesce(estoque_baixado, false) = true
  loop
    for v_stock in
      select requirements.id_produto,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(v_linha.id_produto, v_linha.modifiers, v_linha.quantidade) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) + v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) + v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner;
      end if;
    end loop;
  end loop;

  update public.comanda_itens
     set estoque_baixado = false
   where id_comanda = p_id_comanda
     and coalesce(estoque_baixado, false) = true;
  update public.comandas
     set status = 'cancelada', fechada_em = now()
   where id = p_id_comanda
     and id_usuario = v_owner;
  update public.mesas
     set status = 'livre'
   where id = v_comanda.id_mesa
     and id_usuario = v_owner;
end;
$$;


ALTER FUNCTION "public"."comanda_cancelar_com_estoque"("p_id_comanda" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comanda_garantir_estoque_baixado"("p_id_comanda" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_comanda record;
  v_linha record;
  v_stock record;
begin
  if v_actor is null and not v_service then
    raise exception 'Usuario nao autenticado';
  end if;
  if not v_service then v_owner := public.get_owner_user_id(v_actor); end if;

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and status = 'aberta'
     and (v_service or id_usuario = v_owner)
   for update;
  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;
  v_owner := v_comanda.id_usuario;
  if not v_service and not public.fiado_actor_can('mesas.fechar', v_owner) then
    raise exception 'Voce nao tem permissao para fechar a mesa.' using errcode = '42501';
  end if;

  for v_linha in
    select id, id_produto, modifiers,
           greatest(1, round(coalesce(quantidade, 0))::integer) as quantidade
      from public.comanda_itens
     where id_comanda = p_id_comanda
       and coalesce(estoque_baixado, false) = false
  loop
    for v_stock in
      select requirements.id_produto,
             products.nome,
             products.controlar_estoque,
             coalesce(categories.controlar_estoque_compartilhado, false) as estoque_compartilhado,
             sum(requirements.quantidade)::integer as quantidade
        from public.comanda_modifier_stock_requirements(v_linha.id_produto, v_linha.modifiers, v_linha.quantidade) requirements
        join public.produtos products on products.id = requirements.id_produto and products.id_usuario = v_owner
        left join public.categorias categories on categories.id = products.id_categoria
       group by requirements.id_produto, products.nome, products.controlar_estoque, categories.controlar_estoque_compartilhado
    loop
      if v_stock.estoque_compartilhado then
        update public.categorias
           set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_stock.quantidade
         where id = (select id_categoria from public.produtos where id = v_stock.id_produto)
           and id_usuario = v_owner
           and coalesce(estoque_compartilhado_atual, 0) >= v_stock.quantidade;
        if not found then raise exception 'Estoque insuficiente para "%".', v_stock.nome; end if;
      elsif v_stock.controlar_estoque then
        update public.produtos
           set estoque_atual = coalesce(estoque_atual, 0) - v_stock.quantidade
         where id = v_stock.id_produto
           and id_usuario = v_owner
           and coalesce(estoque_atual, 0) >= v_stock.quantidade;
        if not found then raise exception 'Estoque insuficiente para "%".', v_stock.nome; end if;
      end if;
    end loop;

    update public.comanda_itens set estoque_baixado = true where id = v_linha.id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."comanda_garantir_estoque_baixado"("p_id_comanda" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) RETURNS TABLE("id_produto" bigint, "quantidade" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
  select p_id_produto, greatest(coalesce(p_item_quantity, 1), 1)
  union all
  select
    links.id_produto,
    sum(
      greatest(
        case
          when (option_json->>'quantity') ~ '^[0-9]+$'
            then (option_json->>'quantity')::integer
          else 1
        end,
        1
      ) * greatest(coalesce(p_item_quantity, 1), 1)
    )::integer
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) as group_json
  cross join lateral jsonb_array_elements(coalesce(group_json->'selectedOptions', '[]'::jsonb)) as option_json
  join public.zelomenu_modifier_option_products links
    on links.id_opcao = case
      when (option_json->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (option_json->>'optionId')::uuid
      else null
    end
  group by links.id_produto;
$_$;


ALTER FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) IS 'Expande o produto-base e as opções vinculadas em requisitos de estoque para uma linha de comanda.';



CREATE OR REPLACE FUNCTION "public"."comanda_pagamento_itens_fill_context"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_item_comanda uuid;
  v_payment_comanda uuid;
  v_payment_owner uuid;
begin
  select ci.id_comanda
    into v_item_comanda
    from public.comanda_itens ci
   where ci.id = new.id_comanda_item;

  if not found then
    raise exception 'Item da comanda não encontrado';
  end if;

  if new.id_comanda is null then
    new.id_comanda := v_item_comanda;
  elsif new.id_comanda <> v_item_comanda then
    raise exception 'Item e comanda não correspondem';
  end if;

  if new.id_pagamento is not null then
    select cp.id_comanda, cp.id_usuario
      into v_payment_comanda, v_payment_owner
      from public.comanda_pagamentos cp
     where cp.id = new.id_pagamento;

    if not found then
      raise exception 'Pagamento da comanda não encontrado';
    end if;
    if v_payment_comanda <> new.id_comanda then
      raise exception 'Pagamento e item não pertencem à mesma comanda';
    end if;
    if v_payment_owner <> new.id_usuario then
      raise exception 'Pagamento e atribuição não pertencem ao mesmo usuário';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."comanda_pagamento_itens_fill_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comanda_pagamento_itens_validate_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_item_quantity numeric;
  v_allocated numeric;
begin
  select ci.quantidade
    into v_item_quantity
    from public.comanda_itens ci
   where ci.id = new.id_comanda_item
   for update;

  if not found then
    raise exception 'Item da comanda não encontrado';
  end if;

  select coalesce(sum(cpi.quantidade), 0)
    into v_allocated
    from public.comanda_pagamento_itens cpi
   where cpi.id_comanda_item = new.id_comanda_item
     and cpi.id <> new.id;

  if v_allocated + new.quantidade > v_item_quantity + 0.000001 then
    raise exception 'Quantidade alocada excede a quantidade do item da comanda';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."comanda_pagamento_itens_validate_quantity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comandas_mutation_rbac_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_service_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls retain the existing bypass; SECURITY DEFINER browser calls still
  -- carry the authenticated actor claim and are checked below.
  if v_actor is null or v_service_role = 'service_role' or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A comanda deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('fechando', 'fechada') then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para fechar a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'cancelada' then
      if not public.fiado_actor_can('mesas.cancelar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para cancelar a comanda.' using errcode = '42501';
      end if;
    elsif new.status = 'aberta' then
      if not (
        public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario)
        or public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
      ) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para reabrir a comanda.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de comanda invÃ¡lido para este operador.' using errcode = '42501';
    end if;
  end if;

  if new.id_venda is distinct from old.id_venda
     or new.fechada_em is distinct from old.fechada_em
     or new.total_calculado is distinct from old.total_calculado then
    if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
      raise exception 'VocÃª nÃ£o tem permissÃ£o para alterar o fechamento financeiro.' using errcode = '42501';
    end if;
  end if;

  if new.id_mesa is distinct from old.id_mesa
     or new.num_pessoas is distinct from old.num_pessoas
     or new.observacao is distinct from old.observacao
     or new.taxa_servico_pct is distinct from old.taxa_servico_pct
     or new.couvert_valor is distinct from old.couvert_valor
     or new.desconto is distinct from old.desconto then
    if not public.fiado_actor_can('mesas.editar_itens', old.id_usuario) then
      raise exception 'VocÃª nÃ£o tem permissÃ£o para editar a comanda.' using errcode = '42501';
    end if;
  end if;

  -- The UI stamps the current operator before close/cancel as well as while
  -- editing. Keep that audit-field update compatible with the corresponding
  -- operation capability without granting any financial field access.
  if new.id_operador is distinct from old.id_operador
     and not (
       public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
       or public.fiado_actor_can('mesas.fechar', old.id_usuario)
       or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
     ) then
    raise exception 'VocÃª nÃ£o tem permissÃ£o para identificar o operador da comanda.' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."comandas_mutation_rbac_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."confirm_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_zelomenu_cart_legacy"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.zelomenu_cart_sessions;
  v_order_id uuid;
  v_state text;
  item record;
begin
  select * into s from public.zelomenu_cart_sessions where id=p_session_id for update;
  if not found then raise exception using errcode='ZL404',message='CART_NOT_FOUND'; end if;
  if s.current_token_hash is distinct from p_token_hash then
    raise exception using errcode='ZL410',message='STALE_CART_TOKEN';
  end if;
  if s.revision<>p_expected_revision then
    raise exception using errcode='ZL409',message='REVISION_CONFLICT';
  end if;

  if s.context='table_order' then
    select o.id into v_order_id from public.zelo_orders o where o.zelomenu_session_id=s.id;
  else
    select o.id into v_order_id from public.zelochat_orders o where o.zelomenu_session_id=s.id;
  end if;
  if v_order_id is not null then
    return jsonb_build_object('orderId',v_order_id,'state',s.state,'alreadyConfirmed',true);
  end if;
  if s.state<>'cart_open' then raise exception using errcode='ZL409',message='CART_ALREADY_CLOSED'; end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception using errcode='ZL400',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if s.context='table_order' then
    perform 1
    from public.comandas c
    join public.mesas m on m.id=c.id_mesa
    where c.id=(s.metadata->>'comanda_id')::uuid
      and c.id_mesa=(s.metadata->>'mesa_id')::uuid
      and c.id_usuario=(select ep.user_id from public.empresa_perfil ep where ep.id=s.empresa_id)
      and c.status='aberta'
      and m.ativa=true
    for update of c;
    if not found then raise exception using errcode='ZL409',message='COMANDA_CLOSED'; end if;
    if s.capability_id is not null then
      perform 1
      from public.zelomenu_table_capabilities c
      where c.id=s.capability_id
        and c.comanda_id=(s.metadata->>'comanda_id')::uuid
        and c.mesa_id=(s.metadata->>'mesa_id')::uuid
        and c.revoked_at is null
        and c.expires_at>now()
      for update;
      if not found then raise exception using errcode='ZL410',message='TABLE_SESSION_EXPIRED'; end if;
    end if;
  else
    -- Legacy public_order fallback only. The current ZeloMenu bundle uses the
    -- canonical path directly and therefore does not enter this branch.
    for item in
      select (x->>'productId')::bigint product_id, sum((x->>'quantity')::integer) quantity
      from jsonb_array_elements(s.cart_snapshot->'items') x
      group by (x->>'productId')::bigint
    loop
      if item.quantity < 1 or item.quantity > 999 then
        raise exception using errcode='ZL400',message='INVALID_QUANTITY';
      end if;
      update public.produtos
      set estoque_atual=estoque_atual-item.quantity
      where id=item.product_id and controlar_estoque=true and estoque_atual>=item.quantity;
      if not found and exists(select 1 from public.produtos where id=item.product_id and controlar_estoque=true) then
        raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED';
      end if;
    end loop;
  end if;

  v_state:=case when coalesce((s.payment_snapshot->>'pixReceiptRequired')::boolean,false)
                     and not coalesce((s.payment_snapshot->>'pixReceiptApproved')::boolean,false)
                then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end;

  if s.context='table_order' then
    select public.create_zelo_order(
      s.id,
      p_expected_revision,
      p_idempotency_key,
      jsonb_build_object(
        'empresaId',s.empresa_id,
        'source','mesa',
        'customer',coalesce(s.customer_snapshot,'{}'::jsonb),
        'fulfillment',coalesce(s.fulfillment_snapshot,'{}'::jsonb)||jsonb_build_object(
          'type','mesa','mesaId',s.metadata->>'mesa_id','comandaId',s.metadata->>'comanda_id'
        ),
        'payment',coalesce(s.payment_snapshot,'{}'::jsonb),
        'pricing',coalesce(s.pricing_snapshot,'{}'::jsonb),
        'cart',coalesce(s.cart_snapshot,'{}'::jsonb)
      )
    )->>'orderId' into v_order_id;
    update public.zelomenu_cart_sessions
    set state=v_state, confirmed_at=now(), updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('productionOrderId',v_order_id,'idempotencyKey',p_idempotency_key)
    where id=s.id;
    return jsonb_build_object('orderId',v_order_id,'state',v_state,'alreadyConfirmed',false);
  end if;

  insert into public.zelochat_orders(
    empresa_id,customer_name,customer_phone,items,pickup_date,pickup_time,
    payment_method,delivery_address,delivery_neighborhood,delivery_fee,observations,status,total,source,zelomenu_session_id
  )
  values(
    s.empresa_id,
    coalesce(s.customer_snapshot->>'name','Cliente'),
    s.customer_snapshot->>'phone',
    (select jsonb_agg(jsonb_build_object('product',x->>'productName','quantity',(x->>'quantity')::integer))
       from jsonb_array_elements(s.cart_snapshot->'items') x),
    coalesce(s.fulfillment_snapshot->>'pickupDate',''),
    coalesce(s.fulfillment_snapshot->>'pickupTime',''),
    s.payment_snapshot->>'declaredMethod',
    s.fulfillment_snapshot->>'deliveryAddress',
    s.fulfillment_snapshot->>'deliveryNeighborhood',
    nullif(s.fulfillment_snapshot->>'deliveryFee','')::numeric,
    s.cart_snapshot->>'observations',
    'pending',
    (s.pricing_snapshot->>'total')::numeric,
    'zelomenu',
    s.id
  ) returning id into v_order_id;

  update public.zelomenu_cart_sessions
  set state=v_state, confirmed_at=now(), updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('productionOrderId',v_order_id,'idempotencyKey',p_idempotency_key)
  where id=s.id;
  return jsonb_build_object('orderId',v_order_id,'state',v_state,'alreadyConfirmed',false);
end $$;


ALTER FUNCTION "public"."confirm_zelomenu_cart_legacy"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_zelo_order"("p_session_id" "uuid", "p_expected_revision" integer, "p_idempotency_key" "text", "p_snapshots" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  s public.zelomenu_cart_sessions;
  o public.zelo_orders;
  v_empresa uuid;
  v_item jsonb;
  v_source text;
  v_subtotal numeric(14,2);
  v_fee numeric(14,2);
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_stock_already_committed boolean;
begin
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception using errcode='ZL400',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if p_session_id is not null then
    select * into s from public.zelomenu_cart_sessions where id=p_session_id for update;
    if not found then raise exception using errcode='ZL404',message='CART_NOT_FOUND'; end if;
    if s.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
    if s.context not in ('public_order','table_order') then
      raise exception using errcode='ZL400',message='TABLE_ORDER_NOT_CANONICAL';
    end if;

    v_empresa:=s.empresa_id;
    v_source:=case when s.context='table_order' then 'mesa' else 'zelomenu' end;
    v_stock_already_committed:=false;
    p_snapshots:=jsonb_build_object(
      'customer',coalesce(s.customer_snapshot,'{}'::jsonb),
      'fulfillment',coalesce(s.fulfillment_snapshot,'{}'::jsonb) || case
        when s.context='table_order' then jsonb_build_object(
          'type','mesa',
          'mesaId',s.metadata->>'mesa_id',
          'comandaId',s.metadata->>'comanda_id'
        )
        else '{}'::jsonb
      end,
      'payment',coalesce(s.payment_snapshot,'{}'::jsonb),
      'pricing',coalesce(s.pricing_snapshot,'{}'::jsonb),
      'cart',coalesce(s.cart_snapshot,'{}'::jsonb),
      'source',v_source
    );

    if s.context='table_order' then
      perform 1
      from public.comandas c
      join public.mesas m on m.id=c.id_mesa
      where c.id=(s.metadata->>'comanda_id')::uuid
        and c.id_mesa=(s.metadata->>'mesa_id')::uuid
        and c.id_usuario=(select ep.user_id from public.empresa_perfil ep where ep.id=s.empresa_id)
        and c.status='aberta'
        and m.ativa=true
      for update of c;
      if not found then raise exception using errcode='ZL409',message='COMANDA_CLOSED'; end if;

      if s.capability_id is not null then
        perform 1
        from public.zelomenu_table_capabilities c
        where c.id=s.capability_id
          and c.comanda_id=(s.metadata->>'comanda_id')::uuid
          and c.mesa_id=(s.metadata->>'mesa_id')::uuid
          and c.revoked_at is null
          and c.expires_at>now()
        for update;
        if not found then raise exception using errcode='ZL410',message='TABLE_SESSION_EXPIRED'; end if;
      end if;
    end if;
  else
    v_empresa:=nullif(p_snapshots->>'empresaId','')::uuid;
    v_source:=coalesce(nullif(p_snapshots->>'source',''),'manual');
    v_stock_already_committed:=v_source='mesa'
      and nullif(p_snapshots#>>'{fulfillment,comandaItemId}','') is not null;
  end if;

  if v_empresa is null then raise exception using errcode='ZL400',message='EMPRESA_REQUIRED'; end if;
  if v_source not in ('zelomenu','zelochat','manual','legacy_zelochat','legacy_pedido','mesa') then
    raise exception using errcode='ZL400',message='INVALID_ORDER_SOURCE';
  end if;

  select * into o
  from public.zelo_orders
  where zelomenu_session_id=p_session_id
     or (empresa_id=v_empresa and idempotency_key=p_idempotency_key)
  order by created_at
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'orderId',o.id,
      'orderStatus',o.status,
      'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed',true,
      'revision',o.revision
    );
  end if;

  if p_session_id is not null and s.state<>'cart_open' then
    raise exception using errcode='ZL409',message='CART_ALREADY_CLOSED';
  end if;
  if jsonb_typeof(p_snapshots#>'{cart,items}')<>'array'
     or jsonb_array_length(p_snapshots#>'{cart,items}') not between 1 and 50 then
    raise exception using errcode='ZL400',message='INVALID_ITEMS';
  end if;

  v_subtotal:=coalesce((p_snapshots#>>'{pricing,subtotal}')::numeric,0);
  v_fee:=coalesce((p_snapshots#>>'{pricing,deliveryFee}')::numeric,0);
  v_discount:=coalesce((p_snapshots#>>'{pricing,discount}')::numeric,0);
  v_total:=v_subtotal+v_fee-v_discount;
  if v_total<0 or v_total>1000000 then raise exception using errcode='ZL400',message='INVALID_TOTAL'; end if;

  insert into public.zelo_orders(
    empresa_id,source,status,zelomenu_session_id,idempotency_key,customer,fulfillment,payment,
    subtotal,delivery_fee,discount,total,observations,stock_committed_at
  )
  values(
    v_empresa,v_source,
    case when coalesce((p_snapshots#>>'{payment,pixReceiptRequired}')::boolean,false)
              and not coalesce((p_snapshots#>>'{payment,pixReceiptApproved}')::boolean,false)
         then 'pending_payment' else 'pending_review' end,
    p_session_id,p_idempotency_key,
    coalesce(p_snapshots->'customer','{}'),
    coalesce(p_snapshots->'fulfillment','{}'),
    coalesce(p_snapshots->'payment','{}'),
    v_subtotal,v_fee,v_discount,v_total,p_snapshots#>>'{cart,observations}',
    case when v_stock_already_committed then now() else null end
  ) returning * into o;

  for v_item in select value from jsonb_array_elements(p_snapshots#>'{cart,items}') loop
    if coalesce((v_item->>'quantity')::integer,0) not between 1 and 999 then
      raise exception using errcode='ZL400',message='INVALID_QUANTITY';
    end if;
    if nullif(v_item->>'productId','') is not null and not exists(
      select 1
      from public.produtos p
      join public.empresa_perfil ep on ep.id=v_empresa and ep.user_id=p.id_usuario
      where p.id=(v_item->>'productId')::bigint
    ) then
      raise exception using errcode='ZL404',message='PRODUCT_NOT_FOUND';
    end if;
    insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values(
      o.id,
      nullif(v_item->>'productId','')::bigint,
      coalesce(nullif(v_item->>'productName',''),'Produto'),
      coalesce((v_item->>'unitPrice')::numeric,0),
      (v_item->>'quantity')::integer,
      coalesce((v_item->>'lineTotal')::numeric,(v_item->>'unitPrice')::numeric*(v_item->>'quantity')::integer),
      coalesce(v_item->'selectedModifiers',v_item->'modifiers','[]'),
      coalesce((v_item->>'position')::integer,0)
    );
  end loop;

  if (select coalesce(sum(subtotal),0) from public.zelo_order_items where order_id=o.id)<>v_subtotal then
    raise exception using errcode='ZL400',message='TOTAL_MISMATCH';
  end if;

  insert into public.zelo_order_events(order_id,empresa_id,event_type,to_status,detail)
    values(o.id,o.empresa_id,'created',o.status,jsonb_build_object('source',o.source));
  insert into public.zelo_order_outbox(order_id,empresa_id,topic,payload,idempotency_key)
    values(o.id,o.empresa_id,'order.created',public.zelo_order_result(o),'order.created:'||o.id);

  if p_session_id is not null then
    update public.zelomenu_cart_sessions set
      state=case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      confirmed_at=coalesce(confirmed_at,now()),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'canonicalOrderId',o.id,'idempotencyKey',p_idempotency_key
      )
    where id=p_session_id;
  end if;

  return jsonb_build_object(
    'orderId',o.id,
    'orderStatus',o.status,
    'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
    'alreadyConfirmed',false,
    'revision',o.revision
  );
exception when unique_violation then
  select * into o
  from public.zelo_orders
  where zelomenu_session_id=p_session_id
     or (empresa_id=v_empresa and idempotency_key=p_idempotency_key)
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object(
      'orderId',o.id,
      'orderStatus',o.status,
      'sessionState',case o.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
      'alreadyConfirmed',true,
      'revision',o.revision
    );
  end if;
  raise;
end $$;


ALTER FUNCTION "public"."create_zelo_order"("p_session_id" "uuid", "p_expected_revision" integer, "p_idempotency_key" "text", "p_snapshots" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_venda_id bigint;
  v_numero_venda integer;
  v_caixa_provided integer;
  v_caixa_id integer;
  v_id_cliente uuid;
  v_client_sale_id text;
  v_item jsonb;
  v_pag jsonb;
  v_estoque jsonb;
  v_fiado jsonb;
  v_taxa jsonb;
  v_qtd integer;
  v_linha record;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_client_sale_id := nullif(p_payload->>'client_sale_id', '');
  if v_client_sale_id is not null then
    select id, numero_venda, id_caixa
      into v_venda_id, v_numero_venda, v_caixa_id
      from public.vendas
     where id_usuario = v_user_id
       and client_sale_id = v_client_sale_id
     limit 1;

    if found then
      return jsonb_build_object(
        'id', v_venda_id,
        'numero_venda', v_numero_venda,
        'id_caixa', v_caixa_id,
        'client_sale_id', v_client_sale_id,
        'idempotent', true
      );
    end if;
  end if;

  v_caixa_provided := nullif(p_payload->>'id_caixa','')::integer;
  if v_caixa_provided is not null then
    select id into v_caixa_id
    from public.caixas
    where id = v_caixa_provided
      and id_usuario = v_user_id
      and data_fechamento is null;
  end if;
  if v_caixa_id is null then
    select id into v_caixa_id
    from public.caixas
    where id_usuario = v_user_id
      and data_fechamento is null
    order by data_abertura desc
    limit 1;
  end if;

  v_id_cliente := nullif(p_payload->>'id_cliente','')::uuid;

  insert into public.vendas (
    id_usuario, id_caixa, id_cliente, client_sale_id, valor_total, forma_pagamento,
    valor_recebido, valor_troco, valor_desconto, desconto_tipo,
    tipo_pedido, taxa_entrega, created_at
  )
  values (
    v_user_id,
    v_caixa_id,
    v_id_cliente,
    v_client_sale_id,
    coalesce((p_payload->>'valor_total')::numeric, 0),
    coalesce(nullif(p_payload->>'forma_pagamento',''), 'dinheiro'),
    nullif(p_payload->>'valor_recebido','')::numeric,
    coalesce((p_payload->>'valor_troco')::numeric, 0),
    coalesce((p_payload->>'valor_desconto')::numeric, 0),
    nullif(p_payload->>'desconto_tipo',''),
    coalesce(nullif(p_payload->>'tipo_pedido',''), 'retirada'),
    coalesce((p_payload->>'taxa_entrega')::numeric, 0),
    coalesce((p_payload->>'created_at')::timestamptz, now())
  )
  returning id, numero_venda into v_venda_id, v_numero_venda;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb))
  loop
    insert into public.vendas_itens (
      id_usuario, id_venda, id_produto, quantidade,
      nome_produto_na_venda, preco_unitario_na_venda, modifiers
    )
    values (
      v_user_id,
      v_venda_id,
      nullif(v_item->>'id_produto','')::integer,
      coalesce((v_item->>'quantidade')::integer, 1),
      coalesce(v_item->>'nome_produto_na_venda', v_item->>'nome', ''),
      coalesce(
        (v_item->>'preco_unitario_na_venda')::numeric,
        (v_item->>'preco')::numeric,
        0
      ),
      coalesce(v_item->'modifiers', '[]'::jsonb)
    );
  end loop;

  for v_pag in select * from jsonb_array_elements(coalesce(p_payload->'pagamentos','[]'::jsonb))
  loop
    if coalesce((v_pag->>'valor')::numeric, 0) > 0 then
      insert into public.vendas_pagamentos (
        id_venda, id_usuario, forma_pagamento, valor
      )
      values (
        v_venda_id,
        v_user_id,
        coalesce(nullif(v_pag->>'forma_pagamento',''), nullif(v_pag->>'forma',''), ''),
        coalesce((v_pag->>'valor')::numeric, 0)
      );
    end if;
  end loop;

  create temporary table if not exists pg_temp.zelo_estoque_venda_tmp (
    id_produto integer,
    quantidade integer
  ) on commit drop;
  truncate table pg_temp.zelo_estoque_venda_tmp;

  for v_estoque in select * from jsonb_array_elements(coalesce(p_payload->'estoque','[]'::jsonb))
  loop
    v_qtd := coalesce((v_estoque->>'quantidade')::integer, 0);
    if v_qtd > 0 then
      insert into pg_temp.zelo_estoque_venda_tmp (id_produto, quantidade)
      values ((v_estoque->>'id_produto')::integer, v_qtd);
    end if;
  end loop;

  for v_linha in
    select c.id as id_categoria,
           c.nome as nome_categoria,
           coalesce(c.estoque_compartilhado_atual, 0) as estoque_atual,
           sum(t.quantidade)::integer as qtd
      from pg_temp.zelo_estoque_venda_tmp t
      join public.produtos p on p.id = t.id_produto and p.id_usuario = v_user_id
      join public.categorias c on c.id = p.id_categoria and c.id_usuario = v_user_id
     where coalesce(c.controlar_estoque_compartilhado, false) = true
     group by c.id, c.nome, c.estoque_compartilhado_atual
  loop
    update public.categorias
       set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_linha.qtd
     where id = v_linha.id_categoria
       and id_usuario = v_user_id
       and coalesce(controlar_estoque_compartilhado, false) = true
       and coalesce(estoque_compartilhado_atual, 0) >= v_linha.qtd;

    if not found then
      raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
        v_linha.nome_categoria,
        v_linha.estoque_atual,
        v_linha.qtd;
    end if;
  end loop;

  for v_linha in
    select p.id as id_produto,
           p.nome,
           coalesce(p.estoque_atual, 0) as estoque_atual,
           sum(t.quantidade)::integer as qtd
      from pg_temp.zelo_estoque_venda_tmp t
      join public.produtos p on p.id = t.id_produto and p.id_usuario = v_user_id
      left join public.categorias c on c.id = p.id_categoria and c.id_usuario = v_user_id
     where coalesce(c.controlar_estoque_compartilhado, false) = false
       and coalesce(p.controlar_estoque, false) = true
     group by p.id, p.nome, p.estoque_atual
  loop
    update public.produtos
       set estoque_atual = coalesce(estoque_atual, 0) - v_linha.qtd
     where id = v_linha.id_produto
       and id_usuario = v_user_id
       and coalesce(controlar_estoque, false) = true
       and coalesce(estoque_atual, 0) >= v_linha.qtd;

    if not found then
      raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
        v_linha.nome,
        v_linha.estoque_atual,
        v_linha.qtd;
    end if;
  end loop;

  for v_fiado in select * from jsonb_array_elements(coalesce(p_payload->'fiados','[]'::jsonb))
  loop
    if coalesce((v_fiado->>'valor')::numeric, 0) > 0 then
      update public.pessoas
      set saldo_fiado = coalesce(saldo_fiado, 0) + (v_fiado->>'valor')::numeric
      where id = (v_fiado->>'id_pessoa')::uuid
        and id_usuario = v_user_id;
    end if;
  end loop;

  for v_taxa in select * from jsonb_array_elements(coalesce(p_payload->'taxas_plataforma','[]'::jsonb))
  loop
    if coalesce((v_taxa->>'valor_taxa')::numeric, 0) > 0 then
      insert into public.vendas_taxas_plataforma (
        id_venda, id_usuario, plataforma_id, plataforma_nome,
        taxa_pct, valor_bruto, valor_taxa
      )
      values (
        v_venda_id,
        v_user_id,
        coalesce(v_taxa->>'plataforma_id', ''),
        coalesce(v_taxa->>'plataforma_nome', v_taxa->>'plataforma_id', ''),
        coalesce((v_taxa->>'taxa_pct')::numeric, 0),
        coalesce((v_taxa->>'valor_bruto')::numeric, 0),
        coalesce((v_taxa->>'valor_taxa')::numeric, 0)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_venda_id,
    'numero_venda', v_numero_venda,
    'id_caixa', v_caixa_id,
    'client_sale_id', v_client_sale_id,
    'idempotent', false
  );
end;
$$;


ALTER FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") IS 'Atomic single-transaction sale insert: venda + itens + pagamentos + estoque decrement + fiado debits. Used by online flow and offline sync. Cash payment rows must already be net of change. id_caixa falls back to user current open caixa if the provided one is closed/invalid.';



CREATE OR REPLACE FUNCTION "public"."dashboard_resumo"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
declare
  v_user uuid := auth.uid();
  v_agora timestamptz := now();
  v_inicio_hoje timestamptz := date_trunc('day', v_agora);
  v_inicio_ontem timestamptz := date_trunc('day', v_agora - interval '1 day');
  v_fim_ontem timestamptz := v_inicio_hoje;
  v_vendas_total_hoje numeric := 0;
  v_vendas_count_hoje int := 0;
  v_ticket_medio_hoje numeric := null;
  v_ticket_medio_ontem numeric := null;
  v_ticket_var_pct numeric := null;
  v_criticos int := 0;
  v_rupturas int := 0;
  v_total_itens int := 0;
  v_saude_estoque_pct numeric := null;
  v_caixa_aberto boolean := false;
  v_caixa_aberto_desde timestamptz := null;
  v_caixa_horas numeric := null;
  v_caixa_ultimo_fechamento timestamptz := null;
  v_id_caixa_aberto bigint := null;
  v_atividade jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_insight text := null;
begin
  if v_user is null then
    return jsonb_build_object('error','sessao_invalida');
  end if;
  -- Vendas hoje
  select coalesce(sum(valor_total),0), count(*),
         case when count(*)>0 then sum(valor_total)/count(*) else null end
    into v_vendas_total_hoje, v_vendas_count_hoje, v_ticket_medio_hoje
  from vendas
  where id_usuario = v_user
    and created_at >= v_inicio_hoje;
  -- Vendas ontem (ticket)
  select case when count(*)>0 then sum(valor_total)/count(*) else null end
    into v_ticket_medio_ontem
  from vendas
  where id_usuario = v_user
    and created_at >= v_inicio_ontem and created_at < v_fim_ontem;
  if v_ticket_medio_hoje is not null and v_ticket_medio_ontem is not null and v_ticket_medio_ontem > 0 then
    v_ticket_var_pct := round( (v_ticket_medio_hoje - v_ticket_medio_ontem) / v_ticket_medio_ontem * 100, 2);
  end if;
  -- Estoque health
  select
    count(*) filter (where controlar_estoque and estoque_atual = 0) as rupturas,
    count(*) filter (where controlar_estoque and estoque_atual <= 3) as criticos,
    count(*) filter (where controlar_estoque) as total_itens
    into v_rupturas, v_criticos, v_total_itens
  from produtos
  where id_usuario = v_user;
  if v_total_itens > 0 then
    v_saude_estoque_pct := round( (v_total_itens - v_criticos)::numeric / v_total_itens * 100, 2 );
  end if;
  -- Caixa aberto
  select id, data_abertura
    into v_id_caixa_aberto, v_caixa_aberto_desde
  from caixas
  where id_usuario = v_user and data_fechamento is null
  order by data_abertura desc
  limit 1;
  if v_id_caixa_aberto is not null then
    v_caixa_aberto := true;
    v_caixa_horas := round( extract(epoch from (v_agora - v_caixa_aberto_desde)) / 3600, 2 );
  end if;
  -- Ultimo fechamento
  select max(data_fechamento) into v_caixa_ultimo_fechamento
  from caixas
  where id_usuario = v_user and data_fechamento is not null;
  -- Atividade recente
  with ult_vendas as (
    select 'venda' as tipo, id, valor_total as valor, created_at as ts, null::text as motivo
    from vendas
    where id_usuario = v_user and created_at >= v_inicio_hoje
    order by created_at desc
    limit 6
  ), ult_movs as (
    select case when tipo = 'sangria' then 'sangria' else 'suprimento' end as tipo,
           id, valor, created_at as ts, motivo
    from caixa_movimentacoes
    where id_usuario = v_user
    order by created_at desc
    limit 6
  ), unidos as (
    select * from ult_vendas
    union all
    select * from ult_movs
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', tipo,
           'id', id,
           'valor', valor,
           'ts', ts,
           'motivo', motivo
         ) order by ts desc), '[]'::jsonb)
    into v_atividade
  from unidos;
  -- Alertas
  if v_rupturas > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo','estoque','mensagem', v_rupturas || ' item(ns) sem estoque.'));
  end if;
  if v_criticos > 0 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo','estoque','mensagem', v_criticos || ' item(ns) em nivel critico (<=3).'));
  end if;
  if v_caixa_aberto and v_caixa_horas is not null and v_caixa_horas > 10 then
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object('tipo','caixa','mensagem','Caixa aberto ha mais de 10h. Considere fechar.'));
  end if;
  -- Insight
  if v_ticket_medio_hoje is not null then
    if v_ticket_var_pct is null then
      v_insight := 'Ticket medio hoje: R$ ' || to_char(v_ticket_medio_hoje, 'FM999G990D00');
    elsif v_ticket_var_pct >= 0 then
      v_insight := 'Ticket medio subiu ' || v_ticket_var_pct || '% vs ontem.';
    else
      v_insight := 'Ticket medio caiu ' || abs(v_ticket_var_pct) || '% vs ontem.';
    end if;
  end if;
  return jsonb_build_object(
    'vendas', jsonb_build_object(
      'totalHoje', v_vendas_total_hoje,
      'countHoje', v_vendas_count_hoje,
      'ticketMedioHoje', v_ticket_medio_hoje,
      'ticketMedioOntem', v_ticket_medio_ontem,
      'ticketMedioVarPct', v_ticket_var_pct
    ),
    'estoque', jsonb_build_object(
      'criticos', v_criticos,
      'rupturas', v_rupturas,
      'saudePct', v_saude_estoque_pct
    ),
    'caixa', jsonb_build_object(
      'aberto', v_caixa_aberto,
      'desde', v_caixa_aberto_desde,
      'horasAberto', v_caixa_horas,
      'ultimoFechamento', v_caixa_ultimo_fechamento
    ),
    'atividade', v_atividade,
    'alertas', v_alertas,
    'insight', v_insight
  );
end;
$_$;


ALTER FUNCTION "public"."dashboard_resumo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_expired_subscriptions"() RETURNS TABLE("deactivated_count" integer, "deactivated_users" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer := 0;
  v_users jsonb := '[]'::jsonb;
  v_user record;
BEGIN
  -- Find and update expired subscriptions
  FOR v_user IN
    SELECT 
      s.id as subscription_id,
      s.user_id,
      s.current_period_end,
      s.manually_extended_until,
      ep.nome_exibicao,
      ep.contato
    FROM subscriptions s
    LEFT JOIN empresa_perfil ep ON ep.user_id = s.user_id
    WHERE s.status = 'active'
      AND COALESCE(s.manually_extended_until, s.current_period_end) < now()
  LOOP
    -- Update subscription to canceled
    UPDATE subscriptions
    SET 
      status = 'canceled',
      updated_at = now()
    WHERE id = v_user.subscription_id;
    
    -- Increment counter
    v_count := v_count + 1;
    
    -- Add to list of deactivated users
    v_users := v_users || jsonb_build_object(
      'user_id', v_user.user_id,
      'company', v_user.nome_exibicao,
      'email', v_user.contato,
      'expired_at', COALESCE(v_user.manually_extended_until, v_user.current_period_end)
    );
  END LOOP;
  
  -- Return results
  RETURN QUERY SELECT v_count, v_users;
END;
$$;


ALTER FUNCTION "public"."deactivate_expired_subscriptions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrementar_estoque"("p_id" integer, "p_qtd" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade invalida para baixa de estoque';
  end if;

  update public.produtos
     set estoque_atual = coalesce(estoque_atual, 0) - p_qtd
   where id = p_id
     and id_usuario = auth.uid()
     and controlar_estoque = true
     and coalesce(estoque_atual, 0) >= p_qtd;

  if not found then
    raise exception 'Estoque insuficiente ou controle desativado para produto id=%', p_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."decrementar_estoque"("p_id" integer, "p_qtd" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_account"("p_user_id" "uuid", "p_source" "text" DEFAULT 'unknown'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_empresa uuid;
  v_email   text;
begin
  if not (
    auth.role() = 'service_role'
    or auth.uid() = p_user_id
    or exists (select 1 from super_admins sa where sa.user_id = auth.uid() and sa.is_active = true)
  ) then
    raise exception 'Unauthorized: not allowed to delete this account';
  end if;

  select id into v_empresa from empresa_perfil where user_id = p_user_id;
  select email into v_email from auth.users where id = p_user_id;

  insert into account_deletion_log (deleted_user_id, empresa_id, email_masked, email_fingerprint, source)
  values (
    p_user_id,
    v_empresa,
    case when v_email is null then null
         else left(v_email, 1) || '***@' || split_part(v_email, '@', 2) end,
    case when v_email is null then null else md5(lower(v_email)) end,
    p_source
  );

  if v_empresa is not null then
    delete from zelochat_sessions               where empresa_id = v_empresa;
    delete from zelochat_orders                 where empresa_id = v_empresa;
    delete from zelochat_pending_orders         where empresa_id = v_empresa;
    delete from zelochat_drivers                where empresa_id = v_empresa;
    delete from zelochat_quick_responses        where empresa_id = v_empresa;
    delete from zelochat_triggers               where empresa_id = v_empresa;
    delete from zelochat_tags                   where empresa_id = v_empresa;
    delete from zelochat_push_subscriptions     where empresa_id = v_empresa;
    delete from zelochat_ai_usage_daily         where empresa_id = v_empresa;
    delete from zelochat_webhook_events_raw     where empresa_id = v_empresa;
    delete from zelochat_billing_payments       where empresa_id = v_empresa;
  end if;
  delete from zelochat_email_onboarding_logs    where user_id = p_user_id;
  delete from zelochat_whatsapp_onboarding_logs where user_id = p_user_id;

  delete from comandas where id_usuario = p_user_id;
  delete from expenses where user_id   = p_user_id;
  delete from vendas   where id_usuario = p_user_id;
  delete from fiado_lancamentos where id_usuario = p_user_id;
  delete from pessoas  where id_usuario = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."delete_account"("p_user_id" "uuid", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_vendas_pagamentos_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_uid uuid;
begin
  select v.id_usuario into v_uid from public.vendas v where v.id = new.id_venda;
  if v_uid is null then
    raise exception 'Venda % não encontrada ou sem id_usuario', new.id_venda using errcode = '23503';
  end if;

  -- If client omitted id_usuario, set it from venda. If provided and mismatched, block.
  if new.id_usuario is null then
    new.id_usuario := v_uid;
  elsif new.id_usuario <> v_uid then
    raise exception 'id_usuario do pagamento (%) difere do da venda (%)', new.id_usuario, v_uid using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_vendas_pagamentos_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_zelo_order_sale"("p_order_id" "uuid", "p_sale_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order public.zelo_orders;
  v_owner uuid;
  v_caixa_id integer;
  v_sale_id bigint;
  v_client_sale_id text;
  v_payment_method text;
  v_forma_pagamento text;
  v_tipo_pedido text;
  v_sale_at timestamptz;
begin
  select * into v_order
  from public.zelo_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'ZL404', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.source = 'mesa' then
    return null;
  end if;

  if v_order.sale_id is not null then
    return v_order.sale_id;
  end if;

  select ep.user_id into v_owner
  from public.empresa_perfil ep
  where ep.id = v_order.empresa_id;

  if v_owner is null then
    raise exception using errcode = 'ZL404', message = 'ORDER_OWNER_NOT_FOUND';
  end if;

  v_sale_at := coalesce(p_sale_at, v_order.closed_at, v_order.updated_at, now());
  v_client_sale_id := 'zelo-order:' || v_order.id;

  -- Protect retries and repair runs from creating a second financial sale.
  select v.id into v_sale_id
  from public.vendas v
  where v.id_usuario = v_owner
    and v.client_sale_id = v_client_sale_id
  limit 1;
  if v_sale_id is not null then
    update public.vendas
    set created_at = least(created_at, v_sale_at)
    where id = v_sale_id;
    return v_sale_id;
  end if;

  select c.id into v_caixa_id
  from public.caixas c
  where c.id_usuario = v_owner
    and c.data_abertura <= v_sale_at
    and (c.data_fechamento is null or c.data_fechamento >= v_sale_at)
  order by c.data_abertura desc
  limit 1;

  v_payment_method := lower(trim(coalesce(
    v_order.payment ->> 'declaredMethod',
    v_order.payment ->> 'method',
    ''
  )));
  v_payment_method := translate(v_payment_method, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_forma_pagamento := case
    when v_payment_method in ('pix', 'pix online') then 'pix'
    when v_payment_method in ('dinheiro', 'cash') then 'dinheiro'
    when v_payment_method in ('cartao_debito', 'debito') then 'cartao_debito'
    when v_payment_method in ('cartao_credito', 'credito', 'cartao') then 'cartao_credito'
    when v_payment_method = 'fiado' then 'fiado'
    else coalesce(nullif(v_payment_method, ''), 'outro')
  end;
  v_tipo_pedido := case
    when coalesce(v_order.fulfillment ->> 'mode', v_order.fulfillment ->> 'type') = 'delivery'
      then 'delivery'
    else 'retirada'
  end;

  insert into public.vendas (
    id_usuario,
    id_caixa,
    client_sale_id,
    valor_total,
    forma_pagamento,
    valor_recebido,
    valor_troco,
    valor_desconto,
    tipo_pedido,
    taxa_entrega,
    created_at
  )
  values (
    v_owner,
    v_caixa_id,
    v_client_sale_id,
    coalesce(v_order.total, 0),
    v_forma_pagamento,
    case when v_forma_pagamento = 'dinheiro' then coalesce(v_order.total, 0) else null end,
    0,
    coalesce(v_order.discount, 0),
    v_tipo_pedido,
    coalesce(v_order.delivery_fee, 0),
    v_sale_at
  )
  on conflict (id_usuario, client_sale_id) where client_sale_id is not null do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select v.id into v_sale_id
    from public.vendas v
    where v.id_usuario = v_owner
      and v.client_sale_id = v_client_sale_id
    limit 1;
    return v_sale_id;
  end if;

  insert into public.vendas_itens (
    id_usuario,
    id_venda,
    id_produto,
    quantidade,
    nome_produto_na_venda,
    preco_unitario_na_venda
  )
  select
    v_owner,
    v_sale_id,
    i.product_id,
    i.quantity,
    i.name,
    i.unit_price
  from public.zelo_order_items i
  where i.order_id = v_order.id;

  return v_sale_id;
end;
$$;


ALTER FUNCTION "public"."ensure_zelo_order_sale"("p_order_id" "uuid", "p_sale_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_actor_can"("p_permission" "text", "p_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select auth.uid() = p_owner
    or exists (
      select 1
      from public.access_users au
      join public.access_roles ar
        on ar.id = au.role_id and ar.owner_user_id = au.owner_user_id
      where au.auth_user_id = auth.uid()
        and au.owner_user_id = p_owner
        and au.status = 'active'
        and coalesce((ar.permissions ->> p_permission)::boolean, false)
    );
$$;


ALTER FUNCTION "public"."fiado_actor_can"("p_permission" "text", "p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_estornar_venda"("p_id_venda" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_venda public.vendas%rowtype;
  v_valor numeric(12,2) := 0;
  v_saldo numeric(12,2);
begin
  if v_actor is null then raise exception 'Não autenticado.' using errcode = '28000'; end if;
  v_owner := public.get_owner_user_id(v_actor);
  select * into v_venda from public.vendas where id = p_id_venda and id_usuario = v_owner for update;
  if not found or v_venda.id_cliente is null then return jsonb_build_object('valor_estornado', 0); end if;
  if exists (select 1 from public.fiado_lancamentos where id_venda = p_id_venda and natureza = 'estorno_venda') then
    return jsonb_build_object('idempotent', true, 'valor_estornado', 0);
  end if;
  if v_venda.forma_pagamento = 'fiado' then
    v_valor := coalesce(v_venda.valor_total, 0);
  elsif v_venda.forma_pagamento = 'multiplo' then
    select coalesce(sum(valor), 0) into v_valor from public.vendas_pagamentos
      where id_venda = p_id_venda and forma_pagamento = 'fiado';
  end if;
  if v_valor <= 0 then return jsonb_build_object('valor_estornado', 0); end if;
  update public.pessoas set saldo_fiado = coalesce(saldo_fiado, 0) - v_valor
    where id = v_venda.id_cliente and id_usuario = v_owner
    returning saldo_fiado into v_saldo;
  insert into public.fiado_lancamentos (id_usuario, id_pessoa, id_venda, id_operador, natureza, valor, descricao, idempotency_key)
    values (v_owner, v_venda.id_cliente, p_id_venda, v_actor, 'estorno_venda', -v_valor,
      'Estorno da venda ' || coalesce(v_venda.numero_venda::text, p_id_venda::text), 'estorno-venda:' || p_id_venda);
  return jsonb_build_object('valor_estornado', v_valor, 'saldo_atual', v_saldo);
end;
$$;


ALTER FUNCTION "public"."fiado_estornar_venda"("p_id_venda" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_excluir_pagamento"("p_id_lancamento" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_lancamento public.fiado_lancamentos%rowtype;
  v_pessoa public.pessoas%rowtype;
  v_saldo_anterior numeric(12,2);
  v_saldo_atual numeric(12,2);
  v_valor numeric(12,2);
begin
  if v_actor is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);
  if not public.fiado_actor_can('fiado.receber', v_owner) then
    raise exception 'Você não tem permissão para excluir recebimentos de fiado.' using errcode = '42501';
  end if;

  -- Lock order: pessoa antes do lançamento, igual ao recebimento, para evitar corrida.
  select p.* into v_pessoa
    from public.pessoas p
    join public.fiado_lancamentos l on l.id_pessoa = p.id
   where l.id = p_id_lancamento
     and l.id_usuario = v_owner
     and l.natureza = 'pagamento'
     and p.id_usuario = v_owner
   for update of p;
  if not found then
    raise exception 'Pagamento recebido não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_lancamento
    from public.fiado_lancamentos
   where id = p_id_lancamento
     and id_usuario = v_owner
     and id_pessoa = v_pessoa.id
     and natureza = 'pagamento'
   for update;
  if not found then
    raise exception 'Pagamento recebido não encontrado.' using errcode = 'P0002';
  end if;

  v_valor := abs(v_lancamento.valor);
  if v_valor <= 0 then
    raise exception 'O pagamento não possui um valor válido.' using errcode = '22023';
  end if;
  v_saldo_anterior := coalesce(v_pessoa.saldo_fiado, 0);

  if v_lancamento.id_caixa_movimentacao is not null then
    delete from public.caixa_movimentacoes
     where id = v_lancamento.id_caixa_movimentacao
       and id_caixa = v_lancamento.id_caixa
       and id_usuario = v_owner;
  elsif v_lancamento.id_caixa is not null and v_lancamento.descricao like '%adicionado ao caixa%' then
    raise exception 'Este pagamento não tem a movimentação de caixa vinculada. Atualize o fichário ou faça o ajuste no caixa.' using errcode = 'P0001';
  end if;

  update public.pessoas
     set saldo_fiado = v_saldo_anterior + v_valor
   where id = v_pessoa.id
     and id_usuario = v_owner
   returning saldo_fiado into v_saldo_atual;

  delete from public.fiado_lancamentos
   where id = v_lancamento.id
     and id_usuario = v_owner;

  return jsonb_build_object(
    'excluido', true,
    'lancamento_id', v_lancamento.id,
    'valor_excluido', v_valor,
    'saldo_anterior', v_saldo_anterior,
    'saldo_atual', v_saldo_atual
  );
end;
$$;


ALTER FUNCTION "public"."fiado_excluir_pagamento"("p_id_lancamento" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_excluir_pessoa"("p_id_pessoa" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_pessoa public.pessoas%rowtype;
  v_lancamentos_excluidos integer := 0;
  v_vendas_desvinculadas integer := 0;
begin
  if v_actor is null then
    raise exception 'Nao autenticado.' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);
  if not public.fiado_actor_can('pessoas.gerenciar', v_owner) then
    raise exception 'Voce nao tem permissao para excluir pessoas.' using errcode = '42501';
  end if;

  select * into v_pessoa
    from public.pessoas
   where id = p_id_pessoa
     and id_usuario = v_owner
   for update;
  if not found then
    raise exception 'Pessoa nao encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_pessoa.saldo_fiado, 0) <> 0 then
    raise exception 'Nao e possivel excluir uma pessoa com saldo de fiado diferente de zero.' using errcode = '23514';
  end if;

  -- Preserva a venda e seus totais, mas remove a identidade que a empresa
  -- decidiu apagar antes de remover a linha-pai.
  update public.vendas
     set id_cliente = null,
         id_pessoa = null
   where id_usuario = v_owner
     and (id_cliente = v_pessoa.id or id_pessoa = v_pessoa.id);
  get diagnostics v_vendas_desvinculadas = row_count;

  delete from public.fiado_lancamentos
   where id_usuario = v_owner
     and id_pessoa = v_pessoa.id;
  get diagnostics v_lancamentos_excluidos = row_count;

  delete from public.pessoas
   where id = v_pessoa.id
     and id_usuario = v_owner;

  return jsonb_build_object(
    'excluida', true,
    'pessoa_id', v_pessoa.id,
    'lancamentos_excluidos', v_lancamentos_excluidos,
    'vendas_desvinculadas', v_vendas_desvinculadas
  );
end;
$$;


ALTER FUNCTION "public"."fiado_excluir_pessoa"("p_id_pessoa" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update public.pessoas
     set saldo_fiado = coalesce(saldo_fiado,0) + p_valor
   where id = p_id_pessoa
     and id_usuario = auth.uid();
$$;


ALTER FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_registrar_debito_pagamento_venda"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_venda public.vendas%rowtype;
begin
  if new.forma_pagamento <> 'fiado' or coalesce(new.valor, 0) <= 0 then
    return new;
  end if;
  select * into v_venda from public.vendas where id = new.id_venda;
  if v_venda.id_cliente is null then
    raise exception 'Pagamento fiado exige cliente vinculado.' using errcode = '23514';
  end if;

  insert into public.fiado_lancamentos (
    id_usuario, id_pessoa, id_venda, id_caixa, natureza, valor, descricao, idempotency_key, created_at
  ) values (
    v_venda.id_usuario, v_venda.id_cliente, v_venda.id, v_venda.id_caixa,
    'debito_venda', new.valor, 'Parcela fiado da venda',
    'venda-pagamento-fiado:' || new.id, coalesce(v_venda.created_at, now())
  ) on conflict (id_usuario, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."fiado_registrar_debito_pagamento_venda"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_registrar_debito_venda"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_valor numeric(12,2);
begin
  if new.forma_pagamento <> 'fiado' or new.id_cliente is null then
    return new;
  end if;
  v_valor := coalesce(new.valor_total, 0);

  if v_valor <= 0 then return new; end if;

  insert into public.fiado_lancamentos (
    id_usuario, id_pessoa, id_venda, id_caixa, id_operador,
    natureza, valor, descricao, idempotency_key, created_at
  ) values (
    new.id_usuario,
    new.id_cliente,
    new.id,
    new.id_caixa,
    null,
    'debito_venda',
    v_valor,
    'Compra fiado',
    'venda-fiado:' || new.id,
    coalesce(new.created_at, now())
  ) on conflict (id_usuario, idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."fiado_registrar_debito_venda"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update public.pessoas
     set saldo_fiado = greatest(0, coalesce(saldo_fiado,0) - p_valor)
   where id = p_id_pessoa
     and id_usuario = auth.uid();
$$;


ALTER FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fiado_registrar_pagamento_v2"("p_id_pessoa" "uuid", "p_valor" numeric, "p_adicionar_ao_caixa" boolean DEFAULT true, "p_id_caixa" integer DEFAULT NULL::integer, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_pessoa public.pessoas%rowtype;
  v_caixa_id integer;
  v_caixa_movimentacao_id integer;
  v_saldo_anterior numeric(12,2);
  v_saldo_atual numeric(12,2);
  v_lancamento public.fiado_lancamentos%rowtype;
begin
  if v_actor is null then raise exception 'Não autenticado.' using errcode = '28000'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe um valor maior que zero.' using errcode = '22023'; end if;
  v_owner := public.get_owner_user_id(v_actor);
  if not public.fiado_actor_can('fiado.receber', v_owner) then
    raise exception 'Você não tem permissão para receber fiado.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_lancamento from public.fiado_lancamentos
      where id_usuario = v_owner and idempotency_key = p_idempotency_key;
    if found then
      select coalesce(saldo_fiado, 0) into v_saldo_atual from public.pessoas where id = p_id_pessoa;
      return jsonb_build_object('idempotent', true, 'lancamento_id', v_lancamento.id, 'saldo_atual', v_saldo_atual);
    end if;
  end if;

  select * into v_pessoa from public.pessoas
    where id = p_id_pessoa and id_usuario = v_owner for update;
  if not found then raise exception 'Pessoa não encontrada.' using errcode = 'P0002'; end if;
  v_saldo_anterior := coalesce(v_pessoa.saldo_fiado, 0);

  if p_adicionar_ao_caixa then
    v_caixa_id := p_id_caixa;
    if v_caixa_id is null then
      select id into v_caixa_id from public.caixas
        where id_usuario = v_owner and data_fechamento is null
        order by data_abertura desc limit 1;
    end if;
    if v_caixa_id is null or not exists (
      select 1 from public.caixas where id = v_caixa_id and id_usuario = v_owner and data_fechamento is null
    ) then
      raise exception 'Abra um caixa para adicionar este recebimento à gaveta.' using errcode = 'P0001';
    end if;
    insert into public.caixa_movimentacoes (id_caixa, id_usuario, id_operador, tipo, valor, motivo)
      values (v_caixa_id, v_owner, v_actor, 'suprimento', p_valor, 'Pagamento fiado de ' || v_pessoa.nome)
      returning id into v_caixa_movimentacao_id;
  end if;

  update public.pessoas
    set saldo_fiado = v_saldo_anterior - p_valor
    where id = v_pessoa.id
    returning saldo_fiado into v_saldo_atual;

  insert into public.fiado_lancamentos (
    id_usuario, id_pessoa, id_caixa, id_caixa_movimentacao, id_operador, natureza, valor, descricao, idempotency_key
  ) values (
    v_owner, v_pessoa.id, v_caixa_id, v_caixa_movimentacao_id, v_actor, 'pagamento', -p_valor,
    'Pagamento recebido' || case when p_adicionar_ao_caixa then ' e adicionado ao caixa.' else '.' end,
    p_idempotency_key
  ) returning * into v_lancamento;

  return jsonb_build_object(
    'idempotent', false,
    'lancamento_id', v_lancamento.id,
    'saldo_anterior', v_saldo_anterior,
    'saldo_atual', v_saldo_atual,
    'credito_gerado', greatest(0, -v_saldo_atual)
  );
end;
$$;


ALTER FUNCTION "public"."fiado_registrar_pagamento_v2"("p_id_pessoa" "uuid", "p_valor" numeric, "p_adicionar_ao_caixa" boolean, "p_id_caixa" integer, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    (
      SELECT owner_user_id
        FROM public.access_users
       WHERE auth_user_id = lookup_user_id
         AND status = 'active'
       LIMIT 1
    ),
    lookup_user_id
  );
$$;


ALTER FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") IS 'Returns the owner_user_id for any authenticated user. If the user is an active sub-user the function returns their owner''s id; otherwise it returns the user''s own id, making them an owner by default.';



CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.super_admins sa
    where sa.user_id = auth.uid()
      and sa.is_active = true
  );
$$;


ALTER FUNCTION "public"."is_active_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_subscription_active"("p_owner_user_id" "uuid", "p_product" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_owner_user_id
      and case p_product
            when 'pdv'  then s.plan_tier in ('pdv', 'bundle')
            when 'chat' then s.plan_tier in ('chat', 'bundle')
            else false
          end
      and (
        coalesce(s.manually_extended_until, '-infinity'::timestamptz) > now()
        or (
          (s.status = 'active' or (s.status = 'trialing' and p_product = 'pdv'))
          and coalesce(s.current_period_end, '-infinity'::timestamptz) > now()
        )
      )
  );
$$;


ALTER FUNCTION "public"."is_subscription_active"("p_owner_user_id" "uuid", "p_product" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_table_capability"("p_empresa_id" "uuid", "p_comanda_id" "uuid", "p_mesa_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone DEFAULT ("now"() + '12:00:00'::interval)) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid;
begin
  update zelomenu_table_capabilities set revoked_at = now()
   where comanda_id = p_comanda_id and revoked_at is null;
  insert into zelomenu_table_capabilities(empresa_id, comanda_id, mesa_id, token_hash, expires_at)
  values (p_empresa_id, p_comanda_id, p_mesa_id, p_token_hash, p_expires_at)
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "public"."issue_table_capability"("p_empresa_id" "uuid", "p_comanda_id" "uuid", "p_mesa_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mesas_status_rbac_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_service_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls have no user claim and retain the existing bypass.
  if v_actor is null or v_service_role = 'service_role' or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A mesa deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ocupada' then
      if not public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para abrir a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'fechando' then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para iniciar o fechamento da mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'livre' then
      if not (
        public.fiado_actor_can('mesas.fechar', old.id_usuario)
        or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
      ) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para liberar a mesa.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de mesa invÃ¡lido para este operador.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."mesas_status_rbac_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moddatetime"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;


ALTER FUNCTION "public"."moddatetime"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_caixa_movimentacao_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner_user_id uuid;
  v_data_fechamento timestamptz;
BEGIN
  SELECT c.id_usuario, c.data_fechamento
    INTO v_owner_user_id, v_data_fechamento
    FROM public.caixas c
   WHERE c.id = NEW.id_caixa;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'caixa_not_found' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NOT NULL AND public.get_owner_user_id(auth.uid()) <> v_owner_user_id THEN
    RAISE EXCEPTION 'caixa_not_accessible' USING ERRCODE = '42501';
  END IF;

  IF v_data_fechamento IS NOT NULL THEN
    RAISE EXCEPTION 'caixa_closed' USING ERRCODE = '23514';
  END IF;

  NEW.id_usuario := v_owner_user_id;

  IF auth.uid() IS NOT NULL THEN
    NEW.id_operador := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_caixa_movimentacao_actor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 select public.transition_zelo_order(p_order_id,p_expected_revision,'reject',p_actor_id,jsonb_build_object('reason',left(coalesce(p_reason,''),500))) $$;


ALTER FUNCTION "public"."reject_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_zelomenu_delivery_quote_request"("p_company_id" "uuid", "p_request_id" "uuid", "p_fee" numeric, "p_resolved_snapshot" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("request_id" "uuid", "session_id" "uuid", "next_revision" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."resolve_zelomenu_delivery_quote_request"("p_company_id" "uuid", "p_request_id" "uuid", "p_fee" numeric, "p_resolved_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_table_capability"("p_comanda_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update zelomenu_table_capabilities set revoked_at = coalesce(revoked_at, now())
  where comanda_id = p_comanda_id and revoked_at is null
$$;


ALTER FUNCTION "public"."revoke_table_capability"("p_comanda_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_subscription_expiration_check"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result record;
BEGIN
  -- Run the deactivation function
  SELECT * INTO v_result FROM deactivate_expired_subscriptions();
  
  -- Log the execution
  INSERT INTO subscription_cron_logs (deactivated_count, deactivated_users)
  VALUES (v_result.deactivated_count, v_result.deactivated_users);
  
EXCEPTION WHEN OTHERS THEN
  -- Log errors
  INSERT INTO subscription_cron_logs (deactivated_count, error)
  VALUES (0, SQLERRM);
END;
$$;


ALTER FUNCTION "public"."run_subscription_expiration_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."saldo_caixa"("p_id_caixa" bigint) RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    -- Valor inicial de abertura do caixa
    COALESCE(c.valor_inicial, 0)

    -- Vendas em dinheiro simples (forma_pagamento = 'dinheiro')
    + COALESCE((
        SELECT SUM(
          GREATEST(COALESCE(v.valor_recebido, 0) - COALESCE(v.valor_troco, 0), 0)
        )
        FROM vendas v
        WHERE v.id_caixa = p_id_caixa
          AND v.forma_pagamento = 'dinheiro'
    ), 0)

    -- Dinheiro em vendas com pagamento múltiplo
    + COALESCE((
        SELECT SUM(vp.valor)
        FROM vendas_pagamentos vp
        JOIN vendas v ON vp.id_venda = v.id
        WHERE v.id_caixa = p_id_caixa
          AND vp.forma_pagamento = 'dinheiro'
    ), 0)

    -- Sangrias (saídas do caixa)
    - COALESCE((
        SELECT SUM(m.valor)
        FROM caixa_movimentacoes m
        WHERE m.id_caixa = p_id_caixa
          AND m.tipo = 'sangria'
    ), 0)

    -- Suprimentos (entradas extras)
    + COALESCE((
        SELECT SUM(m.valor)
        FROM caixa_movimentacoes m
        WHERE m.id_caixa = p_id_caixa
          AND m.tipo = 'suprimento'
    ), 0)

  FROM caixas c
  WHERE c.id = p_id_caixa;
$$;


ALTER FUNCTION "public"."saldo_caixa"("p_id_caixa" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_zelomenu_delivery_settings"("p_empresa_id" "uuid", "p_enabled" boolean, "p_address" "jsonb", "p_ranges" "jsonb", "p_pricing_rules" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_address jsonb := coalesce(p_address, '{}'::jsonb);
  v_postal text := regexp_replace(coalesce(v_address->>'postalCode', ''), '[^0-9]', '', 'g');
  v_number text := trim(coalesce(v_address->>'number', ''));
  v_complement text := nullif(trim(coalesce(v_address->>'complement', '')), '');
  v_street text := nullif(trim(coalesce(v_address->>'street', '')), '');
  v_neighborhood text := nullif(trim(coalesce(v_address->>'neighborhood', '')), '');
  v_city text := nullif(trim(coalesce(v_address->>'city', '')), '');
  v_state text := upper(nullif(trim(coalesce(v_address->>'state', '')), ''));
  v_lat double precision := nullif(v_address->>'latitude', '')::double precision;
  v_lng double precision := nullif(v_address->>'longitude', '')::double precision;
  v_old_lat double precision;
  v_old_lng double precision;
  v_old_version bigint;
  v_ranges jsonb := coalesce(p_ranges, '[]'::jsonb);
  v_pricing_rules jsonb := coalesce(p_pricing_rules, '[]'::jsonb);
  v_current_config jsonb;
  v_rule record;
  v_rule_id uuid;
begin
  if jsonb_typeof(v_address) <> 'object' or jsonb_typeof(v_ranges) <> 'array' or jsonb_typeof(v_pricing_rules) <> 'array' then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if p_enabled and (
    v_postal !~ '^[0-9]{8}$' or v_number = '' or v_street is null or v_city is null or
    v_state is null or v_state !~ '^[A-Z]{2}$' or v_lat is null or v_lng is null or
    v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 or
    jsonb_array_length(v_ranges) = 0
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if v_lat is not null and v_lng is null or v_lat is null and v_lng is not null then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) as range_item
    where coalesce((range_item->>'maxDistanceM')::numeric, 0) <= 0
       or coalesce((range_item->>'maxDistanceM')::numeric, 0) <> trunc((range_item->>'maxDistanceM')::numeric)
       or coalesce((range_item->>'price')::numeric, -1) < 0
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) as a
    join jsonb_array_elements(v_ranges) as b
      on (a->>'maxDistanceM') = (b->>'maxDistanceM')
     and a is distinct from b
  ) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_CONFIGURATION_INVALID';
  end if;

  -- Validate pricing rules
  if jsonb_array_length(v_pricing_rules) > 0 then
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as rule
      where nullif(trim(rule->>'label'), '') is null
         or (rule->>'startMinute')::int is null
         or (rule->>'endMinute')::int is null
         or (rule->>'startMinute')::int = (rule->>'endMinute')::int
         or (rule->>'startMinute')::int < 0
         or (rule->>'startMinute')::int >= 1440
         or (rule->>'endMinute')::int < 0
         or (rule->>'endMinute')::int > 1440
         or jsonb_array_length(rule->'pricesByDistance') = 0
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RULE_INVALID';
    end if;

    -- Validate rule overlaps (defense-in-depth; domain validation is primary)
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as a
      join jsonb_array_elements(v_pricing_rules) as b on a::text < b::text
      where (
        -- Two intervals overlap iff one's start is inside the other's interval
        -- Standard interval (start < end): contains if start <= point < end
        -- Midnight-crossing (start > end): contains if point >= start or point < end
        (
          (b->>'startMinute')::int < (b->>'endMinute')::int
          and (a->>'startMinute')::int >= (b->>'startMinute')::int
          and (a->>'startMinute')::int < (b->>'endMinute')::int
        ) or (
          (b->>'startMinute')::int > (b->>'endMinute')::int
          and ((a->>'startMinute')::int >= (b->>'startMinute')::int
            or (a->>'startMinute')::int < (b->>'endMinute')::int)
        ) or
        (
          (a->>'startMinute')::int < (a->>'endMinute')::int
          and (b->>'startMinute')::int >= (a->>'startMinute')::int
          and (b->>'startMinute')::int < (a->>'endMinute')::int
        ) or (
          (a->>'startMinute')::int > (a->>'endMinute')::int
          and ((b->>'startMinute')::int >= (a->>'startMinute')::int
            or (b->>'startMinute')::int < (a->>'endMinute')::int)
        )
      )
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RULE_OVERLAP';
    end if;

    -- Validate each rule's prices cover all current ranges
    if exists (
      select 1
      from jsonb_array_elements(v_pricing_rules) as rule
      cross join jsonb_array_elements(v_ranges) as rng
      where not exists (
        select 1
        from jsonb_array_elements(rule->'pricesByDistance') as p
        where (p->>'maxDistanceM')::int = round((rng->>'maxDistanceM')::numeric)::int
          and (p->>'price')::numeric >= 0
      )
    ) then
      raise exception using errcode = 'ZL400', message = 'DELIVERY_PRICING_RANGE_PRICE_MISSING';
    end if;
  end if;

  -- Lock company row and read current state
  select delivery_latitude, delivery_longitude, delivery_location_version, delivery_config
    into v_old_lat, v_old_lng, v_old_version, v_current_config
    from empresa_perfil
   where id = p_empresa_id
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'EMPRESA_NOT_FOUND';
  end if;

  -- Update address and config
  update empresa_perfil
     set delivery_postal_code = nullif(v_postal, ''),
         delivery_number = nullif(v_number, ''),
         delivery_complement = v_complement,
         delivery_street = v_street,
         delivery_neighborhood = v_neighborhood,
         delivery_city = v_city,
         delivery_state = v_state,
         delivery_latitude = v_lat,
         delivery_longitude = v_lng,
         delivery_location_version = case
           when v_old_lat is distinct from v_lat or v_old_lng is distinct from v_lng
             then coalesce(v_old_version, 0) + 1
           else coalesce(v_old_version, 0)
         end,
         delivery_config = jsonb_set(
           jsonb_set(
             coalesce(delivery_config, '{}'::jsonb),
             '{enabled}',
             to_jsonb(coalesce(p_enabled, false)),
             true
           ),
           '{pricingVersion}',
           to_jsonb(coalesce((v_current_config->>'pricingVersion')::int, 0) + 1),
           true
         )
   where id = p_empresa_id;

  -- Replace ranges
  delete from zelomenu_delivery_ranges where company_id = p_empresa_id;

  insert into zelomenu_delivery_ranges(company_id, max_distance_m, delivery_price)
  select p_empresa_id,
         round((range_item->>'maxDistanceM')::numeric)::integer,
         round((range_item->>'price')::numeric, 2)
    from jsonb_array_elements(v_ranges) as range_item;

  -- Replace pricing rules
  delete from zelomenu_delivery_pricing_rules where company_id = p_empresa_id;

  for v_rule in select value from jsonb_array_elements(v_pricing_rules) loop
    insert into zelomenu_delivery_pricing_rules(company_id, label, start_minute, end_minute, enabled, days_of_week)
    values (
      p_empresa_id,
      trim(v_rule->>'label'),
      (v_rule->>'startMinute')::smallint,
      (v_rule->>'endMinute')::smallint,
      coalesce((v_rule->>'enabled')::boolean, true),
      coalesce(
        (select array_agg(d::smallint) from jsonb_array_elements_text(v_rule->'daysOfWeek') as d),
        '{0,1,2,3,4,5,6}'::smallint[]
      )
    )
    returning id into v_rule_id;

    insert into zelomenu_delivery_pricing_rule_ranges(pricing_rule_id, max_distance_m, delivery_price)
    select v_rule_id,
           (p->>'maxDistanceM')::integer,
           round((p->>'price')::numeric, 2)
      from jsonb_array_elements(v_rule->'pricesByDistance') as p;
  end loop;
end;
$_$;


ALTER FUNCTION "public"."save_zelomenu_delivery_settings"("p_empresa_id" "uuid", "p_enabled" boolean, "p_address" "jsonb", "p_ranges" "jsonb", "p_pricing_rules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_numero_venda"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  SELECT COALESCE(MAX(numero_venda), 0) + 1
  INTO NEW.numero_venda
  FROM vendas
  WHERE id_usuario = NEW.id_usuario;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_numero_venda"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."billing_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "provider" "text" NOT NULL,
    "method" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" NOT NULL,
    "plan_tier" "text",
    "has_mesas_addon" boolean DEFAULT false NOT NULL,
    "has_acessos_addon" boolean DEFAULT false NOT NULL,
    "amount_expected_cents" integer NOT NULL,
    "amount_paid_cents" integer,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "external_reference" "text" NOT NULL,
    "provider_payment_id" "text",
    "provider_checkout_id" "text",
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "provider_status" "text",
    "br_code" "text",
    "qr_code_base64" "text",
    "expires_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_zelo_menu" boolean DEFAULT false NOT NULL,
    CONSTRAINT "billing_payments_kind_check" CHECK (("kind" = ANY (ARRAY['subscription_start'::"text", 'subscription_renewal'::"text", 'addon'::"text", 'plan_change'::"text"]))),
    CONSTRAINT "billing_payments_method_check" CHECK (("method" = ANY (ARRAY['card'::"text", 'pix'::"text"]))),
    CONSTRAINT "billing_payments_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['pdv'::"text", 'chat'::"text", 'bundle'::"text"]))),
    CONSTRAINT "billing_payments_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'abacatepay'::"text"]))),
    CONSTRAINT "billing_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'expired'::"text", 'failed'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."billing_payments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_pix_payment"("p_payment_id" "uuid", "p_provider_status" "text", "p_mapped_status" "text", "p_amount_paid_cents" integer DEFAULT NULL::integer, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_paid_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_external_reference" "text" DEFAULT NULL::"text") RETURNS "public"."billing_payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."settle_pix_payment"("p_payment_id" "uuid", "p_provider_status" "text", "p_mapped_status" "text", "p_amount_paid_cents" integer, "p_expires_at" timestamp with time zone, "p_paid_at" timestamp with time zone, "p_external_reference" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "status" "text",
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false,
    "price_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "manually_extended_until" timestamp with time zone,
    "admin_notes" "text",
    "last_modified_by" "uuid",
    "last_modified_at" timestamp with time zone,
    "payment_provider" "text" DEFAULT 'asaas'::"text",
    "billing_type" "text",
    "whatsapp_onboarding_sent_at" timestamp with time zone,
    "whatsapp_followup_7d_sent_at" timestamp with time zone,
    "whatsapp_followup_28d_sent_at" timestamp with time zone,
    "has_mesas_addon" boolean DEFAULT false,
    "plan_tier" "text" DEFAULT 'pdv'::"text" NOT NULL,
    "has_acessos_addon" boolean DEFAULT false NOT NULL,
    "has_zelo_menu" boolean DEFAULT false NOT NULL,
    "monthly_value_cents" integer,
    CONSTRAINT "subscriptions_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['pdv'::"text", 'chat'::"text", 'bundle'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'trial_expired'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscriptions"."provider_customer_id" IS 'Customer ID from the payment provider (Asaas or legacy Stripe)';



COMMENT ON COLUMN "public"."subscriptions"."provider_subscription_id" IS 'Subscription ID from the payment provider (Asaas or legacy Stripe)';



COMMENT ON COLUMN "public"."subscriptions"."payment_provider" IS 'Payment provider: asaas or stripe (legacy)';



COMMENT ON COLUMN "public"."subscriptions"."billing_type" IS 'Billing method: PIX, CREDIT_CARD, BOLETO';



COMMENT ON COLUMN "public"."subscriptions"."plan_tier" IS 'Plano da assinatura: pdv (R$59), chat (R$97), bundle (R$147 - inclui ambos). Addons (has_mesas_addon) somam à parte. Default pdv para retrocompatibilidade.';



COMMENT ON COLUMN "public"."subscriptions"."has_zelo_menu" IS 'ZeloMenu module entitlement. chat/bundle include ZeloMenu by product policy (D-014); a pdv-only subscription needs this true for the +R$40 ZeloMenu addon (R$99 tier).';



COMMENT ON COLUMN "public"."subscriptions"."monthly_value_cents" IS 'Valor mensal REAL cobrado desta assinatura, em centavos. Preenchido pelo webhook Stripe (soma dos itens) e pelo fluxo Pix (amount_expected_cents do billing_payments). Null = ainda não sincronizado; MRR cai no fallback estimado por plan_tier.';



CREATE OR REPLACE FUNCTION "public"."subscription_effective_expiry"("s" "public"."subscriptions") RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select greatest(
    coalesce(s.current_period_end, '-infinity'::timestamptz),
    coalesce(s.manually_extended_until, '-infinity'::timestamptz)
  );
$$;


ALTER FUNCTION "public"."subscription_effective_expiry"("s" "public"."subscriptions") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_action" "text", "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_detail" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare o public.zelo_orders; v_to text; v_owner uuid; v_from text; v_stock record; v_permission text;
begin
  select * into o from public.zelo_orders where id=p_order_id for update;
  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;
  if auth.role()<>'service_role' then
    if p_actor_id is null then p_actor_id:=auth.uid();
    elsif p_actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='FORGED_ACTOR'; end if;
    v_owner:=public.get_owner_user_id(auth.uid());
    if not exists(select 1 from public.empresa_perfil where id=o.empresa_id and user_id=v_owner) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
    v_permission:=case
      when p_action in ('cancel','reject') then 'pedidos.cancelar'
      when p_action in ('deliver') then 'pedidos.receber'
      when p_action in ('start_preparing','mark_ready') then 'pedidos.cozinha'
      when p_action in ('accept','dispatch','payment_approved') then 'pedidos.acessar'
    end;
    if v_permission is null or not public.zelo_order_has_permission(o.empresa_id,v_permission) then
      raise exception using errcode='42501',message='ORDER_PERMISSION_DENIED',detail=coalesce(v_permission,p_action);
    end if;
  end if;
  if o.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
  v_from:=o.status;
  v_to:=case p_action when 'payment_approved' then 'pending_review' when 'accept' then 'accepted'
    when 'start_preparing' then 'preparing' when 'mark_ready' then 'ready' when 'dispatch' then 'out_for_delivery'
    when 'deliver' then 'delivered' when 'reject' then 'rejected' when 'cancel' then 'cancelled' end;
  if v_to is null or not ((o.status='pending_payment' and v_to in ('pending_review','cancelled')) or
    (o.status='pending_review' and v_to in ('accepted','rejected','cancelled')) or
    (o.status='accepted' and v_to in ('preparing','cancelled')) or (o.status='preparing' and v_to in ('ready','cancelled')) or
    (o.status='ready' and v_to in ('out_for_delivery','delivered','cancelled')) or
    (o.status='out_for_delivery' and v_to='delivered')) then raise exception using errcode='ZL409',message='INVALID_ORDER_TRANSITION'; end if;

  if v_to='accepted' and o.stock_committed_at is null then
    -- product_id/quantity source now unions the container's own line with
    -- every linked-option product found inside its modifiers, so a product
    -- sold both standalone and as a combo's linked option in the same
    -- order aggregates correctly (matches the two-pass pattern already
    -- used by server/zelomenuCartSessions.ts resolveSnapshots).
    for v_stock in
      select c.id,c.nome,coalesce(c.estoque_compartilhado_atual,0) available,sum(x.quantity)::integer quantity
      from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
        where oi.order_id=o.id
      ) x
      join public.produtos p on p.id=x.product_id
      join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where coalesce(c.controlar_estoque_compartilhado,false)
      group by c.id,c.nome,c.estoque_compartilhado_atual
    loop
      update public.categorias set estoque_compartilhado_atual=coalesce(estoque_compartilhado_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_compartilhado_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
    for v_stock in
      select p.id,p.nome,coalesce(p.estoque_atual,0) available,sum(x.quantity)::integer quantity
      from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
        where oi.order_id=o.id
      ) x
      join public.produtos p on p.id=x.product_id
      left join public.categorias c on c.id=p.id_categoria
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p.id_usuario
      where coalesce(p.controlar_estoque,false) and not coalesce(c.controlar_estoque_compartilhado,false)
      group by p.id,p.nome,p.estoque_atual
    loop
      update public.produtos set estoque_atual=coalesce(estoque_atual,0)-v_stock.quantity
      where id=v_stock.id and coalesce(estoque_atual,0)>=v_stock.quantity;
      if not found then raise exception using errcode='ZL409',message='PRODUCT_STOCK_EXCEEDED',detail=v_stock.nome; end if;
    end loop;
  end if;

  if v_to='cancelled' and o.stock_committed_at is not null and o.stock_released_at is null
         and (o.source <> 'mesa' or o.fulfillment->>'comandaItemId' is null) then
    update public.categorias c set estoque_compartilhado_atual=coalesce(c.estoque_compartilhado_atual,0)+x.quantity
    from (
      select p2.id_categoria as cat_id, sum(y.quantity)::integer quantity from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
        where oi.order_id=o.id
      ) y
      join public.produtos p2 on p2.id=y.product_id
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p2.id_usuario
      join public.categorias c2 on c2.id=p2.id_categoria and coalesce(c2.controlar_estoque_compartilhado,false)
      group by p2.id_categoria
    ) x(cat_id,quantity) where c.id=x.cat_id;
    update public.produtos p set estoque_atual=coalesce(p.estoque_atual,0)+x.quantity
    from (
      select y.product_id, sum(y.quantity)::integer quantity from (
        select oi.product_id, oi.quantity from public.zelo_order_items oi where oi.order_id=o.id
        union all
        select lp.id_produto,(case when (opt->>'quantity') ~ '^[0-9]+$' then (opt->>'quantity')::integer else 1 end)*oi.quantity
        from public.zelo_order_items oi
        cross join lateral jsonb_array_elements(coalesce(oi.modifiers,'[]'::jsonb)) grp
        cross join lateral jsonb_array_elements(coalesce(grp->'selectedOptions','[]'::jsonb)) opt
        join public.zelomenu_modifier_option_products lp
          on lp.id_opcao = (case when (opt->>'optionId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (opt->>'optionId')::uuid end)
        where oi.order_id=o.id
      ) y
      join public.produtos p2 on p2.id=y.product_id
      join public.empresa_perfil ep on ep.id=o.empresa_id and ep.user_id=p2.id_usuario
      left join public.categorias c2 on c2.id=p2.id_categoria
      where coalesce(p2.controlar_estoque,false) and not coalesce(c2.controlar_estoque_compartilhado,false)
      group by y.product_id
    ) x(product_id,quantity) where p.id=x.product_id;
  end if;

  update public.zelo_orders set status=v_to,revision=revision+1,updated_at=now(),
    accepted_at=case when v_to='accepted' then now() else accepted_at end,
    stock_committed_at=case when v_to='accepted' then now() else stock_committed_at end,
    stock_released_at=case when v_to='cancelled' and stock_committed_at is not null
      and (o.source <> 'mesa' or o.fulfillment->>'comandaItemId' is null)
      then now() else stock_released_at end,
    rejected_at=case when v_to='rejected' then now() else rejected_at end,
    closed_at=case when v_to in ('delivered','rejected','cancelled') then now() else closed_at end
    where id=o.id returning * into o;
  insert into public.zelo_order_events(order_id,empresa_id,event_type,from_status,to_status,actor_id,detail)
    values(o.id,o.empresa_id,p_action,v_from,v_to,p_actor_id,coalesce(p_detail,'{}'));
  insert into public.zelo_order_outbox(order_id,empresa_id,topic,payload,idempotency_key)
    values(o.id,o.empresa_id,'order.'||p_action,public.zelo_order_result(o)||jsonb_build_object('detail',p_detail),
      'order.'||p_action||':'||o.id||':'||o.revision);
  return public.zelo_order_result(o);
end $_$;


ALTER FUNCTION "public"."transition_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_action" "text", "p_actor_id" "uuid", "p_detail" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_cart_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "ordering_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "context" "text" NOT NULL,
    "state" "text" DEFAULT 'cart_open'::"text" NOT NULL,
    "source_ref" "text" NOT NULL,
    "customer_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cart_snapshot" "jsonb" DEFAULT '{"items": [], "observations": null}'::"jsonb" NOT NULL,
    "fulfillment_snapshot" "jsonb" DEFAULT '{"type": "pickup", "pickupDate": null, "pickupTime": null, "deliveryFee": 0, "deliveryAddress": null, "deliveryNeighborhood": null}'::"jsonb" NOT NULL,
    "pricing_snapshot" "jsonb" DEFAULT '{"total": 0, "subtotal": 0, "deliveryFee": 0}'::"jsonb" NOT NULL,
    "payment_snapshot" "jsonb" DEFAULT '{"declaredMethod": null, "pixReceiptApproved": false, "pixReceiptRequired": false}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "current_token_hash" "text",
    "current_token_last4" "text",
    "last_revalidated_at" timestamp with time zone,
    "last_revalidation" "jsonb",
    "confirmed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "capability_id" "uuid",
    CONSTRAINT "zelomenu_cart_sessions_context_check" CHECK (("context" = ANY (ARRAY['whatsapp_order'::"text", 'public_order'::"text", 'table_order'::"text"]))),
    CONSTRAINT "zelomenu_cart_sessions_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "zelomenu_cart_sessions_state_check" CHECK (("state" = ANY (ARRAY['cart_open'::"text", 'confirmed_waiting_review'::"text", 'confirmed_waiting_payment'::"text", 'needs_customer_adjustment'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."zelomenu_cart_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_customer" "jsonb", "p_cart" "jsonb", "p_fulfillment" "jsonb", "p_pricing" "jsonb", "p_payment" "jsonb") RETURNS "public"."zelomenu_cart_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_row zelomenu_cart_sessions;
begin
  update zelomenu_cart_sessions
     set customer_snapshot=p_customer, cart_snapshot=p_cart,
         fulfillment_snapshot=p_fulfillment, pricing_snapshot=p_pricing,
         payment_snapshot=p_payment, revision=revision+1,
         last_revalidated_at=null, last_revalidation=null, updated_at=now()
   where id=p_session_id and revision=p_expected_revision and state='cart_open'
     and current_token_hash=p_token_hash
  returning * into v_row;
  if not found then raise exception using errcode='ZL409', message='REVISION_CONFLICT'; end if;
  return v_row;
end $$;


ALTER FUNCTION "public"."update_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_customer" "jsonb", "p_cart" "jsonb", "p_fulfillment" "jsonb", "p_pricing" "jsonb", "p_payment" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vendas_actor_can_delete"("p_venda_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.vendas v
    where v.id = p_venda_id
      and (
        public.fiado_actor_can('pdv.cancelar', v.id_usuario)
        or (
          v.id_operador = (select auth.uid())
          and v.created_at >= now() - interval '15 minutes'
          and not exists (
            select 1 from public.vendas_itens vi where vi.id_venda = v.id
          )
          and not exists (
            select 1 from public.vendas_pagamentos vp where vp.id_venda = v.id
          )
          and not exists (
            select 1 from public.vendas_taxas_plataforma vt where vt.id_venda = v.id
          )
        )
      )
  );
$$;


ALTER FUNCTION "public"."vendas_actor_can_delete"("p_venda_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vendas_discount_rbac_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_claim_role text := current_setting('request.jwt.claim.role', true);
  v_requires_discount_permission boolean;
begin
  if v_claim_role = 'service_role' then
    return new;
  end if;

  if coalesce(new.valor_desconto, 0) <= 0 then
    return new;
  end if;

  if v_actor is null then
    raise exception 'Usuario nao autenticado' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  -- SECURITY DEFINER POS/offline calls run as postgres and must always check
  -- pdv.desconto. Only the authenticated Mesa INSERT path gets the exception.
  v_requires_discount_permission :=
    current_user = 'postgres'
    or tg_op = 'UPDATE'
    or coalesce(new.tipo_pedido, 'retirada') <> 'mesa';

  if v_requires_discount_permission
     and not public.fiado_actor_can('pdv.desconto', v_owner) then
    raise exception 'Voce nao tem permissao para aplicar desconto.' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."vendas_discount_rbac_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vendas_insert_rbac_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_claim_role text := current_setting('request.jwt.claim.role', true);
begin
  -- service_role/maintenance paths retain their existing bypass.
  if v_claim_role = 'service_role' then
    return new;
  end if;

  if v_actor is null then
    raise exception 'Usuario nao autenticado' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  -- criar_venda_completa is SECURITY DEFINER and therefore reaches this
  -- trigger as its postgres function owner. A Mesa close uses direct browser
  -- inserts as authenticated and is authorized by mesas.fechar instead.
  if current_user = 'postgres' then
    if not (
      public.fiado_actor_can('pdv.vender', v_owner)
      and public.fiado_actor_can('pdv.receber', v_owner)
    ) then
      raise exception 'Voce nao tem permissao para registrar vendas no PDV.' using errcode = '42501';
    end if;
  elsif new.tipo_pedido = 'mesa' then
    if not public.fiado_actor_can('mesas.fechar', v_owner) then
      raise exception 'Voce nao tem permissao para fechar a mesa.' using errcode = '42501';
    end if;
  elsif not (
    public.fiado_actor_can('pdv.vender', v_owner)
    and public.fiado_actor_can('pdv.receber', v_owner)
  ) then
    raise exception 'Voce nao tem permissao para registrar vendas no PDV.' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."vendas_insert_rbac_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelo_order_has_permission"("p_empresa_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when auth.uid() is null then false
    when ep.user_id=auth.uid() then true
    else exists(
      select 1 from public.access_users au
      join public.access_roles ar on ar.id=au.role_id and ar.owner_user_id=au.owner_user_id
      where au.auth_user_id=auth.uid() and au.owner_user_id=ep.user_id and au.status='active'
        and coalesce((ar.permissions->>p_permission)::boolean,false)
    )
  end
  from public.empresa_perfil ep where ep.id=p_empresa_id
$$;


ALTER FUNCTION "public"."zelo_order_has_permission"("p_empresa_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelo_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "zelomenu_session_id" "uuid",
    "idempotency_key" "text",
    "legacy_zelochat_order_id" "uuid",
    "legacy_pedido_id" "uuid",
    "customer" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fulfillment" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payment" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "delivery_fee" numeric(14,2) DEFAULT 0 NOT NULL,
    "discount" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "observations" "text",
    "accepted_at" timestamp with time zone,
    "stock_committed_at" timestamp with time zone,
    "stock_released_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "sale_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelo_orders_delivery_fee_check" CHECK (("delivery_fee" >= (0)::numeric)),
    CONSTRAINT "zelo_orders_discount_check" CHECK (("discount" >= (0)::numeric)),
    CONSTRAINT "zelo_orders_observations_check" CHECK ((("observations" IS NULL) OR ("length"("observations") <= 500))),
    CONSTRAINT "zelo_orders_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "zelo_orders_source_check" CHECK (("source" = ANY (ARRAY['zelomenu'::"text", 'zelochat'::"text", 'manual'::"text", 'legacy_zelochat'::"text", 'legacy_pedido'::"text", 'mesa'::"text"]))),
    CONSTRAINT "zelo_orders_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'pending_review'::"text", 'accepted'::"text", 'preparing'::"text", 'ready'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'rejected'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "zelo_orders_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "zelo_orders_total_check" CHECK (("total" >= (0)::numeric)),
    CONSTRAINT "zelo_orders_total_consistent" CHECK (("total" = (("subtotal" + "delivery_fee") - "discount")))
);


ALTER TABLE "public"."zelo_orders" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelo_order_result"("p_order" "public"."zelo_orders") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
 select jsonb_build_object('orderId',p_order.id,'status',p_order.status,'revision',p_order.revision,
   'total',p_order.total,'saleId',p_order.sale_id)
$$;


ALTER FUNCTION "public"."zelo_order_result"("p_order" "public"."zelo_orders") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelo_order_sale_on_deliver"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.status = 'delivered'
     and old.status is distinct from 'delivered'
     and new.sale_id is null then
    new.sale_id := public.ensure_zelo_order_sale(new.id, new.closed_at);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."zelo_order_sale_on_deliver"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelochat_decrement_stock"("p_id_usuario" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE produtos
    SET estoque_atual = GREATEST(0, estoque_atual - (item->>'qty')::numeric)
    WHERE id_usuario        = p_id_usuario
      AND nome              ILIKE item->>'name'
      AND controlar_estoque = true;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."zelochat_decrement_stock"("p_id_usuario" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelochat_increment_ai_usage_daily"("p_empresa_id" "uuid", "p_usage_date" "date", "p_feature" "text", "p_model" "text", "p_status" "text" DEFAULT 'success'::"text", "p_prompt_tokens" bigint DEFAULT 0, "p_completion_tokens" bigint DEFAULT 0, "p_total_tokens" bigint DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_success integer := CASE WHEN p_status = 'success' THEN 1 ELSE 0 END;
  v_error integer := CASE WHEN p_status = 'error' THEN 1 ELSE 0 END;
  v_rate_limited integer := CASE WHEN p_status = 'rate_limited' THEN 1 ELSE 0 END;
BEGIN
  IF p_status NOT IN ('success', 'error', 'rate_limited') THEN
    RAISE EXCEPTION 'invalid ai usage status: %', p_status;
  END IF;

  INSERT INTO public.zelochat_ai_usage_daily (
    empresa_id,
    usage_date,
    feature,
    model,
    request_count,
    success_count,
    error_count,
    rate_limited_count,
    prompt_tokens,
    completion_tokens,
    total_tokens
  )
  VALUES (
    p_empresa_id,
    p_usage_date,
    p_feature,
    left(coalesce(nullif(p_model, ''), 'unknown'), 120),
    1,
    v_success,
    v_error,
    v_rate_limited,
    greatest(coalesce(p_prompt_tokens, 0), 0),
    greatest(coalesce(p_completion_tokens, 0), 0),
    greatest(coalesce(p_total_tokens, 0), 0)
  )
  ON CONFLICT (empresa_id, usage_date, feature, model)
  DO UPDATE SET
    request_count = public.zelochat_ai_usage_daily.request_count + 1,
    success_count = public.zelochat_ai_usage_daily.success_count + v_success,
    error_count = public.zelochat_ai_usage_daily.error_count + v_error,
    rate_limited_count = public.zelochat_ai_usage_daily.rate_limited_count + v_rate_limited,
    prompt_tokens = public.zelochat_ai_usage_daily.prompt_tokens + greatest(coalesce(p_prompt_tokens, 0), 0),
    completion_tokens = public.zelochat_ai_usage_daily.completion_tokens + greatest(coalesce(p_completion_tokens, 0), 0),
    total_tokens = public.zelochat_ai_usage_daily.total_tokens + greatest(coalesce(p_total_tokens, 0), 0),
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."zelochat_increment_ai_usage_daily"("p_empresa_id" "uuid", "p_usage_date" "date", "p_feature" "text", "p_model" "text", "p_status" "text", "p_prompt_tokens" bigint, "p_completion_tokens" bigint, "p_total_tokens" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelochat_increment_unread"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE public.zelochat_sessions
  SET unread_count = unread_count + 1,
      updated_at   = now()
  WHERE id = p_session_id;
$$;


ALTER FUNCTION "public"."zelochat_increment_unread"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."zelochat_orders_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."zelochat_orders_set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."access_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "operator_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."access_audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."access_audit_logs" IS 'Immutable audit trail of access-control actions (role changes, login attempts, permission overrides, etc.). Rows are never updated or deleted.';



CREATE TABLE IF NOT EXISTS "public"."access_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."access_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."access_roles" IS 'Named permission sets defined by an owner (PDV account). Sub-users are assigned one role that controls what they can do inside the app.';



CREATE TABLE IF NOT EXISTS "public"."access_settings" (
    "owner_user_id" "uuid" NOT NULL,
    "pin_enabled" boolean DEFAULT true NOT NULL,
    "max_subusers" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."access_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."access_settings" IS 'Per-owner configuration for the Controle de Acessos add-on, such as whether PIN login is required and the maximum number of sub-users allowed.';



CREATE TABLE IF NOT EXISTS "public"."access_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "auth_user_id" "uuid",
    "email" "text" NOT NULL,
    "role_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "access_users_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'blocked'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."access_users" OWNER TO "postgres";


COMMENT ON TABLE "public"."access_users" IS 'Sub-users invited by an owner. Tracks invitation status and the role assigned. auth_user_id is set once the sub-user authenticates for the first time.';



CREATE TABLE IF NOT EXISTS "public"."account_deletion_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_user_id" "uuid" NOT NULL,
    "empresa_id" "uuid",
    "email_masked" "text",
    "email_fingerprint" "text",
    "source" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_deletion_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "admin_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_user_id" "uuid",
    "target_email" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_company_metric_settings" (
    "user_id" "uuid" NOT NULL,
    "include_in_metrics" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."admin_company_metric_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_finance_fixed_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_finance_fixed_expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "admin_finance_fixed_expenses_label_check" CHECK (("char_length"(TRIM(BOTH FROM "label")) > 0))
);


ALTER TABLE "public"."admin_finance_fixed_expenses" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_finance_fixed_expenses" IS 'Shared fixed-expense items used by the internal admin financial dashboard.';



COMMENT ON COLUMN "public"."admin_finance_fixed_expenses"."amount" IS 'Recurring fixed amount for the expense item. Not tied to any specific month.';



CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_name" "text" NOT NULL,
    "status" "public"."agent_run_status" NOT NULL,
    "input_count" integer DEFAULT 0,
    "output_count" integer DEFAULT 0,
    "model" "text",
    "prompt_version" "text",
    "token_input" integer DEFAULT 0,
    "token_output" integer DEFAULT 0,
    "estimated_cost" numeric(10,6),
    "started_at" timestamp with time zone DEFAULT "now"(),
    "finished_at" timestamp with time zone,
    "error" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "chat_type" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "cost_usd" numeric(10,6),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_usage_logs_chat_type_check" CHECK (("chat_type" = ANY (ARRAY['support'::"text", 'assistant'::"text", 'intelligence'::"text"])))
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "proposed_payload" "jsonb" NOT NULL,
    "status" "public"."approval_status" DEFAULT 'pending'::"public"."approval_status",
    "approved_by" "text",
    "telegram_message_id" "text",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approval_type" "text",
    "requested_by" "text",
    "requested_action" "text",
    "decided_by" "text",
    "idempotency_key" "text",
    "action_payload" "jsonb"
);


ALTER TABLE "public"."approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "payment_id" "uuid",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "signature" "text",
    "error_message" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."billing_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_daily_snapshots" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "receita_bruta" numeric(12,2) DEFAULT 0 NOT NULL,
    "receita_realizada" numeric(12,2) DEFAULT 0 NOT NULL,
    "qtd_vendas" integer DEFAULT 0 NOT NULL,
    "ticket_medio" numeric(12,2),
    "fiado_saldo_total" numeric(12,2),
    "engine_version" "text" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."business_daily_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_daily_snapshots" IS 'Zelo Intelligence Engine — snapshot diário de métricas por empresa (America/Sao_Paulo).';



ALTER TABLE "public"."business_daily_snapshots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."business_daily_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."business_intelligence_runs" (
    "id" bigint NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "target_date" "date" NOT NULL,
    "companies_scanned" integer DEFAULT 0 NOT NULL,
    "companies_processed" integer DEFAULT 0 NOT NULL,
    "companies_skipped" integer DEFAULT 0 NOT NULL,
    "companies_failed" integer DEFAULT 0 NOT NULL,
    "signals_created" integer DEFAULT 0 NOT NULL,
    "signals_suppressed" integer DEFAULT 0 NOT NULL,
    "llm_calls" integer DEFAULT 0 NOT NULL,
    "llm_tokens_in" integer DEFAULT 0 NOT NULL,
    "llm_tokens_out" integer DEFAULT 0 NOT NULL,
    "llm_cost_usd" numeric(10,6) DEFAULT 0 NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "engine_version" "text" NOT NULL
);


ALTER TABLE "public"."business_intelligence_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_intelligence_runs" IS 'Zelo Intelligence Engine — registro de cada execução do cron diário.';



ALTER TABLE "public"."business_intelligence_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."business_intelligence_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."business_signals" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "signal_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "score" numeric(8,4) NOT NULL,
    "confidence" numeric(4,3) NOT NULL,
    "evidence" "jsonb" NOT NULL,
    "narrative" "text",
    "narrative_source" "text",
    "read_at" timestamp with time zone,
    "engine_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_signals_narrative_source_check" CHECK (("narrative_source" = ANY (ARRAY['llm'::"text", 'template'::"text"]))),
    CONSTRAINT "business_signals_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'attention'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."business_signals" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_signals" IS 'Zelo Intelligence Engine — sinais determinísticos detectados por empresa/dia.';



ALTER TABLE "public"."business_signals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."business_signals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."caixa_fechamentos" (
    "id" bigint NOT NULL,
    "id_caixa" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "data_fechamento" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_dinheiro" numeric DEFAULT 0 NOT NULL,
    "total_cartao" numeric DEFAULT 0 NOT NULL,
    "total_pix" numeric DEFAULT 0 NOT NULL,
    "total_geral" numeric DEFAULT 0 NOT NULL,
    "valor_inicial" numeric DEFAULT 0 NOT NULL,
    "valor_esperado_em_gaveta" numeric DEFAULT 0 NOT NULL,
    "valor_contado_em_gaveta" numeric DEFAULT 0 NOT NULL,
    "diferenca" numeric DEFAULT 0 NOT NULL,
    "quantidade_vendas" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_operador" "uuid"
);


ALTER TABLE "public"."caixa_fechamentos" OWNER TO "postgres";


ALTER TABLE "public"."caixa_fechamentos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."caixa_fechamentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."caixa_movimentacoes" (
    "id" bigint NOT NULL,
    "id_caixa" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "valor" numeric NOT NULL,
    "motivo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_operador" "uuid",
    CONSTRAINT "caixa_movimentacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['sangria'::"text", 'suprimento'::"text"]))),
    CONSTRAINT "caixa_movimentacoes_valor_check" CHECK (("valor" >= (0)::numeric))
);


ALTER TABLE "public"."caixa_movimentacoes" OWNER TO "postgres";


ALTER TABLE "public"."caixa_movimentacoes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."caixa_movimentacoes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."caixas" (
    "id" integer NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "data_abertura" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valor_inicial" numeric(10,2) NOT NULL,
    "data_fechamento" timestamp with time zone,
    "total_apurado_dinheiro" numeric(10,2),
    "total_apurado_cartao" numeric(10,2),
    "total_apurado_pix" numeric(10,2),
    "diferenca_fechamento" numeric(10,2),
    "valor_fechamento" numeric,
    "id_operador" "uuid"
);


ALTER TABLE "public"."caixas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."caixas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."caixas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."caixas_id_seq" OWNED BY "public"."caixas"."id";



CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" integer NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ordem" smallint DEFAULT 0,
    "controlar_estoque_compartilhado" boolean DEFAULT false NOT NULL,
    "estoque_compartilhado_atual" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "categorias_estoque_compartilhado_atual_nonnegative" CHECK (("estoque_compartilhado_atual" >= 0))
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorias_id_seq" OWNED BY "public"."categorias"."id";



CREATE TABLE IF NOT EXISTS "public"."comanda_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_comanda" "uuid" NOT NULL,
    "id_produto" integer,
    "quantidade" numeric(10,3) DEFAULT 1 NOT NULL,
    "preco_unitario" numeric(10,2) NOT NULL,
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estoque_baixado" boolean DEFAULT false NOT NULL,
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "nome_produto_na_venda" "text"
);


ALTER TABLE "public"."comanda_itens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."comanda_itens"."modifiers" IS 'Snapshot dos grupos/opções selecionados no momento em que a linha entrou na comanda.';



COMMENT ON COLUMN "public"."comanda_itens"."nome_produto_na_venda" IS 'Nome do produto no momento da inclusão; usado quando o catálogo muda depois.';



CREATE TABLE IF NOT EXISTS "public"."comanda_pagamento_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_pagamento" "uuid",
    "id_comanda" "uuid",
    "id_comanda_item" "uuid" NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_venda" bigint,
    "id_venda_pagamento" bigint,
    "id_venda_item" bigint,
    "quantidade" numeric(12,3) NOT NULL,
    "preco_unitario" numeric(12,2),
    "valor" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comanda_pagamento_itens_preco_unitario_check" CHECK ((("preco_unitario" IS NULL) OR ("preco_unitario" >= (0)::numeric))),
    CONSTRAINT "comanda_pagamento_itens_quantidade_check" CHECK (("quantidade" > (0)::numeric)),
    CONSTRAINT "comanda_pagamento_itens_valor_check" CHECK (("valor" >= (0)::numeric))
);


ALTER TABLE "public"."comanda_pagamento_itens" OWNER TO "postgres";


COMMENT ON TABLE "public"."comanda_pagamento_itens" IS 'Atribuição auditável de quantidade de item a pagamento parcial de Mesa.';



COMMENT ON COLUMN "public"."comanda_pagamento_itens"."id_pagamento" IS 'Origem enquanto comanda_pagamentos existe; fica NULL após o cleanup.';



COMMENT ON COLUMN "public"."comanda_pagamento_itens"."id_venda" IS 'Venda gerada no fechamento da mesa.';



COMMENT ON COLUMN "public"."comanda_pagamento_itens"."id_venda_pagamento" IS 'Linha de vendas_pagamentos correspondente ao parcial.';



COMMENT ON COLUMN "public"."comanda_pagamento_itens"."id_venda_item" IS 'Linha de vendas_itens correspondente ao item da comanda.';



CREATE TABLE IF NOT EXISTS "public"."comanda_pagamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_comanda" "uuid" NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "forma_pagamento" "text" NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "id_pessoa" "uuid",
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comanda_pagamentos_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."comanda_pagamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."comanda_pagamentos" IS 'Pagamentos parciais registrados antes do fechamento da mesa (rachar a conta).';



CREATE TABLE IF NOT EXISTS "public"."comandas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_mesa" "uuid" NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "num_pessoas" integer DEFAULT 1,
    "observacao" "text",
    "status" "text" DEFAULT 'aberta'::"text" NOT NULL,
    "taxa_servico_pct" numeric(5,2) DEFAULT 0,
    "couvert_valor" numeric(10,2) DEFAULT 0,
    "desconto" numeric(10,2) DEFAULT 0,
    "total_calculado" numeric(10,2) DEFAULT 0,
    "aberta_em" timestamp with time zone DEFAULT "now"(),
    "fechada_em" timestamp with time zone,
    "id_venda" bigint,
    "id_operador" "uuid",
    CONSTRAINT "comandas_status_check" CHECK (("status" = ANY (ARRAY['aberta'::"text", 'fechada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."comandas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "target_filter" "jsonb" DEFAULT '{}'::"jsonb",
    "sent_count" integer DEFAULT 0,
    "created_by" "uuid",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'draft'::"text",
    CONSTRAINT "email_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_onboarding_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_day" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_email" "text" NOT NULL
);


ALTER TABLE "public"."email_onboarding_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresa_perfil" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nome_exibicao" "text" NOT NULL,
    "documento" "text",
    "inscricao_estadual" "text",
    "endereco" "text",
    "contato" "text",
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text",
    "logo_url" "text",
    "rodape_recibo" "text" DEFAULT 'Obrigado pela preferência!'::"text",
    "largura_bobina" "text" DEFAULT '80mm'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "modulo_pdv_ativo" boolean DEFAULT true NOT NULL,
    "modulo_delivery_ativo" boolean DEFAULT false NOT NULL,
    "pin_admin" "text",
    "razao_social" "text",
    "plataformas_pagamento" "jsonb" DEFAULT '[]'::"jsonb",
    "last_seen_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    "chave_pix" "text",
    "manager_phone" "text",
    "horario_abertura" "text",
    "horario_fechamento" "text",
    "dias_fechamento" "text"[] DEFAULT '{}'::"text"[],
    "ai_instructions" "text",
    "blocked_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "manager_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tipo_negocio" "text",
    "zelochat_onboarding_done" boolean DEFAULT false NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "webhook_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ai_can_reengage_pending" boolean DEFAULT false NOT NULL,
    "zelochat_disabled_builtin_triggers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "delivery_config" "jsonb",
    "whatsmiau_instance" "text",
    "whatsmiau_connected" boolean DEFAULT false NOT NULL,
    "whatsmiau_phone" "text",
    "notify_customer_preparing" boolean DEFAULT true NOT NULL,
    "notify_customer_ready" boolean DEFAULT true NOT NULL,
    "notify_customer_out_for_delivery" boolean DEFAULT true NOT NULL,
    "pix_receipt_config" "jsonb",
    "ai_mode" "text" DEFAULT 'always_on'::"text" NOT NULL,
    "ai_schedule_start" "text",
    "ai_schedule_end" "text",
    "zelochat_mode" "text" DEFAULT 'restaurant'::"text" NOT NULL,
    "zelochat_internal_send_key_hash" "text",
    "zelochat_onboarding_done_at" timestamp with time zone,
    "tabelas_preco_ativo" boolean DEFAULT false NOT NULL,
    "tabela_preco_1_nome" "text" DEFAULT 'Tabela 1'::"text" NOT NULL,
    "tabela_preco_2_nome" "text" DEFAULT 'Tabela 2'::"text" NOT NULL,
    "tabela_preco_3_nome" "text" DEFAULT 'Tabela 3'::"text" NOT NULL,
    "referral_code" "text",
    "deletion_scheduled_at" timestamp with time zone,
    "deletion_requested_at" timestamp with time zone,
    "deletion_source" "text",
    "ai_schedule_days" "jsonb",
    "zelomenu_slug" "text",
    "zelomenu_welcome_text" "text",
    "zelomenu_featured_enabled" boolean DEFAULT false NOT NULL,
    "zelomenu_featured_product_ids" "jsonb",
    "zelomenu_category_order" "jsonb",
    "intelligence_enabled_at" timestamp with time zone,
    "gerente_prefs" "jsonb" DEFAULT '{"whatsapp": {"hora": "07", "enabled": false}, "muted_types": []}'::"jsonb" NOT NULL,
    "gerente_whatsapp_last_sent_date" "date",
    "horario_semanal" "jsonb",
    "zelomenu_recommendations_enabled" boolean DEFAULT false NOT NULL,
    "zelomenu_recommendation_product_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "zelomenu_category_suggestions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "zelomenu_pix_key_type" "text",
    "zelomenu_auto_accept_orders" boolean DEFAULT false NOT NULL,
    "delivery_postal_code" "text",
    "delivery_number" "text",
    "delivery_complement" "text",
    "delivery_street" "text",
    "delivery_neighborhood" "text",
    "delivery_city" "text",
    "delivery_state" "text",
    "delivery_latitude" double precision,
    "delivery_longitude" double precision,
    "delivery_location_version" bigint DEFAULT 0 NOT NULL,
    "zelomenu_cover_url" "text",
    "zelomenu_description" "text",
    "zelomenu_sponsored_enabled" boolean DEFAULT false NOT NULL,
    "origem_aquisicao" "jsonb",
    "zelomenu_scheduling_enabled" boolean DEFAULT true NOT NULL,
    "zelomenu_scheduling_lead_time_minutes" integer DEFAULT 60 NOT NULL,
    CONSTRAINT "empresa_perfil_gerente_prefs_object_check" CHECK (("jsonb_typeof"("gerente_prefs") = 'object'::"text")),
    CONSTRAINT "empresa_perfil_zelochat_mode_check" CHECK (("zelochat_mode" = ANY (ARRAY['restaurant'::"text", 'general'::"text"]))),
    CONSTRAINT "zelomenu_scheduling_lead_time_check" CHECK (("zelomenu_scheduling_lead_time_minutes" >= 0))
);


ALTER TABLE "public"."empresa_perfil" OWNER TO "postgres";


COMMENT ON COLUMN "public"."empresa_perfil"."modulo_pdv_ativo" IS 'Acesso ao módulo PDV (Frente de Caixa) - default true para usuários existentes';



COMMENT ON COLUMN "public"."empresa_perfil"."modulo_delivery_ativo" IS 'Acesso ao módulo Delivery (Loja Online) - default false, ativar manualmente';



COMMENT ON COLUMN "public"."empresa_perfil"."pin_admin" IS 'PIN for accessing administrative areas (Reports, Expenses, Settings)';



COMMENT ON COLUMN "public"."empresa_perfil"."plataformas_pagamento" IS 'Plataformas de pagamento configuradas pelo lojista. Array de objetos {id, nome, taxa_pct, ativo}';



COMMENT ON COLUMN "public"."empresa_perfil"."chave_pix" IS 'Chave PIX da empresa (CPF, CNPJ, e-mail, telefone ou chave aleatória). Usada pelo ZeloChat para informar clientes no checkout.';



COMMENT ON COLUMN "public"."empresa_perfil"."whatsmiau_instance" IS 'Nome da instância Whatsmiau dedicada a esta empresa. NULL = empresa ainda não conectou WhatsApp.';



COMMENT ON COLUMN "public"."empresa_perfil"."whatsmiau_connected" IS 'Estado da conexão WhatsApp da empresa. Atualizado pelo webhook CONNECTION_UPDATE.';



COMMENT ON COLUMN "public"."empresa_perfil"."whatsmiau_phone" IS 'Telefone (E.164) da linha WhatsApp vinculada a esta instância.';



COMMENT ON COLUMN "public"."empresa_perfil"."pix_receipt_config" IS 'ZeloChat-owned configuration for requiring Pix receipt image/PDF validation before confirming Pix orders.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelochat_mode" IS 'ZeloChat UI/AI mode. restaurant is the public default; general is opt-in for internal/support-style companies.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelochat_internal_send_key_hash" IS 'SHA-256 hex hash for Techne server-to-server WhatsApp send API key.';



COMMENT ON COLUMN "public"."empresa_perfil"."referral_code" IS 'Stable public referral code for Cliente indica Cliente links.';



COMMENT ON COLUMN "public"."empresa_perfil"."deletion_scheduled_at" IS 'When set & in the future: account is pending self-service deletion and is purged after this time. Cleared on reactivation.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_slug" IS 'Public ZeloMenu store slug for menu.zelopdv.com.br/{slug}. Unique when non-null; NULL means no public link yet.';



COMMENT ON COLUMN "public"."empresa_perfil"."gerente_prefs" IS 'Zelinho Gerente: opt-in WhatsApp, hora BRT (HH) e tipos de sinais silenciados na apresentacao.';



COMMENT ON COLUMN "public"."empresa_perfil"."gerente_whatsapp_last_sent_date" IS 'Data America/Sao_Paulo do último digest WhatsApp confirmado; garante idempotência diária.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_recommendations_enabled" IS 'ZeloMenu: liga o carrossel "Peça também" no checkout público.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_recommendation_product_ids" IS 'ZeloMenu: IDs de produtos curados sugeridos no checkout. Curadoria manual global.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_category_suggestions" IS 'Record<nome_da_categoria, number[]> - ate 3 ids de produto sugeridos por categoria, mostrados no card de produto (ProductAddModal). Chaveado por nome de categoria, mesmo padrão de zelomenu_category_order.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_pix_key_type" IS 'ZeloMenu: tipo declarado da chave Pix em chave_pix (cpf|cnpj|phone|email|random). Usado para montar o BR Code do Pix Copia e Cola do pedido.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_auto_accept_orders" IS 'ZeloMenu: aceita automaticamente pedidos online públicos após validação do checkout; Pix pendente continua aguardando pagamento.';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_postal_code" IS 'ZeloMenu: CEP do endereço de retirada/entrega da loja';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_number" IS 'ZeloMenu: número do endereço da loja';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_complement" IS 'ZeloMenu: complemento opcional';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_street" IS 'ZeloMenu: logradouro (preenchido via CEP)';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_neighborhood" IS 'ZeloMenu: bairro (preenchido via CEP, apenas informativo)';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_city" IS 'ZeloMenu: cidade (preenchido via CEP)';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_state" IS 'ZeloMenu: estado/UF (preenchido via CEP)';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_latitude" IS 'ZeloMenu: latitude geocodificada da loja';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_longitude" IS 'ZeloMenu: longitude geocodificada da loja';



COMMENT ON COLUMN "public"."empresa_perfil"."delivery_location_version" IS 'ZeloMenu: incrementado quando as coordenadas da loja mudam, para invalidar caches de rota';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_cover_url" IS 'ZeloMenu: imagem de capa usada no card público da empresa.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_description" IS 'ZeloMenu: descrição curta definida pela loja e exibida no card público da empresa.';



COMMENT ON COLUMN "public"."empresa_perfil"."zelomenu_sponsored_enabled" IS 'ZeloMenu: empresa patrocinada; aparece primeiro na descoberta quando habilitada.';



COMMENT ON COLUMN "public"."empresa_perfil"."origem_aquisicao" IS 'Atribuição first-touch da conta: utm_source/medium/campaign/content/term, gclid, fbclid, ttclid, msclkid, origem, referrer (host+caminho), landing (caminho) e captured_at. Gravada no fim do onboarding a partir do localStorage do navegador. Null = perfil anterior a 2026-07-27 ou navegador sem storage.';



CREATE TABLE IF NOT EXISTS "public"."empresa_usuarios" (
    "id_empresa" integer NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "empresa_usuarios_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'atendente'::"text"])))
);


ALTER TABLE "public"."empresa_usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresas" (
    "id" integer NOT NULL,
    "id_owner" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "cnpj" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."empresas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."empresas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."empresas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."empresas_id_seq" OWNED BY "public"."empresas"."id";



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "category" "text",
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_operador" "uuid"
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiado_lancamentos" (
    "id" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_pessoa" "uuid" NOT NULL,
    "id_venda" bigint,
    "id_caixa" integer,
    "id_operador" "uuid",
    "natureza" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "descricao" "text" DEFAULT ''::"text" NOT NULL,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_caixa_movimentacao" integer,
    CONSTRAINT "fiado_lancamentos_natureza_check" CHECK (("natureza" = ANY (ARRAY['saldo_inicial'::"text", 'debito_venda'::"text", 'pagamento'::"text", 'estorno_venda'::"text"]))),
    CONSTRAINT "fiado_lancamentos_valor_check" CHECK (("valor" <> (0)::numeric))
);


ALTER TABLE "public"."fiado_lancamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."fiado_lancamentos" IS 'Razao do fiado. Valor positivo e debito; negativo e pagamento, credito ou estorno. Recebimentos podem ser excluidos por RPC autorizada para corrigir erros de lancamento.';



ALTER TABLE "public"."fiado_lancamentos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."fiado_lancamentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lead_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "channel" "text",
    "actor" "text",
    "payload" "jsonb",
    "outcome" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."lead_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" "text" NOT NULL,
    "segment" "text",
    "city" "text",
    "state" "text" DEFAULT 'SP'::"text",
    "country" "text" DEFAULT 'BR'::"text",
    "phone" "text",
    "normalized_phone" "text",
    "whatsapp" "text",
    "email" "text",
    "instagram" "text",
    "website" "text",
    "google_maps_url" "text",
    "source" "text",
    "source_ref" "text",
    "raw_data" "jsonb",
    "dedupe_key" "text" NOT NULL,
    "score" integer,
    "score_reason" "text",
    "fit_status" "public"."fit_status",
    "product_fit" "public"."product_fit",
    "pain_hypothesis" "text"[],
    "recommended_action" "text",
    "status" "public"."lead_status" DEFAULT 'new'::"public"."lead_status",
    "opt_in_whatsapp" boolean DEFAULT false,
    "whatsapp_window_until" timestamp with time zone,
    "consent_source" "text",
    "last_contacted_at" timestamp with time zone,
    "next_followup_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fit_score" integer,
    "address" "text",
    "external_id" "text",
    "first_contacted_at" timestamp with time zone,
    "last_replied_at" timestamp with time zone,
    "opted_out" boolean DEFAULT false NOT NULL,
    CONSTRAINT "leads_fit_score_check" CHECK ((("fit_score" >= 0) AND ("fit_score" <= 100))),
    CONSTRAINT "leads_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mesas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "numero" "text" NOT NULL,
    "capacidade" integer,
    "status" "text" DEFAULT 'livre'::"text" NOT NULL,
    "ativa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mesas_status_check" CHECK (("status" = ANY (ARRAY['livre'::"text", 'ocupada'::"text", 'fechando'::"text"])))
);


ALTER TABLE "public"."mesas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_communication_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "message_day" integer NOT NULL,
    "status" "text" NOT NULL,
    "recipient" "text",
    "provider" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_communication_events_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "onboarding_communication_events_status_check" CHECK (("status" = ANY (ARRAY['attempted'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."onboarding_communication_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."onboarding_communication_events" IS 'Internal audit log for onboarding email and WhatsApp attempted/sent/failed/skipped events.';



CREATE TABLE IF NOT EXISTS "public"."outreach_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "direction" "public"."message_direction" DEFAULT 'outbound'::"public"."message_direction",
    "subject" "text",
    "body" "text" NOT NULL,
    "status" "public"."outreach_status" DEFAULT 'draft'::"public"."outreach_status",
    "provider" "text",
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "external_id" "text",
    "error_message" "text"
);


ALTER TABLE "public"."outreach_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pessoas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" DEFAULT 'cliente'::"text" NOT NULL,
    "contato" "text",
    "saldo_fiado" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pessoas_tipo_check" CHECK (("tipo" = ANY (ARRAY['cliente'::"text", 'funcionario'::"text"])))
);


ALTER TABLE "public"."pessoas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_usage_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" NOT NULL,
    "feature" "text" NOT NULL,
    "first_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_usage_events_feature_check" CHECK (("feature" = ANY (ARRAY['pdv'::"text", 'gerente'::"text", 'relatorios'::"text", 'zelinho'::"text", 'produtos'::"text", 'estoque'::"text", 'clientes'::"text", 'caixa'::"text", 'despesas'::"text", 'mesas'::"text", 'pedidos'::"text", 'acessos'::"text", 'ferramentas'::"text"])))
);


ALTER TABLE "public"."product_usage_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_usage_events" IS 'Telemetria operacional mínima: presença diária por módulo, sem rastrear cliques ou conteúdo.';



ALTER TABLE "public"."product_usage_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."product_usage_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" integer NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_categoria" integer,
    "nome" "text" NOT NULL,
    "preco" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "controlar_estoque" boolean DEFAULT false,
    "estoque_atual" integer DEFAULT 0,
    "eh_item_por_unidade" boolean DEFAULT false,
    "ocultar_no_pdv" boolean DEFAULT false NOT NULL,
    "id_subcategoria" bigint,
    "preco_2" numeric(12,2),
    "preco_3" numeric(12,2)
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."produtos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."produtos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."produtos_id_seq" OWNED BY "public"."produtos"."id";



CREATE TABLE IF NOT EXISTS "public"."referral_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "reward_type" "text" DEFAULT 'credit'::"text" NOT NULL,
    "amount_cents" integer,
    "addon_key" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "applied_at" timestamp with time zone,
    "applied_by" "uuid",
    CONSTRAINT "referral_rewards_credit_amount_check" CHECK (((("reward_type" = 'credit'::"text") AND ("amount_cents" IS NOT NULL) AND ("amount_cents" > 0)) OR (("reward_type" = 'addon_days'::"text") AND ("addon_key" IS NOT NULL)))),
    CONSTRAINT "referral_rewards_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['credit'::"text", 'addon_days'::"text"]))),
    CONSTRAINT "referral_rewards_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'applied'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."referral_rewards" OWNER TO "postgres";


COMMENT ON TABLE "public"."referral_rewards" IS 'Internal credits/add-on rewards. Financial payout is intentionally not supported.';



CREATE TABLE IF NOT EXISTS "public"."referral_trigger_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "trigger_key" "text" NOT NULL,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "referral_trigger_events_trigger_key_check" CHECK (("trigger_key" = ANY (ARRAY['first_cash_closing'::"text", 'thirty_sales'::"text", 'seven_days_used'::"text", 'zelochat_used'::"text"])))
);


ALTER TABLE "public"."referral_trigger_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."referral_trigger_events" IS 'Lightweight infrastructure for future referral nudges; no invasive popups in MVP.';



CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_empresa_id" "uuid" NOT NULL,
    "referred_empresa_id" "uuid",
    "referred_email" "text",
    "referred_phone" "text",
    "referred_documento" "text",
    "referral_code" "text" NOT NULL,
    "status" "text" DEFAULT 'clicked'::"text" NOT NULL,
    "source" "text",
    "rejection_reason" "text",
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "confirmed_by" "uuid",
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['clicked'::"text", 'signed_up'::"text", 'trial_started'::"text", 'pending_payment'::"text", 'paid_manual_confirmed'::"text", 'reward_approved'::"text", 'reward_applied'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


COMMENT ON TABLE "public"."referrals" IS 'Tracks referral clicks, signups, trial starts and manual payment confirmation.';



CREATE TABLE IF NOT EXISTS "public"."registration_nudges" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registration_nudges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subcategorias" (
    "id" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_categoria" bigint NOT NULL,
    "nome" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subcategorias" OWNER TO "postgres";


ALTER TABLE "public"."subcategorias" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."subcategorias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."subscription_cron_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"(),
    "deactivated_count" integer,
    "deactivated_users" "jsonb",
    "error" "text"
);


ALTER TABLE "public"."subscription_cron_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."super_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "permissions" "jsonb" DEFAULT '["view_dashboard"]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_login" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    CONSTRAINT "super_admins_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'support_admin'::"text", 'billing_admin'::"text"])))
);


ALTER TABLE "public"."super_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppression_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "normalized_phone" "text",
    "email" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lead_id" "uuid",
    "phone" "text",
    "added_by" "text",
    CONSTRAINT "suppression_has_contact" CHECK ((("normalized_phone" IS NOT NULL) OR ("email" IS NOT NULL)))
);


ALTER TABLE "public"."suppression_list" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_entitlements" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    "plan_tier",
    "status",
    "current_period_end",
    "manually_extended_until",
    "payment_provider",
    "public"."is_subscription_active"("user_id", 'pdv'::"text") AS "pdv_active",
    "public"."is_subscription_active"("user_id", 'chat'::"text") AS "chat_active",
    "public"."subscription_effective_expiry"("s".*) AS "effective_expiry",
    "has_mesas_addon",
    "has_acessos_addon",
    "has_zelo_menu"
   FROM "public"."subscriptions" "s"
  WHERE ("status" <> ALL (ARRAY['canceled'::"text", 'incomplete'::"text"]));


ALTER VIEW "public"."user_entitlements" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_daily_metrics" AS
 SELECT "count"(*) FILTER (WHERE ("created_at" >= CURRENT_DATE)) AS "leads_collected_today",
    "count"(*) FILTER (WHERE (("fit_status" = 'qualified'::"public"."fit_status") AND ("created_at" >= CURRENT_DATE))) AS "leads_qualified_today",
    "count"(*) FILTER (WHERE (("status" = 'approved'::"public"."lead_status") AND ("updated_at" >= CURRENT_DATE))) AS "leads_approved_today",
    "count"(*) FILTER (WHERE (("status" = 'contacted'::"public"."lead_status") AND ("last_contacted_at" >= CURRENT_DATE))) AS "leads_contacted_today",
    "count"(*) FILTER (WHERE (("status" = 'interested'::"public"."lead_status") AND ("updated_at" >= CURRENT_DATE))) AS "leads_interested_today",
    "count"(*) FILTER (WHERE (("status" = 'won'::"public"."lead_status") AND ("updated_at" >= CURRENT_DATE))) AS "leads_won_today",
    "count"(*) FILTER (WHERE (("next_followup_at" >= "now"()) AND ("next_followup_at" <= ("now"() + '24:00:00'::interval)))) AS "followups_due_tomorrow",
    "avg"("score") FILTER (WHERE ("created_at" >= CURRENT_DATE)) AS "avg_score_today"
   FROM "public"."leads";


ALTER VIEW "public"."v_daily_metrics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_leads_pending_followup" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "business_name",
    NULL::"text" AS "segment",
    NULL::"text" AS "city",
    NULL::"text" AS "state",
    NULL::"text" AS "country",
    NULL::"text" AS "phone",
    NULL::"text" AS "normalized_phone",
    NULL::"text" AS "whatsapp",
    NULL::"text" AS "email",
    NULL::"text" AS "instagram",
    NULL::"text" AS "website",
    NULL::"text" AS "google_maps_url",
    NULL::"text" AS "source",
    NULL::"text" AS "source_ref",
    NULL::"jsonb" AS "raw_data",
    NULL::"text" AS "dedupe_key",
    NULL::integer AS "score",
    NULL::"text" AS "score_reason",
    NULL::"public"."fit_status" AS "fit_status",
    NULL::"public"."product_fit" AS "product_fit",
    NULL::"text"[] AS "pain_hypothesis",
    NULL::"text" AS "recommended_action",
    NULL::"public"."lead_status" AS "status",
    NULL::boolean AS "opt_in_whatsapp",
    NULL::timestamp with time zone AS "whatsapp_window_until",
    NULL::"text" AS "consent_source",
    NULL::timestamp with time zone AS "last_contacted_at",
    NULL::timestamp with time zone AS "next_followup_at",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "event_count";


ALTER VIEW "public"."v_leads_pending_followup" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_top_leads_pending" AS
 SELECT "id",
    "business_name",
    "segment",
    "city",
    "state",
    "country",
    "phone",
    "normalized_phone",
    "whatsapp",
    "email",
    "instagram",
    "website",
    "google_maps_url",
    "source",
    "source_ref",
    "raw_data",
    "dedupe_key",
    "score",
    "score_reason",
    "fit_status",
    "product_fit",
    "pain_hypothesis",
    "recommended_action",
    "status",
    "opt_in_whatsapp",
    "whatsapp_window_until",
    "consent_source",
    "last_contacted_at",
    "next_followup_at",
    "created_at",
    "updated_at"
   FROM "public"."leads"
  WHERE (("fit_status" = 'qualified'::"public"."fit_status") AND ("status" = ANY (ARRAY['new'::"public"."lead_status", 'qualified'::"public"."lead_status", 'approved'::"public"."lead_status"])) AND ("status" <> ALL (ARRAY['blocked'::"public"."lead_status", 'ignored'::"public"."lead_status"])))
  ORDER BY "score" DESC
 LIMIT 20;


ALTER VIEW "public"."v_top_leads_pending" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendas" (
    "id" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_caixa" integer,
    "data_hora" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valor_total" numeric(10,2) NOT NULL,
    "forma_pagamento" "text" NOT NULL,
    "valor_recebido" numeric(10,2),
    "valor_troco" numeric(10,2),
    "id_pessoa" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_cliente" "uuid",
    "valor_desconto" numeric DEFAULT 0,
    "desconto_tipo" character varying(20) DEFAULT NULL::character varying,
    "numero_venda" integer NOT NULL,
    "tipo_pedido" "text" DEFAULT 'retirada'::"text",
    "taxa_entrega" numeric(10,2) DEFAULT 0 NOT NULL,
    "client_sale_id" "text",
    "id_operador" "uuid"
);


ALTER TABLE "public"."vendas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vendas"."client_sale_id" IS 'Client-generated sale idempotency key. Used to safely replay offline sales.';



CREATE SEQUENCE IF NOT EXISTS "public"."vendas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendas_id_seq" OWNED BY "public"."vendas"."id";



CREATE TABLE IF NOT EXISTS "public"."vendas_itens" (
    "id" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_venda" bigint NOT NULL,
    "id_produto" integer,
    "quantidade" integer NOT NULL,
    "nome_produto_na_venda" "text" NOT NULL,
    "preco_unitario_na_venda" numeric(10,2) NOT NULL,
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "id_comanda_item" "uuid"
);


ALTER TABLE "public"."vendas_itens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vendas_itens"."modifiers" IS 'Snapshot estruturado dos grupos/opções selecionados na venda.';



CREATE SEQUENCE IF NOT EXISTS "public"."vendas_itens_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendas_itens_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendas_itens_id_seq" OWNED BY "public"."vendas_itens"."id";



CREATE TABLE IF NOT EXISTS "public"."vendas_pagamentos" (
    "id" bigint NOT NULL,
    "id_venda" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "forma_pagamento" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_comanda_pagamento" "uuid",
    CONSTRAINT "vendas_pagamentos_forma_pagamento_check" CHECK (("length"(TRIM(BOTH FROM "forma_pagamento")) > 0)),
    CONSTRAINT "vendas_pagamentos_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."vendas_pagamentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."vendas_pagamentos" IS 'Partições de pagamento por venda (split tender).';



COMMENT ON COLUMN "public"."vendas_pagamentos"."forma_pagamento" IS 'Ex.: dinheiro, pix, cartao_credito, cartao_debito, fiado, outro';



CREATE SEQUENCE IF NOT EXISTS "public"."vendas_pagamentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendas_pagamentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendas_pagamentos_id_seq" OWNED BY "public"."vendas_pagamentos"."id";



CREATE TABLE IF NOT EXISTS "public"."vendas_taxas_plataforma" (
    "id" bigint NOT NULL,
    "id_venda" bigint NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "plataforma_id" "text" NOT NULL,
    "plataforma_nome" "text" NOT NULL,
    "taxa_pct" numeric NOT NULL,
    "valor_bruto" numeric NOT NULL,
    "valor_taxa" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vendas_taxas_plataforma" OWNER TO "postgres";


COMMENT ON TABLE "public"."vendas_taxas_plataforma" IS 'Snapshot per-sale of platform fees (iFood, Rappi, etc.). One row per platform line. Used in /relatorios to compute Lucro Liquido after platform costs. taxa_pct is snapshotted so historical reports remain stable when user changes platform config.';



ALTER TABLE "public"."vendas_taxas_plataforma" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vendas_taxas_plataforma_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."webhook_events_processed" (
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_events_processed" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_events_processed" IS 'Idempotência de webhooks. Antes de processar um evento, INSERT ON CONFLICT DO NOTHING — se zero linhas, já foi processado.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_onboarding_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_day" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_phone" "text" NOT NULL
);


ALTER TABLE "public"."whatsapp_onboarding_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelo_order_events" (
    "id" bigint NOT NULL,
    "order_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "actor_id" "uuid",
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zelo_order_events" OWNER TO "postgres";


ALTER TABLE "public"."zelo_order_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."zelo_order_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."zelo_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" bigint,
    "name" "text" NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "quantity" integer NOT NULL,
    "subtotal" numeric(14,2) NOT NULL,
    "modifiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelo_order_items_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "zelo_order_items_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 999))),
    CONSTRAINT "zelo_order_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "zelo_order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."zelo_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelo_order_outbox" (
    "id" bigint NOT NULL,
    "order_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelo_order_outbox_attempts_check" CHECK (("attempts" >= 0))
);


ALTER TABLE "public"."zelo_order_outbox" OWNER TO "postgres";


ALTER TABLE "public"."zelo_order_outbox" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."zelo_order_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."zelochat_ai_usage_daily" (
    "empresa_id" "uuid" NOT NULL,
    "usage_date" "date" NOT NULL,
    "feature" "text" NOT NULL,
    "model" "text" NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "rate_limited_count" integer DEFAULT 0 NOT NULL,
    "prompt_tokens" bigint DEFAULT 0 NOT NULL,
    "completion_tokens" bigint DEFAULT 0 NOT NULL,
    "total_tokens" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelochat_ai_usage_daily_completion_tokens_check" CHECK (("completion_tokens" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_error_count_check" CHECK (("error_count" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_feature_check" CHECK (("feature" = ANY (ARRAY['ai_auto_reply'::"text", 'ai_auto_followup'::"text", 'ai_manual_reply'::"text", 'ai_generate_instructions'::"text", 'ai_manager'::"text", 'ai_simulator'::"text", 'ai_trigger_parse'::"text", 'ai_transcription'::"text", 'pix_receipt_validation'::"text"]))),
    CONSTRAINT "zelochat_ai_usage_daily_prompt_tokens_check" CHECK (("prompt_tokens" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_rate_limited_count_check" CHECK (("rate_limited_count" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_request_count_check" CHECK (("request_count" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_success_count_check" CHECK (("success_count" >= 0)),
    CONSTRAINT "zelochat_ai_usage_daily_total_tokens_check" CHECK (("total_tokens" >= 0))
);


ALTER TABLE "public"."zelochat_ai_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_billing_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'abacatepay'::"text" NOT NULL,
    "provider_payment_id" "text" NOT NULL,
    "plan_tier" "text" NOT NULL,
    "amount_brl" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "pix_copy_paste" "text",
    "pix_qr_code" "text",
    "expires_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelochat_billing_payments_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['chat'::"text", 'bundle'::"text"]))),
    CONSTRAINT "zelochat_billing_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."zelochat_billing_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_billing_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'abacatepay'::"text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zelochat_billing_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "zelochat_drivers_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'busy'::"text", 'offline'::"text"])))
);


ALTER TABLE "public"."zelochat_drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_email_onboarding_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_day" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_email" "text"
);


ALTER TABLE "public"."zelochat_email_onboarding_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_escalation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "trigger_id" "uuid",
    "trigger_kind" "text" NOT NULL,
    "trigger_name" "text" NOT NULL,
    "reason_category" "text" NOT NULL,
    "reason_text" "text" NOT NULL,
    "customer_message_excerpt" "text",
    "triggered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelochat_escalation_events_reason_category_check" CHECK (("reason_category" = ANY (ARRAY['frustration'::"text", 'complaint'::"text", 'explicit_human_request'::"text", 'repeated_ai_failure'::"text", 'offensive_language'::"text", 'manual'::"text", 'custom'::"text"]))),
    CONSTRAINT "zelochat_escalation_events_trigger_kind_check" CHECK (("trigger_kind" = ANY (ARRAY['escalate_human'::"text", 'notify_manager'::"text"])))
);


ALTER TABLE "public"."zelochat_escalation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tool_calls" "jsonb",
    "tool_call_id" "text",
    "audio_transcript" "text",
    "audio_transcript_status" "text",
    "wa_message_id" "text",
    "reactions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "quoted_wa_id" "text",
    "quoted_from_me" boolean,
    "quoted_preview" "text",
    "outbound_status" "text",
    "outbound_error" "text",
    "audio_transcript_error" "text",
    CONSTRAINT "zelochat_messages_audio_transcript_status_check" CHECK (("audio_transcript_status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'failed'::"text"]))),
    CONSTRAINT "zelochat_messages_outbound_status_check" CHECK ((("outbound_status" IS NULL) OR ("outbound_status" = ANY (ARRAY['queued'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))),
    CONSTRAINT "zelochat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'tool'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."zelochat_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."zelochat_messages"."wa_message_id" IS 'WhatsApp message ID from Whatsmiau (data.key.id). Used for inbound webhook idempotency. NULL on historical rows captured before idempotency rollout.';



CREATE TABLE IF NOT EXISTS "public"."zelochat_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pickup_date" "text" NOT NULL,
    "pickup_time" "text" NOT NULL,
    "delivery_address" "text",
    "driver_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text",
    "delivery_fee" numeric(10,2),
    "delivery_neighborhood" "text",
    "observations" "text",
    "pix_receipt_message_id" "text",
    "pix_receipt_analysis" "jsonb",
    "zelomenu_session_id" "uuid",
    CONSTRAINT "zelochat_orders_observations_length_chk" CHECK ((("observations" IS NULL) OR ("length"("observations") <= 500))),
    CONSTRAINT "zelochat_orders_source_check" CHECK (("source" = ANY (ARRAY['whatsapp'::"text", 'manual'::"text", 'zelomenu'::"text"]))),
    CONSTRAINT "zelochat_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text", 'out_for_delivery'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."zelochat_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."zelochat_orders"."pix_receipt_analysis" IS 'Snapshot of the approved Pix receipt analysis used before automatic order confirmation. Not a bank settlement confirmation.';



CREATE TABLE IF NOT EXISTS "public"."zelochat_pending_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "remote_jid" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "items" "jsonb" NOT NULL,
    "pickup_date" "date" NOT NULL,
    "pickup_time" "text" NOT NULL,
    "payment_method" "text",
    "total" numeric(10,2) NOT NULL,
    "tool_call_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:30:00'::interval) NOT NULL,
    "order_type" "text",
    "delivery_address" "text",
    "delivery_neighborhood" "text",
    "delivery_fee" numeric(10,2),
    "observations" "text",
    "pix_receipt_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "pix_receipt_message_id" "text",
    "pix_receipt_analysis" "jsonb",
    "pix_receipt_rejection_reason" "text",
    CONSTRAINT "zelochat_pending_orders_observations_length_chk" CHECK ((("observations" IS NULL) OR ("length"("observations") <= 500))),
    CONSTRAINT "zelochat_pending_orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['pickup'::"text", 'delivery'::"text"]))),
    CONSTRAINT "zelochat_pending_orders_pix_receipt_status_chk" CHECK (("pix_receipt_status" = ANY (ARRAY['not_required'::"text", 'required'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."zelochat_pending_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zelochat_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_quick_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "trigger" "text" NOT NULL,
    "response" "text" DEFAULT ''::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."zelochat_quick_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_response_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "incoming_message_id" "uuid" NOT NULL,
    "response_message_id" "uuid" NOT NULL,
    "responder_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "latency_ms" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelochat_response_events_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "zelochat_response_events_responder_type_check" CHECK (("responder_type" = ANY (ARRAY['ai'::"text", 'human'::"text"]))),
    CONSTRAINT "zelochat_response_events_source_check" CHECK (("source" = ANY (ARRAY['ai_auto'::"text", 'human_manual'::"text"])))
);


ALTER TABLE "public"."zelochat_response_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_session_tags" (
    "session_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zelochat_session_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "remote_jid" "text" NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "last_message" "text",
    "last_message_time" "text",
    "unread_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "auto_reply" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_pic_url" "text",
    "escalated_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "pinned" boolean DEFAULT false NOT NULL,
    "customer_profile" "text",
    CONSTRAINT "zelochat_sessions_customer_profile_check" CHECK ((("customer_profile" IS NULL) OR ("length"("customer_profile") <= 600))),
    CONSTRAINT "zelochat_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'escalated'::"text", 'resolved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."zelochat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "ai_instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auto_apply_condition" "text"
);


ALTER TABLE "public"."zelochat_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_triggers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "name" "text" NOT NULL,
    "condition_description" "text" NOT NULL,
    "natural_input" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "redirect_phone" "text",
    "redirect_message" "text",
    CONSTRAINT "zelochat_triggers_kind_check" CHECK (("kind" = ANY (ARRAY['notify_manager'::"text", 'escalate_human'::"text", 'redirect_contact'::"text"]))),
    CONSTRAINT "zelochat_triggers_redirect_phone_required" CHECK ((("kind" <> 'redirect_contact'::"text") OR (NULLIF("btrim"("redirect_phone"), ''::"text") IS NOT NULL)))
);


ALTER TABLE "public"."zelochat_triggers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelochat_webhook_events_raw" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance" "text" NOT NULL,
    "empresa_id" "uuid",
    "event_type" "text",
    "wa_message_id" "text",
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_error" "text",
    "auth_status" "text"
);


ALTER TABLE "public"."zelochat_webhook_events_raw" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelochat_webhook_events_raw" IS 'Append-only log of inbound webhook payloads. Replay source if persistence path regresses (see 016 migration header).';



COMMENT ON COLUMN "public"."zelochat_webhook_events_raw"."empresa_id" IS 'NULL when instance resolution failed (unknown instance) — auth path still rejects, but we log to detect probing/misconfig.';



COMMENT ON COLUMN "public"."zelochat_webhook_events_raw"."wa_message_id" IS 'Extracted from data.key.id at log time. Used to find replay candidates after a bug fix without parsing JSONB at scale.';



COMMENT ON COLUMN "public"."zelochat_webhook_events_raw"."payload" IS 'Full webhook body. Media base64 fields are stripped before insert to keep row size bounded (see server/webhookLog.ts).';



COMMENT ON COLUMN "public"."zelochat_webhook_events_raw"."processed_at" IS 'Set after processWebhookEvent returns successfully. NULL = stuck or in-flight; combine with received_at to detect regressions.';



COMMENT ON COLUMN "public"."zelochat_webhook_events_raw"."auth_status" IS 'token_match | token_missing | token_mismatch — observability for the P0.1 strict-mode rollout. Lets ops verify Whatsmiau is sending the apikey header before flipping WEBHOOK_REQUIRE_TOKEN=1.';



CREATE TABLE IF NOT EXISTS "public"."zelochat_whatsapp_onboarding_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_day" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_phone" "text"
);


ALTER TABLE "public"."zelochat_whatsapp_onboarding_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_cart_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "token_last4" "text" NOT NULL,
    "issued_for_revision" integer NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_seen_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    CONSTRAINT "zelomenu_cart_tokens_issued_for_revision_check" CHECK (("issued_for_revision" > 0))
);


ALTER TABLE "public"."zelomenu_cart_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_coupon_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "order_id" "uuid",
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_coupon_redemptions_customer_phone_check" CHECK (("customer_phone" ~ '^[0-9]{8,15}$'::"text"))
);


ALTER TABLE "public"."zelomenu_coupon_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_coupon_redemptions" IS 'Registra o resgate de um cupom por telefone do cliente. A constraint unique(coupon_id, customer_phone) é o que impõe "um por cliente".';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2),
    "min_order_value" numeric(10,2),
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_coupons_code_format" CHECK (("code" ~ '^[A-Z0-9-]{3,30}$'::"text")),
    CONSTRAINT "zelomenu_coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['valor'::"text", 'percentual'::"text", 'frete_gratis'::"text"]))),
    CONSTRAINT "zelomenu_coupons_frete_gratis_no_value" CHECK ((("discount_type" <> 'frete_gratis'::"text") OR ("discount_value" IS NULL))),
    CONSTRAINT "zelomenu_coupons_min_order_non_negative" CHECK ((("min_order_value" IS NULL) OR ("min_order_value" >= (0)::numeric))),
    CONSTRAINT "zelomenu_coupons_percentual_requires_value" CHECK ((("discount_type" <> 'percentual'::"text") OR (("discount_value" IS NOT NULL) AND ("discount_value" > (0)::numeric) AND ("discount_value" <= (100)::numeric)))),
    CONSTRAINT "zelomenu_coupons_valor_requires_value" CHECK ((("discount_type" <> 'valor'::"text") OR (("discount_value" IS NOT NULL) AND ("discount_value" > (0)::numeric)))),
    CONSTRAINT "zelomenu_coupons_window_order" CHECK ((("starts_at" IS NULL) OR ("expires_at" IS NULL) OR ("starts_at" <= "expires_at")))
);


ALTER TABLE "public"."zelomenu_coupons" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_coupons" IS 'Cupons de desconto do ZeloMenu público (pedido inteiro). Não vale para mesa/QR nem PDV.';



COMMENT ON COLUMN "public"."zelomenu_coupons"."discount_value" IS 'R$ para discount_type=valor, % (0-100] para percentual, null/ignorado para frete_gratis.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_cep_cache" (
    "postal_code" "text" NOT NULL,
    "street" "text" NOT NULL,
    "neighborhood" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "provider" "text" DEFAULT 'viacep'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zelomenu_delivery_cep_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_delivery_cep_cache" IS 'ZeloMenu: cache de consultas CEP → endereço (ViaCEP). Compartilhado entre empresas.';



COMMENT ON COLUMN "public"."zelomenu_delivery_cep_cache"."provider" IS 'Provedor que forneceu o resultado (viacep, brasilapi, etc.)';



COMMENT ON COLUMN "public"."zelomenu_delivery_cep_cache"."expires_at" IS 'Data de expiração do cache (TTL ~30 dias)';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_distance_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "destination_address_hash" "text" NOT NULL,
    "origin_location_version" bigint NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "distance_m" integer NOT NULL,
    "geocoding_provider" "text" DEFAULT 'nominatim'::"text" NOT NULL,
    "routing_provider" "text" DEFAULT 'osrm'::"text" NOT NULL,
    "is_stale" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_delivery_distance_cache_distance_m_non_negative" CHECK (("distance_m" >= 0))
);


ALTER TABLE "public"."zelomenu_delivery_distance_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_delivery_distance_cache" IS 'ZeloMenu: cache de distância de rota entre loja e endereço de destino. Isolado por empresa.';



COMMENT ON COLUMN "public"."zelomenu_delivery_distance_cache"."origin_location_version" IS 'Versão das coordenadas da loja no momento do cálculo. Se mudar, caches existentes são invalidados.';



COMMENT ON COLUMN "public"."zelomenu_delivery_distance_cache"."distance_m" IS 'Distância da rota em metros (rota de carro, não linha reta).';



COMMENT ON COLUMN "public"."zelomenu_delivery_distance_cache"."is_stale" IS 'True quando usado fora do TTL normal mas dentro do limite stale.';



COMMENT ON COLUMN "public"."zelomenu_delivery_distance_cache"."expires_at" IS 'Data de expiração normal (não-stale).';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_geocoding_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "postal_code" "text" NOT NULL,
    "number" "text" NOT NULL,
    "address_hash" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "provider" "text" DEFAULT 'nominatim'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zelomenu_delivery_geocoding_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_delivery_geocoding_cache" IS 'ZeloMenu: cache de geocoding (endereço → coordenadas). HMAC do endereço como chave.';



COMMENT ON COLUMN "public"."zelomenu_delivery_geocoding_cache"."address_hash" IS 'HMAC-SHA-256 do endereço normalizado (CEP + número).';



COMMENT ON COLUMN "public"."zelomenu_delivery_geocoding_cache"."provider" IS 'Provedor de geocoding (nominatim, google, etc.)';



COMMENT ON COLUMN "public"."zelomenu_delivery_geocoding_cache"."expires_at" IS 'Data de expiração (TTL ~30 dias)';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_pricing_rule_ranges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pricing_rule_id" "uuid" NOT NULL,
    "max_distance_m" integer NOT NULL,
    "delivery_price" numeric(10,2) NOT NULL,
    CONSTRAINT "zelomenu_delivery_pricing_rule_ranges_delivery_price_check" CHECK (("delivery_price" >= (0)::numeric)),
    CONSTRAINT "zelomenu_delivery_pricing_rule_ranges_max_distance_m_check" CHECK (("max_distance_m" > 0))
);


ALTER TABLE "public"."zelomenu_delivery_pricing_rule_ranges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "start_minute" smallint NOT NULL,
    "end_minute" smallint NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "days_of_week" smallint[] DEFAULT '{0,1,2,3,4,5,6}'::smallint[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_delivery_pricing_rules_end_minute_check" CHECK ((("end_minute" >= 0) AND ("end_minute" <= 1440))),
    CONSTRAINT "zelomenu_delivery_pricing_rules_start_minute_check" CHECK ((("start_minute" >= 0) AND ("start_minute" < 1440)))
);


ALTER TABLE "public"."zelomenu_delivery_pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_quote_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason_code" "text" NOT NULL,
    "customer_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cart_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fulfillment_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pricing_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_error" "jsonb",
    "resolved_fee" numeric(10,2),
    "resolved_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "zelomenu_delivery_quote_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."zelomenu_delivery_quote_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zelomenu_delivery_ranges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "max_distance_m" integer NOT NULL,
    "delivery_price" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_delivery_ranges_delivery_price_check" CHECK (("delivery_price" >= (0)::numeric)),
    CONSTRAINT "zelomenu_delivery_ranges_max_distance_m_check" CHECK (("max_distance_m" > 0))
);


ALTER TABLE "public"."zelomenu_delivery_ranges" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_delivery_ranges" IS 'ZeloMenu: faixas de distância para cálculo de frete por empresa';



COMMENT ON COLUMN "public"."zelomenu_delivery_ranges"."max_distance_m" IS 'Distância máxima da faixa em metros. A primeira faixa que atender a distância da rota será aplicada.';



COMMENT ON COLUMN "public"."zelomenu_delivery_ranges"."delivery_price" IS 'Valor do frete para esta faixa';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_produto" bigint NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" DEFAULT 'adicional'::"text" NOT NULL,
    "min_selecoes" integer DEFAULT 0 NOT NULL,
    "max_selecoes" integer,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "modo_preco" "text" DEFAULT 'somar'::"text" NOT NULL,
    "permite_quantidade" boolean DEFAULT false NOT NULL,
    "maximo_por_opcao" integer,
    CONSTRAINT "zelomenu_modifier_groups_maximo_por_opcao_check" CHECK ((("maximo_por_opcao" IS NULL) OR ("maximo_por_opcao" >= 1))),
    CONSTRAINT "zelomenu_modifier_groups_modo_preco_check" CHECK (("modo_preco" = ANY (ARRAY['somar'::"text", 'substituir'::"text"]))),
    CONSTRAINT "zelomenu_modifier_groups_nome_not_blank" CHECK (("length"("btrim"("nome")) > 0)),
    CONSTRAINT "zelomenu_modifier_groups_order_non_negative" CHECK (("ordem" >= 0)),
    CONSTRAINT "zelomenu_modifier_groups_permite_quantidade_check" CHECK (((NOT "permite_quantidade") OR ("max_selecoes" IS NULL) OR ("max_selecoes" <> 1))),
    CONSTRAINT "zelomenu_modifier_groups_selection_bounds" CHECK ((("min_selecoes" >= 0) AND (("max_selecoes" IS NULL) OR ("max_selecoes" >= GREATEST("min_selecoes", 1))))),
    CONSTRAINT "zelomenu_modifier_groups_tipo_check" CHECK (("tipo" = ANY (ARRAY['adicional'::"text", 'variacao'::"text"])))
);


ALTER TABLE "public"."zelomenu_modifier_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_modifier_groups" IS 'Product-linked modifier groups consumed first by ZeloMenu.';



COMMENT ON COLUMN "public"."zelomenu_modifier_groups"."tipo" IS 'adicional for optional add-ons; variacao for variation-style choices.';



COMMENT ON COLUMN "public"."zelomenu_modifier_groups"."modo_preco" IS 'somar: soma ao preco base do produto. substituir: preco da opcao selecionada substitui o preco base (exige max_selecoes = 1).';



COMMENT ON COLUMN "public"."zelomenu_modifier_groups"."permite_quantidade" IS 'Quando true, cada opcao do grupo pode ser selecionada com quantidade > 1 (ex.: 2x bacon). Só válido para grupos multi-select (max_selecoes <> 1).';



COMMENT ON COLUMN "public"."zelomenu_modifier_groups"."maximo_por_opcao" IS 'Limite opcional de quantidade por opção individual quando permite_quantidade = true. Null = sem limite.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_modifier_option_products" (
    "id_opcao" "uuid" NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_produto" bigint NOT NULL,
    "price_override" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_modifier_option_products_price_override_check" CHECK ((("price_override" IS NULL) OR ("price_override" >= (0)::numeric)))
);


ALTER TABLE "public"."zelomenu_modifier_option_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_modifier_option_products" IS 'Vincula uma zelomenu_modifier_options a um produto real do catalogo (1:1 opcional). Ausencia de linha aqui = opcao classica (nome/price_delta manuais).';



COMMENT ON COLUMN "public"."zelomenu_modifier_option_products"."price_override" IS 'Quando preenchido, substitui o preco do produto vinculado so para esta opcao (desconto de combo). Null = usa produtos.preco vigente.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_modifier_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_grupo" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "price_delta" numeric(10,2) DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_modifier_options_nome_not_blank" CHECK (("length"("btrim"("nome")) > 0)),
    CONSTRAINT "zelomenu_modifier_options_order_non_negative" CHECK (("ordem" >= 0)),
    CONSTRAINT "zelomenu_modifier_options_price_delta_non_negative" CHECK (("price_delta" >= (0)::numeric))
);


ALTER TABLE "public"."zelomenu_modifier_options" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_modifier_options" IS 'Selectable modifier options for a product modifier group.';



COMMENT ON COLUMN "public"."zelomenu_modifier_options"."price_delta" IS 'Additional price applied on top of the base produto.preco; ZeloMenu v1 has no base-price override.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_product_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_usuario" "uuid" NOT NULL,
    "id_produto" bigint NOT NULL,
    "nome_publico" "text",
    "descricao_publica" "text",
    "foto_url" "text",
    "visivel_online" boolean DEFAULT false NOT NULL,
    "pausado_manualmente" boolean DEFAULT false NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zelomenu_product_publications_descricao_publica_not_blank" CHECK ((("descricao_publica" IS NULL) OR ("length"("btrim"("descricao_publica")) > 0))),
    CONSTRAINT "zelomenu_product_publications_nome_publico_not_blank" CHECK ((("nome_publico" IS NULL) OR ("length"("btrim"("nome_publico")) > 0))),
    CONSTRAINT "zelomenu_product_publications_order_non_negative" CHECK (("ordem" >= 0))
);


ALTER TABLE "public"."zelomenu_product_publications" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_product_publications" IS 'PDV-owned overlay that controls how a base product is published in ZeloMenu.';



COMMENT ON COLUMN "public"."zelomenu_product_publications"."visivel_online" IS 'Independent online visibility flag for ZeloMenu; do not derive from produtos.ocultar_no_pdv.';



COMMENT ON COLUMN "public"."zelomenu_product_publications"."pausado_manualmente" IS 'Manual pause for the online menu without changing the base PDV product.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "endpoint" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" "text",
    "order_updates" boolean DEFAULT true NOT NULL,
    "promotions" boolean DEFAULT true NOT NULL,
    "cart_token" "text",
    "last_order_revision" integer,
    "last_order_status" "text"
);


ALTER TABLE "public"."zelomenu_push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."zelomenu_push_subscriptions" IS 'ZeloMenu: subscriptions PWA para atualizações de pedidos e campanhas com consentimento.';



CREATE TABLE IF NOT EXISTS "public"."zelomenu_table_capabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "comanda_id" "uuid" NOT NULL,
    "mesa_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zelomenu_table_capabilities" OWNER TO "postgres";


ALTER TABLE ONLY "public"."caixas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."caixas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categorias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."empresas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."empresas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."produtos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."produtos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendas_itens" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendas_itens_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendas_pagamentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendas_pagamentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."access_audit_logs"
    ADD CONSTRAINT "access_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."access_roles"
    ADD CONSTRAINT "access_roles_owner_name_unique" UNIQUE ("owner_user_id", "name");



ALTER TABLE ONLY "public"."access_roles"
    ADD CONSTRAINT "access_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."access_settings"
    ADD CONSTRAINT "access_settings_pkey" PRIMARY KEY ("owner_user_id");



ALTER TABLE ONLY "public"."access_users"
    ADD CONSTRAINT "access_users_owner_email_unique" UNIQUE ("owner_user_id", "email");



ALTER TABLE ONLY "public"."access_users"
    ADD CONSTRAINT "access_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_deletion_log"
    ADD CONSTRAINT "account_deletion_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_company_metric_settings"
    ADD CONSTRAINT "admin_finance_company_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."admin_finance_fixed_expenses"
    ADD CONSTRAINT "admin_finance_fixed_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_payments"
    ADD CONSTRAINT "billing_payments_external_reference_unique" UNIQUE ("external_reference");



ALTER TABLE ONLY "public"."billing_payments"
    ADD CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_payments"
    ADD CONSTRAINT "billing_payments_provider_payment_unique" UNIQUE ("provider", "provider_payment_id");



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_provider_event_unique" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."business_daily_snapshots"
    ADD CONSTRAINT "business_daily_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_daily_snapshots"
    ADD CONSTRAINT "business_daily_snapshots_user_date_uniq" UNIQUE ("user_id", "snapshot_date");



ALTER TABLE ONLY "public"."business_intelligence_runs"
    ADD CONSTRAINT "business_intelligence_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_signals"
    ADD CONSTRAINT "business_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_signals"
    ADD CONSTRAINT "business_signals_user_date_key_uniq" UNIQUE ("user_id", "signal_date", "dedupe_key");



ALTER TABLE ONLY "public"."caixa_fechamentos"
    ADD CONSTRAINT "caixa_fechamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caixa_movimentacoes"
    ADD CONSTRAINT "caixa_movimentacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caixas"
    ADD CONSTRAINT "caixas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comanda_itens"
    ADD CONSTRAINT "comanda_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_unique_payment_item" UNIQUE ("id_pagamento", "id_comanda_item");



ALTER TABLE ONLY "public"."comanda_pagamentos"
    ADD CONSTRAINT "comanda_pagamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_onboarding_logs"
    ADD CONSTRAINT "email_onboarding_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_onboarding_logs"
    ADD CONSTRAINT "email_onboarding_logs_user_day_unique" UNIQUE ("user_id", "email_day");



ALTER TABLE ONLY "public"."empresa_perfil"
    ADD CONSTRAINT "empresa_perfil_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresa_perfil"
    ADD CONSTRAINT "empresa_perfil_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."empresa_usuarios"
    ADD CONSTRAINT "empresa_usuarios_pkey" PRIMARY KEY ("id_empresa", "id_usuario");



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_usuario_numero_unique" UNIQUE ("id_usuario", "numero");



ALTER TABLE ONLY "public"."onboarding_communication_events"
    ADD CONSTRAINT "onboarding_communication_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outreach_messages"
    ADD CONSTRAINT "outreach_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pessoas"
    ADD CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_usage_events"
    ADD CONSTRAINT "product_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_usage_events"
    ADD CONSTRAINT "product_usage_events_user_date_feature_uniq" UNIQUE ("user_id", "usage_date", "feature");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referral_unique" UNIQUE ("referral_id");



ALTER TABLE ONLY "public"."referral_trigger_events"
    ADD CONSTRAINT "referral_trigger_events_empresa_trigger_unique" UNIQUE ("empresa_id", "trigger_key");



ALTER TABLE ONLY "public"."referral_trigger_events"
    ADD CONSTRAINT "referral_trigger_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_nudges"
    ADD CONSTRAINT "registration_nudges_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."subcategorias"
    ADD CONSTRAINT "subcategorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_cron_logs"
    ADD CONSTRAINT "subscription_cron_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("provider_subscription_id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppression_list"
    ADD CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "unique_user_admin" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."zelomenu_delivery_ranges"
    ADD CONSTRAINT "uq_company_max_distance" UNIQUE ("company_id", "max_distance_m");



ALTER TABLE ONLY "public"."zelomenu_delivery_quote_requests"
    ADD CONSTRAINT "uq_delivery_quote_request_session_key" UNIQUE ("session_id", "idempotency_key");



ALTER TABLE ONLY "public"."zelomenu_delivery_distance_cache"
    ADD CONSTRAINT "uq_distance_company_dest_origin" UNIQUE ("company_id", "destination_address_hash", "origin_location_version");



ALTER TABLE ONLY "public"."zelomenu_delivery_geocoding_cache"
    ADD CONSTRAINT "uq_geocoding_hash_provider" UNIQUE ("address_hash", "provider");



ALTER TABLE ONLY "public"."zelomenu_delivery_pricing_rule_ranges"
    ADD CONSTRAINT "uq_pricing_rule_distance" UNIQUE ("pricing_rule_id", "max_distance_m");



ALTER TABLE ONLY "public"."vendas_itens"
    ADD CONSTRAINT "vendas_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendas_pagamentos"
    ADD CONSTRAINT "vendas_pagamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendas_taxas_plataforma"
    ADD CONSTRAINT "vendas_taxas_plataforma_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events_processed"
    ADD CONSTRAINT "webhook_events_processed_pkey" PRIMARY KEY ("provider", "event_id");



ALTER TABLE ONLY "public"."whatsapp_onboarding_logs"
    ADD CONSTRAINT "whatsapp_onboarding_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_onboarding_logs"
    ADD CONSTRAINT "whatsapp_onboarding_logs_user_day_unique" UNIQUE ("user_id", "message_day");



ALTER TABLE ONLY "public"."zelo_order_events"
    ADD CONSTRAINT "zelo_order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelo_order_items"
    ADD CONSTRAINT "zelo_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelo_order_outbox"
    ADD CONSTRAINT "zelo_order_outbox_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."zelo_order_outbox"
    ADD CONSTRAINT "zelo_order_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelo_orders"
    ADD CONSTRAINT "zelo_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_ai_usage_daily"
    ADD CONSTRAINT "zelochat_ai_usage_daily_pkey" PRIMARY KEY ("empresa_id", "usage_date", "feature", "model");



ALTER TABLE ONLY "public"."zelochat_billing_payments"
    ADD CONSTRAINT "zelochat_billing_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_billing_payments"
    ADD CONSTRAINT "zelochat_billing_payments_provider_provider_payment_id_key" UNIQUE ("provider", "provider_payment_id");



ALTER TABLE ONLY "public"."zelochat_billing_webhook_events"
    ADD CONSTRAINT "zelochat_billing_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_billing_webhook_events"
    ADD CONSTRAINT "zelochat_billing_webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."zelochat_drivers"
    ADD CONSTRAINT "zelochat_drivers_empresa_id_phone_key" UNIQUE ("empresa_id", "phone");



ALTER TABLE ONLY "public"."zelochat_drivers"
    ADD CONSTRAINT "zelochat_drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_email_onboarding_logs"
    ADD CONSTRAINT "zelochat_email_onboarding_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_email_onboarding_logs"
    ADD CONSTRAINT "zelochat_email_onboarding_logs_uniq" UNIQUE ("user_id", "email_day");



ALTER TABLE ONLY "public"."zelochat_escalation_events"
    ADD CONSTRAINT "zelochat_escalation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_messages"
    ADD CONSTRAINT "zelochat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_orders"
    ADD CONSTRAINT "zelochat_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_pending_orders"
    ADD CONSTRAINT "zelochat_pending_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_pending_orders"
    ADD CONSTRAINT "zelochat_pending_orders_unique_per_jid" UNIQUE ("empresa_id", "remote_jid");



ALTER TABLE ONLY "public"."zelochat_push_subscriptions"
    ADD CONSTRAINT "zelochat_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_quick_responses"
    ADD CONSTRAINT "zelochat_quick_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_response_events"
    ADD CONSTRAINT "zelochat_response_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_session_tags"
    ADD CONSTRAINT "zelochat_session_tags_pkey" PRIMARY KEY ("session_id", "tag_id");



ALTER TABLE ONLY "public"."zelochat_sessions"
    ADD CONSTRAINT "zelochat_sessions_empresa_remote_unique" UNIQUE ("empresa_id", "remote_jid");



ALTER TABLE ONLY "public"."zelochat_sessions"
    ADD CONSTRAINT "zelochat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_tags"
    ADD CONSTRAINT "zelochat_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_triggers"
    ADD CONSTRAINT "zelochat_triggers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_webhook_events_raw"
    ADD CONSTRAINT "zelochat_webhook_events_raw_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_whatsapp_onboarding_logs"
    ADD CONSTRAINT "zelochat_whatsapp_onboarding_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelochat_whatsapp_onboarding_logs"
    ADD CONSTRAINT "zelochat_whatsapp_onboarding_logs_uniq" UNIQUE ("user_id", "message_day");



ALTER TABLE ONLY "public"."zelomenu_cart_sessions"
    ADD CONSTRAINT "zelomenu_cart_sessions_ordering_id_key" UNIQUE ("ordering_id");



ALTER TABLE ONLY "public"."zelomenu_cart_sessions"
    ADD CONSTRAINT "zelomenu_cart_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_cart_tokens"
    ADD CONSTRAINT "zelomenu_cart_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_cart_tokens"
    ADD CONSTRAINT "zelomenu_cart_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."zelomenu_coupon_redemptions"
    ADD CONSTRAINT "zelomenu_coupon_redemptions_one_per_customer" UNIQUE ("coupon_id", "customer_phone");



ALTER TABLE ONLY "public"."zelomenu_coupon_redemptions"
    ADD CONSTRAINT "zelomenu_coupon_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_coupons"
    ADD CONSTRAINT "zelomenu_coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_cep_cache"
    ADD CONSTRAINT "zelomenu_delivery_cep_cache_pkey" PRIMARY KEY ("postal_code");



ALTER TABLE ONLY "public"."zelomenu_delivery_distance_cache"
    ADD CONSTRAINT "zelomenu_delivery_distance_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_geocoding_cache"
    ADD CONSTRAINT "zelomenu_delivery_geocoding_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_pricing_rule_ranges"
    ADD CONSTRAINT "zelomenu_delivery_pricing_rule_ranges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_pricing_rules"
    ADD CONSTRAINT "zelomenu_delivery_pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_quote_requests"
    ADD CONSTRAINT "zelomenu_delivery_quote_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_delivery_ranges"
    ADD CONSTRAINT "zelomenu_delivery_ranges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_modifier_groups"
    ADD CONSTRAINT "zelomenu_modifier_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_modifier_option_products"
    ADD CONSTRAINT "zelomenu_modifier_option_products_pkey" PRIMARY KEY ("id_opcao");



ALTER TABLE ONLY "public"."zelomenu_modifier_options"
    ADD CONSTRAINT "zelomenu_modifier_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_product_publications"
    ADD CONSTRAINT "zelomenu_product_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_product_publications"
    ADD CONSTRAINT "zelomenu_product_publications_user_product_unique" UNIQUE ("id_usuario", "id_produto");



ALTER TABLE ONLY "public"."zelomenu_push_subscriptions"
    ADD CONSTRAINT "zelomenu_push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."zelomenu_push_subscriptions"
    ADD CONSTRAINT "zelomenu_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_table_capabilities"
    ADD CONSTRAINT "zelomenu_table_capabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zelomenu_table_capabilities"
    ADD CONSTRAINT "zelomenu_table_capabilities_token_hash_key" UNIQUE ("token_hash");



CREATE INDEX "access_audit_logs_owner_created_at_idx" ON "public"."access_audit_logs" USING "btree" ("owner_user_id", "created_at" DESC);



CREATE INDEX "access_audit_logs_owner_user_id_idx" ON "public"."access_audit_logs" USING "btree" ("owner_user_id");



CREATE INDEX "access_roles_owner_user_id_idx" ON "public"."access_roles" USING "btree" ("owner_user_id");



CREATE INDEX "access_users_auth_user_id_idx" ON "public"."access_users" USING "btree" ("auth_user_id");



CREATE INDEX "access_users_owner_user_id_idx" ON "public"."access_users" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "approvals_idempotency_key_uidx" ON "public"."approvals" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "billing_payments_one_open_pix_per_user_idx" ON "public"."billing_payments" USING "btree" ("user_id", "provider", "method") WHERE (("provider" = 'abacatepay'::"text") AND ("method" = 'pix'::"text") AND ("status" = 'pending'::"text"));



CREATE INDEX "billing_payments_provider_status_idx" ON "public"."billing_payments" USING "btree" ("provider", "status", "created_at" DESC);



CREATE INDEX "billing_payments_user_status_idx" ON "public"."billing_payments" USING "btree" ("user_id", "status", "created_at" DESC);



CREATE INDEX "billing_webhook_events_provider_status_idx" ON "public"."billing_webhook_events" USING "btree" ("provider", "status", "received_at" DESC);



CREATE INDEX "business_signals_dedupe_date_idx" ON "public"."business_signals" USING "btree" ("user_id", "dedupe_key", "signal_date" DESC);



CREATE INDEX "business_signals_user_date_idx" ON "public"."business_signals" USING "btree" ("user_id", "signal_date" DESC);



CREATE INDEX "business_snapshots_user_date_idx" ON "public"."business_daily_snapshots" USING "btree" ("user_id", "snapshot_date" DESC);



CREATE INDEX "caixa_fechamentos_usuario_data_idx" ON "public"."caixa_fechamentos" USING "btree" ("id_usuario", "data_fechamento" DESC);



CREATE UNIQUE INDEX "caixas_one_open_per_user" ON "public"."caixas" USING "btree" ("id_usuario") WHERE ("data_fechamento" IS NULL);



CREATE INDEX "comanda_itens_montagem_idx" ON "public"."comanda_itens" USING "btree" ("id_comanda", "id_produto");



CREATE INDEX "comanda_pagamento_itens_comanda_idx" ON "public"."comanda_pagamento_itens" USING "btree" ("id_comanda", "id_comanda_item");



CREATE INDEX "comanda_pagamento_itens_payment_idx" ON "public"."comanda_pagamento_itens" USING "btree" ("id_pagamento") WHERE ("id_pagamento" IS NOT NULL);



CREATE INDEX "comanda_pagamento_itens_sale_idx" ON "public"."comanda_pagamento_itens" USING "btree" ("id_venda", "id_venda_pagamento", "id_venda_item") WHERE ("id_venda" IS NOT NULL);



CREATE INDEX "comanda_pagamentos_id_comanda_idx" ON "public"."comanda_pagamentos" USING "btree" ("id_comanda");



CREATE INDEX "empresa_perfil_origem_aquisicao_idx" ON "public"."empresa_perfil" USING "gin" ("origem_aquisicao") WHERE ("origem_aquisicao" IS NOT NULL);



CREATE INDEX "empresa_perfil_referral_code_idx" ON "public"."empresa_perfil" USING "btree" ("referral_code");



CREATE UNIQUE INDEX "empresa_perfil_referral_code_unique" ON "public"."empresa_perfil" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE UNIQUE INDEX "empresa_perfil_webhook_token_idx" ON "public"."empresa_perfil" USING "btree" ("webhook_token");



CREATE UNIQUE INDEX "empresa_perfil_whatsmiau_instance_uniq" ON "public"."empresa_perfil" USING "btree" ("whatsmiau_instance") WHERE ("whatsmiau_instance" IS NOT NULL);



CREATE UNIQUE INDEX "empresa_perfil_zelomenu_slug_unique" ON "public"."empresa_perfil" USING "btree" ("zelomenu_slug") WHERE ("zelomenu_slug" IS NOT NULL);



CREATE UNIQUE INDEX "fiado_lancamentos_idempotency_idx" ON "public"."fiado_lancamentos" USING "btree" ("id_usuario", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "fiado_lancamentos_pessoa_created_idx" ON "public"."fiado_lancamentos" USING "btree" ("id_pessoa", "created_at" DESC, "id" DESC);



CREATE INDEX "fiado_lancamentos_usuario_created_idx" ON "public"."fiado_lancamentos" USING "btree" ("id_usuario", "created_at" DESC);



CREATE INDEX "idx_admin_logs_created" ON "public"."admin_activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_agent_runs_started_at" ON "public"."agent_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_agent_runs_status" ON "public"."agent_runs" USING "btree" ("status");



CREATE INDEX "idx_agent_runs_workflow" ON "public"."agent_runs" USING "btree" ("workflow_name");



CREATE INDEX "idx_ai_usage_logs_created_at" ON "public"."ai_usage_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_usage_logs_user_id" ON "public"."ai_usage_logs" USING "btree" ("user_id");



CREATE INDEX "idx_approvals_created_at" ON "public"."approvals" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_approvals_lead_id" ON "public"."approvals" USING "btree" ("lead_id");



CREATE INDEX "idx_approvals_status" ON "public"."approvals" USING "btree" ("status");



CREATE INDEX "idx_caixa_fechamentos_usuario_data" ON "public"."caixa_fechamentos" USING "btree" ("id_usuario", "data_fechamento" DESC);



CREATE INDEX "idx_caixa_movimentacoes_caixa" ON "public"."caixa_movimentacoes" USING "btree" ("id_caixa");



CREATE INDEX "idx_caixa_movs_usuario_data" ON "public"."caixa_movimentacoes" USING "btree" ("id_usuario", "created_at" DESC);



CREATE INDEX "idx_caixas_user_fechamento" ON "public"."caixas" USING "btree" ("id_usuario", "data_fechamento");



CREATE INDEX "idx_comanda_itens_comanda" ON "public"."comanda_itens" USING "btree" ("id_comanda");



CREATE INDEX "idx_comandas_mesa_status" ON "public"."comandas" USING "btree" ("id_mesa", "status");



CREATE INDEX "idx_comandas_usuario_status" ON "public"."comandas" USING "btree" ("id_usuario", "status");



CREATE INDEX "idx_delivery_pricing_rules_company" ON "public"."zelomenu_delivery_pricing_rules" USING "btree" ("company_id");



CREATE INDEX "idx_delivery_quote_requests_company_status" ON "public"."zelomenu_delivery_quote_requests" USING "btree" ("company_id", "status", "created_at" DESC);



CREATE INDEX "idx_delivery_quote_requests_session" ON "public"."zelomenu_delivery_quote_requests" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_email_onboarding_logs_user_id" ON "public"."email_onboarding_logs" USING "btree" ("user_id");



CREATE INDEX "idx_empresa_perfil_deletion_scheduled" ON "public"."empresa_perfil" USING "btree" ("deletion_scheduled_at") WHERE ("deletion_scheduled_at" IS NOT NULL);



CREATE INDEX "idx_empresa_perfil_last_seen_at" ON "public"."empresa_perfil" USING "btree" ("last_seen_at");



CREATE INDEX "idx_empresa_perfil_user" ON "public"."empresa_perfil" USING "btree" ("user_id");



CREATE INDEX "idx_lead_events_created_at" ON "public"."lead_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_lead_events_event_type" ON "public"."lead_events" USING "btree" ("event_type");



CREATE INDEX "idx_lead_events_lead_id" ON "public"."lead_events" USING "btree" ("lead_id");



CREATE INDEX "idx_leads_city_state" ON "public"."leads" USING "btree" ("city", "state");



CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_leads_dedupe_key" ON "public"."leads" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "idx_leads_email" ON "public"."leads" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_leads_last_contacted" ON "public"."leads" USING "btree" ("last_contacted_at") WHERE ("last_contacted_at" IS NOT NULL);



CREATE INDEX "idx_leads_next_followup" ON "public"."leads" USING "btree" ("next_followup_at") WHERE ("next_followup_at" IS NOT NULL);



CREATE INDEX "idx_leads_normalized_phone" ON "public"."leads" USING "btree" ("normalized_phone") WHERE ("normalized_phone" IS NOT NULL);



CREATE INDEX "idx_leads_product_fit" ON "public"."leads" USING "btree" ("product_fit");



CREATE INDEX "idx_leads_score_desc" ON "public"."leads" USING "btree" ("score" DESC) WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_mesas_usuario_status" ON "public"."mesas" USING "btree" ("id_usuario", "status");



CREATE INDEX "idx_movimentacoes_id_caixa" ON "public"."caixa_movimentacoes" USING "btree" ("id_caixa");



CREATE INDEX "idx_onboarding_comm_events_channel_day" ON "public"."onboarding_communication_events" USING "btree" ("channel", "message_day", "created_at" DESC);



CREATE INDEX "idx_onboarding_comm_events_status_created" ON "public"."onboarding_communication_events" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_onboarding_comm_events_user_created" ON "public"."onboarding_communication_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_outreach_channel" ON "public"."outreach_messages" USING "btree" ("channel");



CREATE INDEX "idx_outreach_created_at" ON "public"."outreach_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_outreach_lead_id" ON "public"."outreach_messages" USING "btree" ("lead_id");



CREATE INDEX "idx_outreach_status" ON "public"."outreach_messages" USING "btree" ("status");



CREATE INDEX "idx_pagamentos_id_venda" ON "public"."vendas_pagamentos" USING "btree" ("id_venda");



CREATE INDEX "idx_pessoas_usuario_nome" ON "public"."pessoas" USING "btree" ("id_usuario", "nome");



CREATE INDEX "idx_pricing_rule_ranges_rule" ON "public"."zelomenu_delivery_pricing_rule_ranges" USING "btree" ("pricing_rule_id");



CREATE INDEX "idx_produtos_categoria_pdv" ON "public"."produtos" USING "btree" ("id_categoria", "ocultar_no_pdv");



CREATE INDEX "idx_subcategorias_categoria" ON "public"."subcategorias" USING "btree" ("id_categoria");



CREATE INDEX "idx_subcategorias_categoria_ordem" ON "public"."subcategorias" USING "btree" ("id_categoria", "ordem");



CREATE INDEX "idx_subscriptions_plan_tier" ON "public"."subscriptions" USING "btree" ("plan_tier");



CREATE INDEX "idx_subscriptions_stripe_customer_id" ON "public"."subscriptions" USING "btree" ("provider_customer_id");



CREATE INDEX "idx_subscriptions_stripe_sub_id" ON "public"."subscriptions" USING "btree" ("provider_subscription_id");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_super_admins_email" ON "public"."super_admins" USING "btree" ("email");



CREATE INDEX "idx_super_admins_user_id" ON "public"."super_admins" USING "btree" ("user_id");



CREATE INDEX "idx_suppression_email" ON "public"."suppression_list" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_suppression_phone" ON "public"."suppression_list" USING "btree" ("normalized_phone") WHERE ("normalized_phone" IS NOT NULL);



CREATE INDEX "idx_vendas_caixa" ON "public"."vendas" USING "btree" ("id_caixa");



CREATE INDEX "idx_vendas_created_at" ON "public"."vendas" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_vendas_id_caixa" ON "public"."vendas" USING "btree" ("id_caixa");



CREATE INDEX "idx_vendas_id_cliente" ON "public"."vendas" USING "btree" ("id_cliente");



CREATE INDEX "idx_vendas_id_pessoa" ON "public"."vendas" USING "btree" ("id_pessoa");



CREATE INDEX "idx_vendas_id_usuario" ON "public"."vendas" USING "btree" ("id_usuario");



CREATE INDEX "idx_vendas_itens_venda" ON "public"."vendas_itens" USING "btree" ("id_venda");



CREATE INDEX "idx_vendas_pagamentos_created_at" ON "public"."vendas_pagamentos" USING "btree" ("created_at");



CREATE INDEX "idx_vendas_pagamentos_forma" ON "public"."vendas_pagamentos" USING "btree" ("forma_pagamento");



CREATE INDEX "idx_vendas_pagamentos_usuario" ON "public"."vendas_pagamentos" USING "btree" ("id_usuario");



CREATE INDEX "idx_vendas_pagamentos_venda" ON "public"."vendas_pagamentos" USING "btree" ("id_venda");



CREATE INDEX "idx_vendas_taxas_plataforma_user_created" ON "public"."vendas_taxas_plataforma" USING "btree" ("id_usuario", "created_at" DESC);



CREATE INDEX "idx_vendas_taxas_plataforma_venda" ON "public"."vendas_taxas_plataforma" USING "btree" ("id_venda");



CREATE INDEX "idx_vendas_tipo_pedido" ON "public"."vendas" USING "btree" ("tipo_pedido");



CREATE INDEX "idx_vendas_usuario_numero" ON "public"."vendas" USING "btree" ("id_usuario", "numero_venda");



CREATE INDEX "idx_whatsapp_onboarding_logs_user_id" ON "public"."whatsapp_onboarding_logs" USING "btree" ("user_id");



CREATE INDEX "idx_zelochat_ai_usage_daily_empresa_date" ON "public"."zelochat_ai_usage_daily" USING "btree" ("empresa_id", "usage_date" DESC);



CREATE INDEX "idx_zelochat_billing_payments_provider_payment_id" ON "public"."zelochat_billing_payments" USING "btree" ("provider_payment_id");



CREATE INDEX "idx_zelochat_billing_payments_user_id" ON "public"."zelochat_billing_payments" USING "btree" ("user_id");



CREATE INDEX "idx_zelochat_drivers_empresa_id" ON "public"."zelochat_drivers" USING "btree" ("empresa_id");



CREATE INDEX "idx_zelochat_escalation_events_empresa_time" ON "public"."zelochat_escalation_events" USING "btree" ("empresa_id", "triggered_at" DESC);



CREATE INDEX "idx_zelochat_escalation_events_open" ON "public"."zelochat_escalation_events" USING "btree" ("empresa_id") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_zelochat_escalation_events_session_time" ON "public"."zelochat_escalation_events" USING "btree" ("session_id", "triggered_at" DESC);



CREATE INDEX "idx_zelochat_messages_empresa_role_sent" ON "public"."zelochat_messages" USING "btree" ("empresa_id", "role", "sent_at" DESC);



CREATE INDEX "idx_zelochat_messages_empresa_session_sent" ON "public"."zelochat_messages" USING "btree" ("empresa_id", "session_id", "sent_at" DESC);



CREATE INDEX "idx_zelochat_messages_outbound_status" ON "public"."zelochat_messages" USING "btree" ("empresa_id", "outbound_status", "sent_at" DESC) WHERE ("outbound_status" IS NOT NULL);



CREATE INDEX "idx_zelochat_orders_empresa_pickup" ON "public"."zelochat_orders" USING "btree" ("empresa_id", "pickup_date", "pickup_time");



CREATE INDEX "idx_zelochat_orders_empresa_status" ON "public"."zelochat_orders" USING "btree" ("empresa_id", "status");



CREATE INDEX "idx_zelochat_quick_responses_empresa" ON "public"."zelochat_quick_responses" USING "btree" ("empresa_id", "position");



CREATE INDEX "idx_zelochat_response_events_empresa_time" ON "public"."zelochat_response_events" USING "btree" ("empresa_id", "sent_at" DESC);



CREATE UNIQUE INDEX "idx_zelochat_response_events_first_by_responder" ON "public"."zelochat_response_events" USING "btree" ("empresa_id", "incoming_message_id", "responder_type");



CREATE UNIQUE INDEX "idx_zelochat_response_events_response_message" ON "public"."zelochat_response_events" USING "btree" ("empresa_id", "response_message_id");



CREATE INDEX "idx_zelochat_response_events_session_time" ON "public"."zelochat_response_events" USING "btree" ("session_id", "sent_at" DESC);



CREATE INDEX "idx_zelochat_session_tags_empresa_tag_session" ON "public"."zelochat_session_tags" USING "btree" ("empresa_id", "tag_id", "session_id");



CREATE INDEX "idx_zelochat_sessions_empresa_phone" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "customer_phone");



CREATE INDEX "idx_zelochat_sessions_empresa_pinned" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "updated_at" DESC) WHERE ("pinned" = true);



CREATE INDEX "idx_zelochat_sessions_empresa_updated" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "updated_at" DESC);



CREATE INDEX "idx_zelochat_sessions_inbox_page" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "pinned" DESC, "last_message_time" DESC, "updated_at" DESC) WHERE ("remote_jid" ~~ '%@s.whatsapp.net'::"text");



CREATE INDEX "idx_zelochat_sessions_inbox_status_page" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "status", "pinned" DESC, "last_message_time" DESC, "updated_at" DESC) WHERE ("remote_jid" ~~ '%@s.whatsapp.net'::"text");



CREATE INDEX "idx_zelochat_sessions_inbox_unread_page" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "pinned" DESC, "last_message_time" DESC, "updated_at" DESC) WHERE (("unread_count" > 0) AND ("status" <> 'archived'::"text") AND ("remote_jid" ~~ '%@s.whatsapp.net'::"text"));



CREATE INDEX "idx_zelochat_sessions_status_escalated" ON "public"."zelochat_sessions" USING "btree" ("empresa_id", "escalated_at" DESC) WHERE ("status" = 'escalated'::"text");



CREATE INDEX "idx_zelochat_triggers_empresa_active" ON "public"."zelochat_triggers" USING "btree" ("empresa_id", "active");



CREATE INDEX "idx_zelomenu_delivery_distance_company" ON "public"."zelomenu_delivery_distance_cache" USING "btree" ("company_id");



CREATE INDEX "idx_zelomenu_delivery_geocoding_hash" ON "public"."zelomenu_delivery_geocoding_cache" USING "btree" ("address_hash");



CREATE INDEX "idx_zelomenu_delivery_ranges_company" ON "public"."zelomenu_delivery_ranges" USING "btree" ("company_id");



CREATE INDEX "idx_zelomenu_push_subscriptions_client_id" ON "public"."zelomenu_push_subscriptions" USING "btree" ("client_id");



CREATE INDEX "idx_zelomenu_push_subscriptions_order_id" ON "public"."zelomenu_push_subscriptions" USING "btree" ("order_id");



CREATE INDEX "idx_zelomenu_push_subscriptions_order_updates" ON "public"."zelomenu_push_subscriptions" USING "btree" ("order_id", "order_updates") WHERE (("order_id" IS NOT NULL) AND ("order_updates" = true));



CREATE UNIQUE INDEX "leads_dedupe_key_uidx" ON "public"."leads" USING "btree" ("dedupe_key");



CREATE INDEX "product_usage_events_user_date_idx" ON "public"."product_usage_events" USING "btree" ("user_id", "usage_date" DESC);



CREATE INDEX "referral_rewards_created_at_idx" ON "public"."referral_rewards" USING "btree" ("created_at" DESC);



CREATE INDEX "referral_rewards_empresa_id_idx" ON "public"."referral_rewards" USING "btree" ("empresa_id");



CREATE INDEX "referral_rewards_referral_id_idx" ON "public"."referral_rewards" USING "btree" ("referral_id");



CREATE INDEX "referral_rewards_status_idx" ON "public"."referral_rewards" USING "btree" ("status");



CREATE INDEX "referral_trigger_events_empresa_id_idx" ON "public"."referral_trigger_events" USING "btree" ("empresa_id");



CREATE INDEX "referral_trigger_events_trigger_key_idx" ON "public"."referral_trigger_events" USING "btree" ("trigger_key");



CREATE INDEX "referrals_created_at_idx" ON "public"."referrals" USING "btree" ("created_at" DESC);



CREATE INDEX "referrals_referral_code_idx" ON "public"."referrals" USING "btree" ("referral_code");



CREATE INDEX "referrals_referred_empresa_id_idx" ON "public"."referrals" USING "btree" ("referred_empresa_id");



CREATE UNIQUE INDEX "referrals_referred_empresa_unique" ON "public"."referrals" USING "btree" ("referred_empresa_id") WHERE (("referred_empresa_id" IS NOT NULL) AND ("status" <> 'rejected'::"text"));



CREATE INDEX "referrals_referrer_empresa_id_idx" ON "public"."referrals" USING "btree" ("referrer_empresa_id");



CREATE INDEX "referrals_referrer_status_created_idx" ON "public"."referrals" USING "btree" ("referrer_empresa_id", "status", "created_at" DESC);



CREATE INDEX "referrals_status_idx" ON "public"."referrals" USING "btree" ("status");



CREATE UNIQUE INDEX "subscriptions_one_live_row_per_user" ON "public"."subscriptions" USING "btree" ("user_id") WHERE ("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'incomplete'::"text"]));



COMMENT ON INDEX "public"."subscriptions_one_live_row_per_user" IS 'At most one effective subscription row per owner; terminal history remains append-only.';



CREATE INDEX "vendas_itens_comanda_item_idx" ON "public"."vendas_itens" USING "btree" ("id_comanda_item") WHERE ("id_comanda_item" IS NOT NULL);



CREATE INDEX "vendas_itens_venda_idx" ON "public"."vendas_itens" USING "btree" ("id_venda");



CREATE INDEX "vendas_pagamentos_comanda_pagamento_idx" ON "public"."vendas_pagamentos" USING "btree" ("id_comanda_pagamento") WHERE ("id_comanda_pagamento" IS NOT NULL);



CREATE INDEX "vendas_pagamentos_venda_idx" ON "public"."vendas_pagamentos" USING "btree" ("id_venda");



CREATE UNIQUE INDEX "vendas_user_client_sale_id_unique" ON "public"."vendas" USING "btree" ("id_usuario", "client_sale_id") WHERE ("client_sale_id" IS NOT NULL);



CREATE INDEX "vendas_usuario_created_idx" ON "public"."vendas" USING "btree" ("id_usuario", "created_at" DESC);



CREATE INDEX "zelo_order_events_order_idx" ON "public"."zelo_order_events" USING "btree" ("order_id", "id");



CREATE INDEX "zelo_order_items_order_idx" ON "public"."zelo_order_items" USING "btree" ("order_id", "position");



CREATE INDEX "zelo_order_outbox_pending_idx" ON "public"."zelo_order_outbox" USING "btree" ("available_at", "id") WHERE ("processed_at" IS NULL);



CREATE INDEX "zelo_orders_empresa_status_idx" ON "public"."zelo_orders" USING "btree" ("empresa_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "zelo_orders_idempotency_uidx" ON "public"."zelo_orders" USING "btree" ("empresa_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "zelo_orders_legacy_chat_uidx" ON "public"."zelo_orders" USING "btree" ("legacy_zelochat_order_id") WHERE ("legacy_zelochat_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "zelo_orders_legacy_pedido_uidx" ON "public"."zelo_orders" USING "btree" ("legacy_pedido_id") WHERE ("legacy_pedido_id" IS NOT NULL);



CREATE UNIQUE INDEX "zelo_orders_session_uidx" ON "public"."zelo_orders" USING "btree" ("zelomenu_session_id") WHERE ("zelomenu_session_id" IS NOT NULL);



CREATE INDEX "zelochat_email_onboarding_logs_user_idx" ON "public"."zelochat_email_onboarding_logs" USING "btree" ("user_id");



CREATE INDEX "zelochat_messages_empresa_id_idx" ON "public"."zelochat_messages" USING "btree" ("empresa_id");



CREATE UNIQUE INDEX "zelochat_messages_empresa_wa_msg_uniq" ON "public"."zelochat_messages" USING "btree" ("empresa_id", "wa_message_id") WHERE ("wa_message_id" IS NOT NULL);



CREATE INDEX "zelochat_messages_session_id_idx" ON "public"."zelochat_messages" USING "btree" ("session_id", "sent_at");



CREATE UNIQUE INDEX "zelochat_orders_zelomenu_session_uidx" ON "public"."zelochat_orders" USING "btree" ("zelomenu_session_id") WHERE ("zelomenu_session_id" IS NOT NULL);



CREATE INDEX "zelochat_pending_orders_empresa_idx" ON "public"."zelochat_pending_orders" USING "btree" ("empresa_id");



CREATE INDEX "zelochat_pending_orders_expires_idx" ON "public"."zelochat_pending_orders" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "zelochat_push_subscriptions_empresa_endpoint" ON "public"."zelochat_push_subscriptions" USING "btree" ("empresa_id", "endpoint");



CREATE INDEX "zelochat_push_subscriptions_empresa_id" ON "public"."zelochat_push_subscriptions" USING "btree" ("empresa_id");



CREATE INDEX "zelochat_session_tags_empresa_id" ON "public"."zelochat_session_tags" USING "btree" ("empresa_id");



CREATE INDEX "zelochat_session_tags_session_id" ON "public"."zelochat_session_tags" USING "btree" ("session_id");



CREATE INDEX "zelochat_session_tags_tag_id" ON "public"."zelochat_session_tags" USING "btree" ("tag_id");



CREATE INDEX "zelochat_sessions_empresa_id_idx" ON "public"."zelochat_sessions" USING "btree" ("empresa_id");



CREATE UNIQUE INDEX "zelochat_sessions_id_empresa_id_unique" ON "public"."zelochat_sessions" USING "btree" ("id", "empresa_id");



CREATE INDEX "zelochat_sessions_updated_at_idx" ON "public"."zelochat_sessions" USING "btree" ("updated_at" DESC);



CREATE INDEX "zelochat_tags_empresa_id" ON "public"."zelochat_tags" USING "btree" ("empresa_id");



CREATE UNIQUE INDEX "zelochat_tags_empresa_name" ON "public"."zelochat_tags" USING "btree" ("empresa_id", "name");



CREATE UNIQUE INDEX "zelochat_tags_id_empresa_id_unique" ON "public"."zelochat_tags" USING "btree" ("id", "empresa_id");



CREATE INDEX "zelochat_webhook_events_raw_auth_status_idx" ON "public"."zelochat_webhook_events_raw" USING "btree" ("auth_status", "received_at" DESC) WHERE ("auth_status" IS NOT NULL);



CREATE INDEX "zelochat_webhook_events_raw_empresa_received_idx" ON "public"."zelochat_webhook_events_raw" USING "btree" ("empresa_id", "received_at" DESC);



CREATE INDEX "zelochat_webhook_events_raw_received_idx" ON "public"."zelochat_webhook_events_raw" USING "btree" ("received_at" DESC);



CREATE INDEX "zelochat_webhook_events_raw_unprocessed_idx" ON "public"."zelochat_webhook_events_raw" USING "btree" ("received_at" DESC) WHERE ("processed_at" IS NULL);



CREATE INDEX "zelochat_webhook_events_raw_wa_msg_idx" ON "public"."zelochat_webhook_events_raw" USING "btree" ("empresa_id", "wa_message_id") WHERE ("wa_message_id" IS NOT NULL);



CREATE INDEX "zelochat_whatsapp_onboarding_logs_user_idx" ON "public"."zelochat_whatsapp_onboarding_logs" USING "btree" ("user_id");



CREATE UNIQUE INDEX "zelomenu_cart_sessions_active_source_ref_key" ON "public"."zelomenu_cart_sessions" USING "btree" ("empresa_id", "context", "source_ref") WHERE ("archived_at" IS NULL);



CREATE INDEX "zelomenu_cart_sessions_empresa_context_idx" ON "public"."zelomenu_cart_sessions" USING "btree" ("empresa_id", "context", "updated_at" DESC);



CREATE INDEX "zelomenu_cart_tokens_session_idx" ON "public"."zelomenu_cart_tokens" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "zelomenu_coupon_redemptions_order_idx" ON "public"."zelomenu_coupon_redemptions" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "zelomenu_coupon_redemptions_user_idx" ON "public"."zelomenu_coupon_redemptions" USING "btree" ("id_usuario");



CREATE INDEX "zelomenu_coupons_user_active_idx" ON "public"."zelomenu_coupons" USING "btree" ("id_usuario", "active");



CREATE UNIQUE INDEX "zelomenu_coupons_user_code_unique" ON "public"."zelomenu_coupons" USING "btree" ("id_usuario", "lower"("code"));



CREATE INDEX "zelomenu_modifier_groups_product_idx" ON "public"."zelomenu_modifier_groups" USING "btree" ("id_produto");



CREATE INDEX "zelomenu_modifier_groups_user_product_order_idx" ON "public"."zelomenu_modifier_groups" USING "btree" ("id_usuario", "id_produto", "ativo", "ordem");



CREATE INDEX "zelomenu_modifier_option_products_produto_idx" ON "public"."zelomenu_modifier_option_products" USING "btree" ("id_produto");



CREATE INDEX "zelomenu_modifier_option_products_user_idx" ON "public"."zelomenu_modifier_option_products" USING "btree" ("id_usuario");



CREATE INDEX "zelomenu_modifier_options_group_order_idx" ON "public"."zelomenu_modifier_options" USING "btree" ("id_grupo", "ativo", "ordem");



CREATE INDEX "zelomenu_modifier_options_user_idx" ON "public"."zelomenu_modifier_options" USING "btree" ("id_usuario");



CREATE INDEX "zelomenu_product_publications_product_idx" ON "public"."zelomenu_product_publications" USING "btree" ("id_produto");



CREATE INDEX "zelomenu_product_publications_user_visible_order_idx" ON "public"."zelomenu_product_publications" USING "btree" ("id_usuario", "visivel_online", "pausado_manualmente", "ordem", "id_produto");



CREATE UNIQUE INDEX "zelomenu_table_capabilities_one_active" ON "public"."zelomenu_table_capabilities" USING "btree" ("comanda_id") WHERE ("revoked_at" IS NULL);



CREATE OR REPLACE VIEW "public"."v_leads_pending_followup" AS
 SELECT "l"."id",
    "l"."business_name",
    "l"."segment",
    "l"."city",
    "l"."state",
    "l"."country",
    "l"."phone",
    "l"."normalized_phone",
    "l"."whatsapp",
    "l"."email",
    "l"."instagram",
    "l"."website",
    "l"."google_maps_url",
    "l"."source",
    "l"."source_ref",
    "l"."raw_data",
    "l"."dedupe_key",
    "l"."score",
    "l"."score_reason",
    "l"."fit_status",
    "l"."product_fit",
    "l"."pain_hypothesis",
    "l"."recommended_action",
    "l"."status",
    "l"."opt_in_whatsapp",
    "l"."whatsapp_window_until",
    "l"."consent_source",
    "l"."last_contacted_at",
    "l"."next_followup_at",
    "l"."created_at",
    "l"."updated_at",
    "count"("e"."id") AS "event_count"
   FROM ("public"."leads" "l"
     LEFT JOIN "public"."lead_events" "e" ON (("e"."lead_id" = "l"."id")))
  WHERE (("l"."status" = 'contacted'::"public"."lead_status") AND ("l"."last_contacted_at" IS NOT NULL) AND (("l"."last_contacted_at" >= ("now"() - '4 days'::interval)) AND ("l"."last_contacted_at" <= ("now"() - '2 days'::interval))))
  GROUP BY "l"."id";



CREATE OR REPLACE TRIGGER "comanda_pagamento_itens_fill_context" BEFORE INSERT OR UPDATE OF "id_pagamento", "id_comanda", "id_comanda_item", "id_usuario" ON "public"."comanda_pagamento_itens" FOR EACH ROW EXECUTE FUNCTION "public"."comanda_pagamento_itens_fill_context"();



CREATE OR REPLACE TRIGGER "comanda_pagamento_itens_validate_quantity" BEFORE INSERT OR UPDATE OF "id_comanda_item", "quantidade" ON "public"."comanda_pagamento_itens" FOR EACH ROW EXECUTE FUNCTION "public"."comanda_pagamento_itens_validate_quantity"();



CREATE OR REPLACE TRIGGER "comandas_mutation_rbac_guard" BEFORE UPDATE ON "public"."comandas" FOR EACH ROW EXECUTE FUNCTION "public"."comandas_mutation_rbac_guard"();



CREATE OR REPLACE TRIGGER "fiado_debito_venda_ledger" AFTER INSERT ON "public"."vendas" FOR EACH ROW EXECUTE FUNCTION "public"."fiado_registrar_debito_venda"();



CREATE OR REPLACE TRIGGER "fiado_debito_venda_pagamento_ledger" AFTER INSERT ON "public"."vendas_pagamentos" FOR EACH ROW EXECUTE FUNCTION "public"."fiado_registrar_debito_pagamento_venda"();



CREATE OR REPLACE TRIGGER "mesas_status_rbac_guard" BEFORE UPDATE ON "public"."mesas" FOR EACH ROW EXECUTE FUNCTION "public"."mesas_status_rbac_guard"();



CREATE OR REPLACE TRIGGER "normalize_caixa_movimentacao_actor_before_insert" BEFORE INSERT ON "public"."caixa_movimentacoes" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_caixa_movimentacao_actor"();



CREATE OR REPLACE TRIGGER "trg_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_numero_venda" BEFORE INSERT ON "public"."vendas" FOR EACH ROW EXECUTE FUNCTION "public"."set_numero_venda"();



CREATE OR REPLACE TRIGGER "trg_vendas_pagamentos_enforce_user" BEFORE INSERT OR UPDATE ON "public"."vendas_pagamentos" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_vendas_pagamentos_user"();



CREATE OR REPLACE TRIGGER "trg_zelochat_orders_updated_at" BEFORE UPDATE ON "public"."zelochat_orders" FOR EACH ROW EXECUTE FUNCTION "public"."zelochat_orders_set_updated_at"();



CREATE OR REPLACE TRIGGER "update_empresa_perfil_updated_at" BEFORE UPDATE ON "public"."empresa_perfil" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"();



CREATE OR REPLACE TRIGGER "vendas_discount_rbac_guard" BEFORE INSERT OR UPDATE OF "valor_desconto" ON "public"."vendas" FOR EACH ROW EXECUTE FUNCTION "public"."vendas_discount_rbac_guard"();



CREATE OR REPLACE TRIGGER "vendas_insert_rbac_guard" BEFORE INSERT ON "public"."vendas" FOR EACH ROW EXECUTE FUNCTION "public"."vendas_insert_rbac_guard"();



CREATE OR REPLACE TRIGGER "zelo_order_sale_on_deliver" BEFORE UPDATE OF "status" ON "public"."zelo_orders" FOR EACH ROW WHEN ((("new"."status" = 'delivered'::"text") AND ("old"."status" IS DISTINCT FROM 'delivered'::"text") AND ("new"."sale_id" IS NULL))) EXECUTE FUNCTION "public"."zelo_order_sale_on_deliver"();



ALTER TABLE ONLY "public"."access_audit_logs"
    ADD CONSTRAINT "access_audit_logs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."access_audit_logs"
    ADD CONSTRAINT "access_audit_logs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_roles"
    ADD CONSTRAINT "access_roles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_settings"
    ADD CONSTRAINT "access_settings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_users"
    ADD CONSTRAINT "access_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."access_users"
    ADD CONSTRAINT "access_users_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_users"
    ADD CONSTRAINT "access_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."access_roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."super_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_company_metric_settings"
    ADD CONSTRAINT "admin_finance_company_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_company_metric_settings"
    ADD CONSTRAINT "admin_finance_company_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_finance_fixed_expenses"
    ADD CONSTRAINT "admin_finance_fixed_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."super_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_finance_fixed_expenses"
    ADD CONSTRAINT "admin_finance_fixed_expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."super_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_payments"
    ADD CONSTRAINT "billing_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_payments"
    ADD CONSTRAINT "billing_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."billing_payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caixa_fechamentos"
    ADD CONSTRAINT "caixa_fechamentos_id_caixa_fkey" FOREIGN KEY ("id_caixa") REFERENCES "public"."caixas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caixa_fechamentos"
    ADD CONSTRAINT "caixa_fechamentos_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caixa_movimentacoes"
    ADD CONSTRAINT "caixa_movimentacoes_id_caixa_fkey" FOREIGN KEY ("id_caixa") REFERENCES "public"."caixas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caixa_movimentacoes"
    ADD CONSTRAINT "caixa_movimentacoes_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caixas"
    ADD CONSTRAINT "caixas_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caixas"
    ADD CONSTRAINT "caixas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comanda_itens"
    ADD CONSTRAINT "comanda_itens_id_comanda_fkey" FOREIGN KEY ("id_comanda") REFERENCES "public"."comandas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comanda_itens"
    ADD CONSTRAINT "comanda_itens_id_produto_fkey" FOREIGN KEY ("id_produto") REFERENCES "public"."produtos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_comanda_fkey" FOREIGN KEY ("id_comanda") REFERENCES "public"."comandas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_comanda_item_fkey" FOREIGN KEY ("id_comanda_item") REFERENCES "public"."comanda_itens"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_pagamento_fkey" FOREIGN KEY ("id_pagamento") REFERENCES "public"."comanda_pagamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_venda_item_fkey" FOREIGN KEY ("id_venda_item") REFERENCES "public"."vendas_itens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamento_itens"
    ADD CONSTRAINT "comanda_pagamento_itens_id_venda_pagamento_fkey" FOREIGN KEY ("id_venda_pagamento") REFERENCES "public"."vendas_pagamentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamentos"
    ADD CONSTRAINT "comanda_pagamentos_id_comanda_fkey" FOREIGN KEY ("id_comanda") REFERENCES "public"."comandas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comanda_pagamentos"
    ADD CONSTRAINT "comanda_pagamentos_id_pessoa_fkey" FOREIGN KEY ("id_pessoa") REFERENCES "public"."pessoas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comanda_pagamentos"
    ADD CONSTRAINT "comanda_pagamentos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_id_mesa_fkey" FOREIGN KEY ("id_mesa") REFERENCES "public"."mesas"("id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."comandas"
    ADD CONSTRAINT "comandas_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."super_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_onboarding_logs"
    ADD CONSTRAINT "email_onboarding_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresa_perfil"
    ADD CONSTRAINT "empresa_perfil_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresa_usuarios"
    ADD CONSTRAINT "empresa_usuarios_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresa_usuarios"
    ADD CONSTRAINT "empresa_usuarios_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_id_owner_fkey" FOREIGN KEY ("id_owner") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_caixa_fkey" FOREIGN KEY ("id_caixa") REFERENCES "public"."caixas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_caixa_movimentacao_fkey" FOREIGN KEY ("id_caixa_movimentacao") REFERENCES "public"."caixa_movimentacoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_pessoa_fkey" FOREIGN KEY ("id_pessoa") REFERENCES "public"."pessoas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiado_lancamentos"
    ADD CONSTRAINT "fiado_lancamentos_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mesas"
    ADD CONSTRAINT "mesas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_communication_events"
    ADD CONSTRAINT "onboarding_communication_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outreach_messages"
    ADD CONSTRAINT "outreach_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_id_categoria_fkey" FOREIGN KEY ("id_categoria") REFERENCES "public"."categorias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_id_subcategoria_fkey" FOREIGN KEY ("id_subcategoria") REFERENCES "public"."subcategorias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_trigger_events"
    ADD CONSTRAINT "referral_trigger_events_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_empresa_id_fkey" FOREIGN KEY ("referred_empresa_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_empresa_id_fkey" FOREIGN KEY ("referrer_empresa_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registration_nudges"
    ADD CONSTRAINT "registration_nudges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcategorias"
    ADD CONSTRAINT "subcategorias_id_categoria_fkey" FOREIGN KEY ("id_categoria") REFERENCES "public"."categorias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "public"."super_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_id_caixa_fkey" FOREIGN KEY ("id_caixa") REFERENCES "public"."caixas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_id_operador_fkey" FOREIGN KEY ("id_operador") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_id_pessoa_fkey" FOREIGN KEY ("id_pessoa") REFERENCES "public"."pessoas"("id");



ALTER TABLE ONLY "public"."vendas"
    ADD CONSTRAINT "vendas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_itens"
    ADD CONSTRAINT "vendas_itens_id_comanda_item_fkey" FOREIGN KEY ("id_comanda_item") REFERENCES "public"."comanda_itens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendas_itens"
    ADD CONSTRAINT "vendas_itens_id_produto_fkey" FOREIGN KEY ("id_produto") REFERENCES "public"."produtos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendas_itens"
    ADD CONSTRAINT "vendas_itens_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_itens"
    ADD CONSTRAINT "vendas_itens_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_pagamentos"
    ADD CONSTRAINT "vendas_pagamentos_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_taxas_plataforma"
    ADD CONSTRAINT "vendas_taxas_plataforma_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendas_taxas_plataforma"
    ADD CONSTRAINT "vendas_taxas_plataforma_id_venda_fkey" FOREIGN KEY ("id_venda") REFERENCES "public"."vendas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_onboarding_logs"
    ADD CONSTRAINT "whatsapp_onboarding_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_order_events"
    ADD CONSTRAINT "zelo_order_events_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_order_events"
    ADD CONSTRAINT "zelo_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."zelo_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_order_items"
    ADD CONSTRAINT "zelo_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."zelo_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_order_outbox"
    ADD CONSTRAINT "zelo_order_outbox_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_order_outbox"
    ADD CONSTRAINT "zelo_order_outbox_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."zelo_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelo_orders"
    ADD CONSTRAINT "zelo_orders_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_ai_usage_daily"
    ADD CONSTRAINT "zelochat_ai_usage_daily_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_billing_payments"
    ADD CONSTRAINT "zelochat_billing_payments_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_drivers"
    ADD CONSTRAINT "zelochat_drivers_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_escalation_events"
    ADD CONSTRAINT "zelochat_escalation_events_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_escalation_events"
    ADD CONSTRAINT "zelochat_escalation_events_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."zelochat_escalation_events"
    ADD CONSTRAINT "zelochat_escalation_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelochat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_escalation_events"
    ADD CONSTRAINT "zelochat_escalation_events_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."zelochat_triggers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."zelochat_messages"
    ADD CONSTRAINT "zelochat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelochat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_orders"
    ADD CONSTRAINT "zelochat_orders_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_pending_orders"
    ADD CONSTRAINT "zelochat_pending_orders_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_push_subscriptions"
    ADD CONSTRAINT "zelochat_push_subscriptions_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_quick_responses"
    ADD CONSTRAINT "zelochat_quick_responses_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_response_events"
    ADD CONSTRAINT "zelochat_response_events_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_response_events"
    ADD CONSTRAINT "zelochat_response_events_incoming_message_id_fkey" FOREIGN KEY ("incoming_message_id") REFERENCES "public"."zelochat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_response_events"
    ADD CONSTRAINT "zelochat_response_events_response_message_id_fkey" FOREIGN KEY ("response_message_id") REFERENCES "public"."zelochat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_response_events"
    ADD CONSTRAINT "zelochat_response_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelochat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_session_tags"
    ADD CONSTRAINT "zelochat_session_tags_session_empresa_fk" FOREIGN KEY ("session_id", "empresa_id") REFERENCES "public"."zelochat_sessions"("id", "empresa_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_session_tags"
    ADD CONSTRAINT "zelochat_session_tags_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelochat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_session_tags"
    ADD CONSTRAINT "zelochat_session_tags_tag_empresa_fk" FOREIGN KEY ("tag_id", "empresa_id") REFERENCES "public"."zelochat_tags"("id", "empresa_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_session_tags"
    ADD CONSTRAINT "zelochat_session_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."zelochat_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_tags"
    ADD CONSTRAINT "zelochat_tags_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelochat_triggers"
    ADD CONSTRAINT "zelochat_triggers_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_cart_sessions"
    ADD CONSTRAINT "zelomenu_cart_sessions_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "public"."zelomenu_table_capabilities"("id");



ALTER TABLE ONLY "public"."zelomenu_cart_sessions"
    ADD CONSTRAINT "zelomenu_cart_sessions_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_cart_tokens"
    ADD CONSTRAINT "zelomenu_cart_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelomenu_cart_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_coupon_redemptions"
    ADD CONSTRAINT "zelomenu_coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."zelomenu_coupons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_coupon_redemptions"
    ADD CONSTRAINT "zelomenu_coupon_redemptions_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_coupon_redemptions"
    ADD CONSTRAINT "zelomenu_coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."zelo_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."zelomenu_coupons"
    ADD CONSTRAINT "zelomenu_coupons_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_distance_cache"
    ADD CONSTRAINT "zelomenu_delivery_distance_cache_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_pricing_rule_ranges"
    ADD CONSTRAINT "zelomenu_delivery_pricing_rule_ranges_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."zelomenu_delivery_pricing_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_pricing_rules"
    ADD CONSTRAINT "zelomenu_delivery_pricing_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_quote_requests"
    ADD CONSTRAINT "zelomenu_delivery_quote_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_quote_requests"
    ADD CONSTRAINT "zelomenu_delivery_quote_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."zelomenu_cart_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_delivery_ranges"
    ADD CONSTRAINT "zelomenu_delivery_ranges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_groups"
    ADD CONSTRAINT "zelomenu_modifier_groups_id_produto_fkey" FOREIGN KEY ("id_produto") REFERENCES "public"."produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_groups"
    ADD CONSTRAINT "zelomenu_modifier_groups_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_option_products"
    ADD CONSTRAINT "zelomenu_modifier_option_products_id_opcao_fkey" FOREIGN KEY ("id_opcao") REFERENCES "public"."zelomenu_modifier_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_option_products"
    ADD CONSTRAINT "zelomenu_modifier_option_products_id_produto_fkey" FOREIGN KEY ("id_produto") REFERENCES "public"."produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_option_products"
    ADD CONSTRAINT "zelomenu_modifier_option_products_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_options"
    ADD CONSTRAINT "zelomenu_modifier_options_id_grupo_fkey" FOREIGN KEY ("id_grupo") REFERENCES "public"."zelomenu_modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_modifier_options"
    ADD CONSTRAINT "zelomenu_modifier_options_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_product_publications"
    ADD CONSTRAINT "zelomenu_product_publications_id_produto_fkey" FOREIGN KEY ("id_produto") REFERENCES "public"."produtos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_product_publications"
    ADD CONSTRAINT "zelomenu_product_publications_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zelomenu_table_capabilities"
    ADD CONSTRAINT "zelomenu_table_capabilities_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa_perfil"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can view all activity logs" ON "public"."admin_activity_logs" FOR SELECT USING (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true))));



CREATE POLICY "Admins can view all campaigns" ON "public"."email_campaigns" FOR SELECT USING (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true))));



CREATE POLICY "Leitura publica categorias delivery" ON "public"."categorias" FOR SELECT USING (("auth"."uid"() IS NULL));



CREATE POLICY "Only super_admins can access cron_logs" ON "public"."subscription_cron_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "Only super_admins can modify subscriptions" ON "public"."subscriptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true))))));



ALTER TABLE "public"."access_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "access_audit_logs_insert" ON "public"."access_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("operator_user_id" = "auth"."uid"()) AND ("owner_user_id" = "public"."get_owner_user_id"("auth"."uid"()))));



CREATE POLICY "access_audit_logs_owner_select" ON "public"."access_audit_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."access_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "access_roles_owner" ON "public"."access_roles" TO "authenticated" USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "access_roles_subuser_select" ON "public"."access_roles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."access_users" "au"
  WHERE (("au"."role_id" = "access_roles"."id") AND ("au"."auth_user_id" = "auth"."uid"()) AND ("au"."status" = 'active'::"text")))));



CREATE POLICY "access_roles_super_admin_select" ON "public"."access_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true))));



ALTER TABLE "public"."access_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "access_settings_owner" ON "public"."access_settings" TO "authenticated" USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."access_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "access_users_owner" ON "public"."access_users" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "owner_user_id") AND ("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "owner_user_id") AND ("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "access_users_self_select" ON "public"."access_users" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "auth_user_id"));



CREATE POLICY "access_users_super_admin_select" ON "public"."access_users" FOR SELECT TO "authenticated" USING (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true))));



ALTER TABLE "public"."account_deletion_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "account_deletion_log_admin_read" ON "public"."account_deletion_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



ALTER TABLE "public"."admin_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_company_metric_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_company_metric_settings_delete" ON "public"."admin_company_metric_settings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_company_metric_settings_insert" ON "public"."admin_company_metric_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_company_metric_settings_select" ON "public"."admin_company_metric_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_company_metric_settings_update" ON "public"."admin_company_metric_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sa"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sa"."is_active" = true)))));



ALTER TABLE "public"."admin_finance_fixed_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_finance_fixed_expenses_delete" ON "public"."admin_finance_fixed_expenses" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_finance_fixed_expenses_insert" ON "public"."admin_finance_fixed_expenses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_finance_fixed_expenses_select" ON "public"."admin_finance_fixed_expenses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "admin_finance_fixed_expenses_update" ON "public"."admin_finance_fixed_expenses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_payments_self_insert" ON "public"."billing_payments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "billing_payments_self_select" ON "public"."billing_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."billing_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "block_anon_zelomenu_delivery_cep_cache" ON "public"."zelomenu_delivery_cep_cache" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_distance_cache" ON "public"."zelomenu_delivery_distance_cache" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_geocoding_cache" ON "public"."zelomenu_delivery_geocoding_cache" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_pricing_rule_ranges" ON "public"."zelomenu_delivery_pricing_rule_ranges" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_pricing_rules" ON "public"."zelomenu_delivery_pricing_rules" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_quote_requests" ON "public"."zelomenu_delivery_quote_requests" AS RESTRICTIVE USING (false) WITH CHECK (false);



CREATE POLICY "block_anon_zelomenu_delivery_ranges" ON "public"."zelomenu_delivery_ranges" AS RESTRICTIVE USING (false) WITH CHECK (false);



ALTER TABLE "public"."business_daily_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_intelligence_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_signals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_signals_select_owner" ON "public"."business_signals" FOR SELECT TO "authenticated" USING ((("user_id" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('relatorios.ver'::"text", "user_id")));



CREATE POLICY "business_signals_update_read" ON "public"."business_signals" FOR UPDATE TO "authenticated" USING ((("user_id" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('relatorios.ver'::"text", "user_id"))) WITH CHECK ((("user_id" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('relatorios.ver'::"text", "user_id")));



CREATE POLICY "business_snapshots_select_owner" ON "public"."business_daily_snapshots" FOR SELECT TO "authenticated" USING ((("user_id" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('relatorios.ver'::"text", "user_id")));



ALTER TABLE "public"."caixa_fechamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caixa_fechamentos_actor_insert" ON "public"."caixa_fechamentos" FOR INSERT TO "authenticated" WITH CHECK ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('caixa.fechar'::"text", "id_usuario")));



CREATE POLICY "caixa_fechamentos_actor_select" ON "public"."caixa_fechamentos" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('relatorios.ver'::"text", "id_usuario")));



ALTER TABLE "public"."caixa_movimentacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caixa_movs_actor_insert" ON "public"."caixa_movimentacoes" FOR INSERT TO "authenticated" WITH CHECK ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('caixa.movimentar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."caixas" "c"
  WHERE (("c"."id" = "caixa_movimentacoes"."id_caixa") AND ("c"."id_usuario" = "caixa_movimentacoes"."id_usuario") AND ("c"."data_fechamento" IS NULL))))));



CREATE POLICY "caixa_movs_actor_select" ON "public"."caixa_movimentacoes" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND ("public"."fiado_actor_can"('pdv.acessar'::"text", "id_usuario") OR "public"."fiado_actor_can"('caixa.ver'::"text", "id_usuario") OR "public"."fiado_actor_can"('caixa.abrir'::"text", "id_usuario") OR "public"."fiado_actor_can"('caixa.fechar'::"text", "id_usuario") OR "public"."fiado_actor_can"('caixa.movimentar'::"text", "id_usuario") OR "public"."fiado_actor_can"('relatorios.ver'::"text", "id_usuario"))));



ALTER TABLE "public"."caixas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "caixas_actor_delete" ON "public"."caixas" FOR DELETE TO "authenticated" USING (("id_usuario" = "auth"."uid"()));



CREATE POLICY "caixas_actor_insert" ON "public"."caixas" FOR INSERT TO "authenticated" WITH CHECK ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('caixa.abrir'::"text", "id_usuario")));



CREATE POLICY "caixas_actor_select" ON "public"."caixas" FOR SELECT USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "caixas_actor_update" ON "public"."caixas" FOR UPDATE TO "authenticated" USING ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('caixa.fechar'::"text", "id_usuario"))) WITH CHECK ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('caixa.fechar'::"text", "id_usuario")));



ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categorias_actor_delete" ON "public"."categorias" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "categorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "categorias_actor_insert" ON "public"."categorias" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "categorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "categorias_actor_select" ON "public"."categorias" FOR SELECT USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") OR ("auth"."uid"() IS NULL)));



CREATE POLICY "categorias_actor_update" ON "public"."categorias" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "categorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb"))))))) WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "categorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



ALTER TABLE "public"."comanda_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comanda_itens_actor_delete" ON "public"."comanda_itens" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."comandas" "c"
  WHERE (("c"."id" = "comanda_itens"."id_comanda") AND ("c"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('mesas.editar_itens'::"text", "c"."id_usuario")))));



CREATE POLICY "comanda_itens_actor_insert" ON "public"."comanda_itens" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."comandas" "c"
  WHERE (("c"."id" = "comanda_itens"."id_comanda") AND ("c"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('mesas.editar_itens'::"text", "c"."id_usuario")))));



CREATE POLICY "comanda_itens_actor_select" ON "public"."comanda_itens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."comandas" "c"
  WHERE (("c"."id" = "comanda_itens"."id_comanda") AND ("c"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('mesas.acessar'::"text", "c"."id_usuario")))));



CREATE POLICY "comanda_itens_actor_update" ON "public"."comanda_itens" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."comandas" "c"
  WHERE (("c"."id" = "comanda_itens"."id_comanda") AND ("c"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('mesas.editar_itens'::"text", "c"."id_usuario"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."comandas" "c"
  WHERE (("c"."id" = "comanda_itens"."id_comanda") AND ("c"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('mesas.editar_itens'::"text", "c"."id_usuario")))));



ALTER TABLE "public"."comanda_pagamento_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comanda_pagamento_itens_delete" ON "public"."comanda_pagamento_itens" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



CREATE POLICY "comanda_pagamento_itens_insert" ON "public"."comanda_pagamento_itens" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



CREATE POLICY "comanda_pagamento_itens_select" ON "public"."comanda_pagamento_itens" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "comanda_pagamento_itens_update" ON "public"."comanda_pagamento_itens" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario")))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



ALTER TABLE "public"."comanda_pagamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comanda_pagamentos_actor_delete" ON "public"."comanda_pagamentos" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



CREATE POLICY "comanda_pagamentos_actor_insert" ON "public"."comanda_pagamentos" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



CREATE POLICY "comanda_pagamentos_actor_select" ON "public"."comanda_pagamentos" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "comanda_pagamentos_actor_update" ON "public"."comanda_pagamentos" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario")))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") AND ("public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('pedidos.receber'::"text", "id_usuario"))));



ALTER TABLE "public"."comandas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comandas_actor_delete" ON "public"."comandas" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.cancelar'::"text", "id_usuario")));



CREATE POLICY "comandas_actor_insert" ON "public"."comandas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.abrir_comanda'::"text", "id_usuario")));



CREATE POLICY "comandas_actor_select" ON "public"."comandas" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND ("public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") OR "public"."fiado_actor_can"('relatorios.ver'::"text", "id_usuario"))));



CREATE POLICY "comandas_actor_update" ON "public"."comandas" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "delete_own_empresa_perfil" ON "public"."empresa_perfil" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_super_admins" ON "public"."super_admins" FOR DELETE TO "authenticated" USING (("auth"."uid"() IN ( SELECT "super_admins_1"."user_id"
   FROM "public"."super_admins" "super_admins_1"
  WHERE ("super_admins_1"."is_active" = true))));



ALTER TABLE "public"."email_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_onboarding_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."empresa_perfil" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_perfil_actor_select" ON "public"."empresa_perfil" FOR SELECT USING ((("public"."get_owner_user_id"("auth"."uid"()) = "user_id") OR ("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true)))));



ALTER TABLE "public"."empresa_usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresa_usuarios_delete" ON "public"."empresa_usuarios" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu2"
  WHERE (("eu2"."id_empresa" = "empresa_usuarios"."id_empresa") AND ("eu2"."id_usuario" = "auth"."uid"()) AND ("eu2"."role" = 'admin'::"text")))));



CREATE POLICY "empresa_usuarios_insert" ON "public"."empresa_usuarios" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu2"
  WHERE (("eu2"."id_empresa" = "empresa_usuarios"."id_empresa") AND ("eu2"."id_usuario" = "auth"."uid"()) AND ("eu2"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."empresas" "e"
  WHERE (("e"."id" = "empresa_usuarios"."id_empresa") AND ("e"."id_owner" = "auth"."uid"()))))));



CREATE POLICY "empresa_usuarios_select" ON "public"."empresa_usuarios" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu2"
  WHERE (("eu2"."id_empresa" = "empresa_usuarios"."id_empresa") AND ("eu2"."id_usuario" = "auth"."uid"())))));



CREATE POLICY "empresa_usuarios_update" ON "public"."empresa_usuarios" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu2"
  WHERE (("eu2"."id_empresa" = "empresa_usuarios"."id_empresa") AND ("eu2"."id_usuario" = "auth"."uid"()) AND ("eu2"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu2"
  WHERE (("eu2"."id_empresa" = "empresa_usuarios"."id_empresa") AND ("eu2"."id_usuario" = "auth"."uid"()) AND ("eu2"."role" = 'admin'::"text")))));



ALTER TABLE "public"."empresas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresas_delete" ON "public"."empresas" FOR DELETE USING ((("id_owner" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu"
  WHERE (("eu"."id_empresa" = "empresas"."id") AND ("eu"."id_usuario" = "auth"."uid"()) AND ("eu"."role" = 'admin'::"text"))))));



CREATE POLICY "empresas_insert" ON "public"."empresas" FOR INSERT WITH CHECK (("id_owner" = "auth"."uid"()));



CREATE POLICY "empresas_select" ON "public"."empresas" FOR SELECT USING ((("id_owner" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu"
  WHERE (("eu"."id_empresa" = "empresas"."id") AND ("eu"."id_usuario" = "auth"."uid"()))))));



CREATE POLICY "empresas_update" ON "public"."empresas" FOR UPDATE USING ((("id_owner" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu"
  WHERE (("eu"."id_empresa" = "empresas"."id") AND ("eu"."id_usuario" = "auth"."uid"()) AND ("eu"."role" = 'admin'::"text")))))) WITH CHECK ((("id_owner" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."empresa_usuarios" "eu"
  WHERE (("eu"."id_empresa" = "empresas"."id") AND ("eu"."id_usuario" = "auth"."uid"()) AND ("eu"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_actor_delete" ON "public"."expenses" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "user_id") AND ((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON (("ar"."id" = "au"."role_id")))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "expenses"."user_id") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"despesas.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "expenses_actor_insert" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "user_id") AND ((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON (("ar"."id" = "au"."role_id")))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "expenses"."user_id") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"despesas.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "expenses_actor_select" ON "public"."expenses" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "user_id") AND ((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON (("ar"."id" = "au"."role_id")))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "expenses"."user_id") AND ("au"."status" = 'active'::"text") AND (("ar"."permissions" @> '{"despesas.visualizar": true}'::"jsonb") OR ("ar"."permissions" @> '{"despesas.gerenciar": true}'::"jsonb"))))))));



CREATE POLICY "expenses_actor_update" ON "public"."expenses" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "user_id") AND ((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON (("ar"."id" = "au"."role_id")))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "expenses"."user_id") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"despesas.gerenciar": true}'::"jsonb"))))))) WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "user_id") AND ((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON (("ar"."id" = "au"."role_id")))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "expenses"."user_id") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"despesas.gerenciar": true}'::"jsonb")))))));



ALTER TABLE "public"."fiado_lancamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fiado_lancamentos_select_owner" ON "public"."fiado_lancamentos" FOR SELECT TO "authenticated" USING ((("id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('fiado.visualizar'::"text", "id_usuario")));



CREATE POLICY "insert_own_empresa_perfil" ON "public"."empresa_perfil" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."lead_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mesas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mesas_actor_delete" ON "public"."mesas" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "mesas_actor_insert" ON "public"."mesas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "mesas_actor_select" ON "public"."mesas" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "mesas_actor_update" ON "public"."mesas" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario")));



CREATE POLICY "modify_empresa_perfil" ON "public"."empresa_perfil" TO "authenticated" USING (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true)))) WITH CHECK (("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true))));



CREATE POLICY "modify_super_admins" ON "public"."super_admins" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IN ( SELECT "super_admins_1"."user_id"
   FROM "public"."super_admins" "super_admins_1"
  WHERE ("super_admins_1"."is_active" = true))));



ALTER TABLE "public"."onboarding_communication_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outreach_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pessoas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pessoas_actor_delete" ON "public"."pessoas" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('pessoas.gerenciar'::"text", "id_usuario")));



CREATE POLICY "pessoas_actor_insert" ON "public"."pessoas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('pessoas.gerenciar'::"text", "id_usuario")));



CREATE POLICY "pessoas_actor_select" ON "public"."pessoas" FOR SELECT USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "pessoas_actor_update" ON "public"."pessoas" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('pessoas.gerenciar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('pessoas.gerenciar'::"text", "id_usuario")));



ALTER TABLE "public"."product_usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "produtos_actor_delete" ON "public"."produtos" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "produtos"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "produtos_actor_insert" ON "public"."produtos" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "produtos"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "produtos_actor_select" ON "public"."produtos" FOR SELECT USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "produtos_actor_update" ON "public"."produtos" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "produtos"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb"))))))) WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "produtos"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



ALTER TABLE "public"."referral_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_rewards_owner_select" ON "public"."referral_rewards" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "empresa_id") OR (EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true))))));



ALTER TABLE "public"."referral_trigger_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_trigger_events_owner" ON "public"."referral_trigger_events" TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "empresa_id")) WITH CHECK (("public"."get_owner_user_id"("auth"."uid"()) = "empresa_id"));



ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referrals_owner_select" ON "public"."referrals" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "referrer_empresa_id") OR ("public"."get_owner_user_id"("auth"."uid"()) = "referred_empresa_id") OR (EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true))))));



ALTER TABLE "public"."registration_nudges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_empresa_perfil" ON "public"."empresa_perfil" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("auth"."uid"() IN ( SELECT "super_admins"."user_id"
   FROM "public"."super_admins"
  WHERE ("super_admins"."is_active" = true)))));



CREATE POLICY "select_super_admins" ON "public"."super_admins" FOR SELECT TO "authenticated" USING (((("auth"."uid"() = "user_id") AND ("is_active" = true)) OR "public"."is_active_super_admin"()));



CREATE POLICY "service_role_full_access" ON "public"."ai_usage_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."subcategorias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subcategorias_actor_delete" ON "public"."subcategorias" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "subcategorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "subcategorias_actor_insert" ON "public"."subcategorias" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "subcategorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



CREATE POLICY "subcategorias_actor_select" ON "public"."subcategorias" FOR SELECT USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "subcategorias_actor_update" ON "public"."subcategorias" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "subcategorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb"))))))) WITH CHECK ((("public"."get_owner_user_id"(( SELECT "auth"."uid"() AS "uid")) = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR (EXISTS ( SELECT 1
   FROM ("public"."access_users" "au"
     JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
  WHERE (("au"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("au"."owner_user_id" = "subcategorias"."id_usuario") AND ("au"."status" = 'active'::"text") AND ("ar"."permissions" @> '{"produtos.gerenciar": true}'::"jsonb")))))));



ALTER TABLE "public"."subscription_cron_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_self_select" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "subscriptions_service_upsert" ON "public"."subscriptions" FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "subscriptions_subuser_read" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "user_id"));



ALTER TABLE "public"."super_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppression_list" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_own_empresa_perfil" ON "public"."empresa_perfil" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_super_admins" ON "public"."super_admins" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IN ( SELECT "super_admins_1"."user_id"
   FROM "public"."super_admins" "super_admins_1"
  WHERE ("super_admins_1"."is_active" = true))));



CREATE POLICY "users_insert_own_logs" ON "public"."ai_usage_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_read_own_logs" ON "public"."ai_usage_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."vendas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendas_actor_delete" ON "public"."vendas" FOR DELETE TO "authenticated" USING ("public"."vendas_actor_can_delete"("id"));



CREATE POLICY "vendas_actor_insert" ON "public"."vendas" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND (("public"."fiado_actor_can"('pdv.vender'::"text", "id_usuario") AND "public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario")) OR (("tipo_pedido" = 'mesa'::"text") AND "public"."fiado_actor_can"('mesas.fechar'::"text", "id_usuario")))));



CREATE POLICY "vendas_actor_select" ON "public"."vendas" FOR SELECT TO "authenticated" USING (((( SELECT "public"."get_owner_user_id"("auth"."uid"()) AS "get_owner_user_id") = "id_usuario") AND ((( SELECT "auth"."uid"() AS "uid") = "id_usuario") OR ( SELECT (EXISTS ( SELECT 1
           FROM ("public"."access_users" "au"
             JOIN "public"."access_roles" "ar" ON ((("ar"."id" = "au"."role_id") AND ("ar"."owner_user_id" = "au"."owner_user_id"))))
          WHERE (("au"."auth_user_id" = "auth"."uid"()) AND ("au"."owner_user_id" = "public"."get_owner_user_id"("auth"."uid"())) AND ("au"."status" = 'active'::"text") AND (COALESCE((("ar"."permissions" ->> 'pdv.acessar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'pdv.vender'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'pdv.receber'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'pdv.cancelar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'mesas.acessar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'mesas.fechar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'caixa.abrir'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'caixa.fechar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'caixa.movimentar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'caixa.ver'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'relatorios.ver'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'relatorios.exportar'::"text"))::boolean, false) OR COALESCE((("ar"."permissions" ->> 'fiado.visualizar'::"text"))::boolean, false))))) AS "exists"))));



CREATE POLICY "vendas_actor_update" ON "public"."vendas" FOR UPDATE TO "authenticated" USING ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario")) WITH CHECK ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario"));



ALTER TABLE "public"."vendas_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendas_itens_actor_delete" ON "public"."vendas_itens" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_itens"."id_venda") AND "public"."fiado_actor_can"('pdv.cancelar'::"text", "v"."id_usuario")))));



CREATE POLICY "vendas_itens_actor_insert" ON "public"."vendas_itens" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_itens"."id_venda") AND ("v"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND (("public"."fiado_actor_can"('pdv.vender'::"text", "v"."id_usuario") AND "public"."fiado_actor_can"('pdv.receber'::"text", "v"."id_usuario")) OR (("v"."tipo_pedido" = 'mesa'::"text") AND "public"."fiado_actor_can"('mesas.fechar'::"text", "v"."id_usuario")))))));



CREATE POLICY "vendas_itens_actor_select" ON "public"."vendas_itens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_itens"."id_venda") AND ("v"."id_usuario" = ( SELECT "public"."get_owner_user_id"("auth"."uid"()) AS "get_owner_user_id"))))));



CREATE POLICY "vendas_itens_actor_update" ON "public"."vendas_itens" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_itens"."id_venda") AND "public"."fiado_actor_can"('pdv.cancelar'::"text", "v"."id_usuario"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_itens"."id_venda") AND "public"."fiado_actor_can"('pdv.cancelar'::"text", "v"."id_usuario")))));



ALTER TABLE "public"."vendas_pagamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendas_pagamentos_actor_delete" ON "public"."vendas_pagamentos" FOR DELETE TO "authenticated" USING ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario"));



CREATE POLICY "vendas_pagamentos_actor_insert" ON "public"."vendas_pagamentos" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_pagamentos"."id_venda") AND ("v"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND (("public"."fiado_actor_can"('pdv.vender'::"text", "v"."id_usuario") AND "public"."fiado_actor_can"('pdv.receber'::"text", "v"."id_usuario")) OR (("v"."tipo_pedido" = 'mesa'::"text") AND "public"."fiado_actor_can"('mesas.fechar'::"text", "v"."id_usuario")))))) AND ("id_usuario" = "public"."get_owner_user_id"("auth"."uid"()))));



CREATE POLICY "vendas_pagamentos_actor_select" ON "public"."vendas_pagamentos" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND ("public"."fiado_actor_can"('pdv.acessar'::"text", "id_usuario") OR "public"."fiado_actor_can"('pdv.receber'::"text", "id_usuario") OR "public"."fiado_actor_can"('mesas.acessar'::"text", "id_usuario") OR "public"."fiado_actor_can"('caixa.ver'::"text", "id_usuario") OR "public"."fiado_actor_can"('relatorios.ver'::"text", "id_usuario"))));



CREATE POLICY "vendas_pagamentos_actor_update" ON "public"."vendas_pagamentos" FOR UPDATE TO "authenticated" USING ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario")) WITH CHECK ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario"));



CREATE POLICY "vendas_taxas_actor_delete" ON "public"."vendas_taxas_plataforma" FOR DELETE TO "authenticated" USING ("public"."fiado_actor_can"('pdv.cancelar'::"text", "id_usuario"));



CREATE POLICY "vendas_taxas_actor_select" ON "public"."vendas_taxas_plataforma" FOR SELECT TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND ("public"."fiado_actor_can"('caixa.ver'::"text", "id_usuario") OR "public"."fiado_actor_can"('relatorios.ver'::"text", "id_usuario"))));



ALTER TABLE "public"."vendas_taxas_plataforma" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendas_taxas_plataforma_insert_own" ON "public"."vendas_taxas_plataforma" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."vendas" "v"
  WHERE (("v"."id" = "vendas_taxas_plataforma"."id_venda") AND ("v"."id_usuario" = "public"."get_owner_user_id"("auth"."uid"())) AND "public"."fiado_actor_can"('pdv.vender'::"text", "v"."id_usuario") AND "public"."fiado_actor_can"('pdv.receber'::"text", "v"."id_usuario")))) AND ("id_usuario" = "public"."get_owner_user_id"("auth"."uid"()))));



ALTER TABLE "public"."webhook_events_processed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_events_processed_service_insert" ON "public"."webhook_events_processed" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."whatsapp_onboarding_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_onboarding_logs_delete_own" ON "public"."whatsapp_onboarding_logs" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "whatsapp_onboarding_logs_insert_own" ON "public"."whatsapp_onboarding_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "whatsapp_onboarding_logs_select_own" ON "public"."whatsapp_onboarding_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "whatsapp_onboarding_logs_update_own" ON "public"."whatsapp_onboarding_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."zelo_order_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelo_order_events_owner_select" ON "public"."zelo_order_events" FOR SELECT TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "public"."get_owner_user_id"("auth"."uid"())))));



ALTER TABLE "public"."zelo_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelo_order_items_owner_select" ON "public"."zelo_order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."zelo_orders" "o"
  WHERE (("o"."id" = "zelo_order_items"."order_id") AND ("o"."empresa_id" IN ( SELECT "empresa_perfil"."id"
           FROM "public"."empresa_perfil"
          WHERE ("empresa_perfil"."user_id" = "public"."get_owner_user_id"("auth"."uid"()))))))));



ALTER TABLE "public"."zelo_order_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelo_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelo_orders_owner_select" ON "public"."zelo_orders" FOR SELECT TO "authenticated" USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "public"."get_owner_user_id"("auth"."uid"())))));



ALTER TABLE "public"."zelochat_ai_usage_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_ai_usage_daily_select_by_super_admin" ON "public"."zelochat_ai_usage_daily" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins"
  WHERE (("super_admins"."user_id" = "auth"."uid"()) AND ("super_admins"."is_active" = true)))));



ALTER TABLE "public"."zelochat_billing_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_billing_payments_select_own" ON "public"."zelochat_billing_payments" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."zelochat_billing_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelochat_drivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_drivers_delete_own_empresa" ON "public"."zelochat_drivers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_drivers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_drivers_insert_own_empresa" ON "public"."zelochat_drivers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_drivers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_drivers_select_own_empresa" ON "public"."zelochat_drivers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_drivers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_drivers_update_own_empresa" ON "public"."zelochat_drivers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_drivers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_drivers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."zelochat_email_onboarding_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelochat_escalation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_escalation_events_delete" ON "public"."zelochat_escalation_events" FOR DELETE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_escalation_events_insert" ON "public"."zelochat_escalation_events" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_escalation_events_select" ON "public"."zelochat_escalation_events" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_escalation_events_update" ON "public"."zelochat_escalation_events" FOR UPDATE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_messages_delete_by_empresa" ON "public"."zelochat_messages" FOR DELETE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_messages_insert_by_empresa" ON "public"."zelochat_messages" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_messages_select_by_empresa" ON "public"."zelochat_messages" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_messages_update_by_empresa" ON "public"."zelochat_messages" FOR UPDATE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_orders_empresa_owner" ON "public"."zelochat_orders" USING (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_pending_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_pending_orders_delete_by_empresa" ON "public"."zelochat_pending_orders" FOR DELETE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_pending_orders_insert_by_empresa" ON "public"."zelochat_pending_orders" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_pending_orders_select_by_empresa" ON "public"."zelochat_pending_orders" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_pending_orders_update_by_empresa" ON "public"."zelochat_pending_orders" FOR UPDATE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_push_subscriptions_empresa_owner" ON "public"."zelochat_push_subscriptions" USING (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_qr_delete_own_empresa" ON "public"."zelochat_quick_responses" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_quick_responses"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_qr_insert_own_empresa" ON "public"."zelochat_quick_responses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_quick_responses"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_qr_select_own_empresa" ON "public"."zelochat_quick_responses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_quick_responses"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_qr_update_own_empresa" ON "public"."zelochat_quick_responses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_quick_responses"."empresa_id") AND ("ep"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_quick_responses"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."zelochat_quick_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelochat_response_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_response_events_insert_by_empresa" ON "public"."zelochat_response_events" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_response_events_select_by_empresa" ON "public"."zelochat_response_events" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_session_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_session_tags_empresa_owner" ON "public"."zelochat_session_tags" USING (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_sessions_delete_by_empresa" ON "public"."zelochat_sessions" FOR DELETE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_sessions_insert_by_empresa" ON "public"."zelochat_sessions" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_sessions_select_by_empresa" ON "public"."zelochat_sessions" FOR SELECT USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



CREATE POLICY "zelochat_sessions_update_by_empresa" ON "public"."zelochat_sessions" FOR UPDATE USING (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_tags_empresa_owner" ON "public"."zelochat_tags" USING (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" = ( SELECT "empresa_perfil"."id"
   FROM "public"."empresa_perfil"
  WHERE ("empresa_perfil"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."zelochat_triggers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelochat_triggers_delete_own_empresa" ON "public"."zelochat_triggers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_triggers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_triggers_insert_own_empresa" ON "public"."zelochat_triggers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_triggers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_triggers_select_own_empresa" ON "public"."zelochat_triggers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_triggers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelochat_triggers_update_own_empresa" ON "public"."zelochat_triggers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_triggers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelochat_triggers"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."zelochat_webhook_events_raw" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelochat_whatsapp_onboarding_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_cart_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_cart_sessions_delete_by_empresa" ON "public"."zelomenu_cart_sessions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelomenu_cart_sessions"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_sessions_insert_by_empresa" ON "public"."zelomenu_cart_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelomenu_cart_sessions"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_sessions_select_by_empresa" ON "public"."zelomenu_cart_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelomenu_cart_sessions"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_sessions_update_by_empresa" ON "public"."zelomenu_cart_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelomenu_cart_sessions"."empresa_id") AND ("ep"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresa_perfil" "ep"
  WHERE (("ep"."id" = "zelomenu_cart_sessions"."empresa_id") AND ("ep"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."zelomenu_cart_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_cart_tokens_delete_by_empresa" ON "public"."zelomenu_cart_tokens" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."zelomenu_cart_sessions" "sessions"
     JOIN "public"."empresa_perfil" "ep" ON (("ep"."id" = "sessions"."empresa_id")))
  WHERE (("sessions"."id" = "zelomenu_cart_tokens"."session_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_tokens_insert_by_empresa" ON "public"."zelomenu_cart_tokens" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."zelomenu_cart_sessions" "sessions"
     JOIN "public"."empresa_perfil" "ep" ON (("ep"."id" = "sessions"."empresa_id")))
  WHERE (("sessions"."id" = "zelomenu_cart_tokens"."session_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_tokens_select_by_empresa" ON "public"."zelomenu_cart_tokens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."zelomenu_cart_sessions" "sessions"
     JOIN "public"."empresa_perfil" "ep" ON (("ep"."id" = "sessions"."empresa_id")))
  WHERE (("sessions"."id" = "zelomenu_cart_tokens"."session_id") AND ("ep"."user_id" = "auth"."uid"())))));



CREATE POLICY "zelomenu_cart_tokens_update_by_empresa" ON "public"."zelomenu_cart_tokens" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."zelomenu_cart_sessions" "sessions"
     JOIN "public"."empresa_perfil" "ep" ON (("ep"."id" = "sessions"."empresa_id")))
  WHERE (("sessions"."id" = "zelomenu_cart_tokens"."session_id") AND ("ep"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."zelomenu_cart_sessions" "sessions"
     JOIN "public"."empresa_perfil" "ep" ON (("ep"."id" = "sessions"."empresa_id")))
  WHERE (("sessions"."id" = "zelomenu_cart_tokens"."session_id") AND ("ep"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."zelomenu_coupon_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_coupon_redemptions_actor_delete" ON "public"."zelomenu_coupon_redemptions" FOR DELETE TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupon_redemptions_actor_insert" ON "public"."zelomenu_coupon_redemptions" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupon_redemptions_actor_select" ON "public"."zelomenu_coupon_redemptions" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupon_redemptions_actor_update" ON "public"."zelomenu_coupon_redemptions" FOR UPDATE TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario")) WITH CHECK (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



ALTER TABLE "public"."zelomenu_coupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_coupons_actor_delete" ON "public"."zelomenu_coupons" FOR DELETE TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupons_actor_insert" ON "public"."zelomenu_coupons" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupons_actor_select" ON "public"."zelomenu_coupons" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_coupons_actor_update" ON "public"."zelomenu_coupons" FOR UPDATE TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario")) WITH CHECK (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



ALTER TABLE "public"."zelomenu_delivery_cep_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_distance_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_geocoding_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_pricing_rule_ranges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_pricing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_quote_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_delivery_ranges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_modifier_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_modifier_groups_actor_delete" ON "public"."zelomenu_modifier_groups" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario")));



CREATE POLICY "zelomenu_modifier_groups_actor_insert" ON "public"."zelomenu_modifier_groups" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_modifier_groups"."id_produto") AND ("p"."id_usuario" = "zelomenu_modifier_groups"."id_usuario"))))));



CREATE POLICY "zelomenu_modifier_groups_actor_select" ON "public"."zelomenu_modifier_groups" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_modifier_groups_actor_update" ON "public"."zelomenu_modifier_groups" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_modifier_groups"."id_produto") AND ("p"."id_usuario" = "zelomenu_modifier_groups"."id_usuario"))))));



ALTER TABLE "public"."zelomenu_modifier_option_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_modifier_option_products_actor_delete" ON "public"."zelomenu_modifier_option_products" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario")));



CREATE POLICY "zelomenu_modifier_option_products_actor_insert" ON "public"."zelomenu_modifier_option_products" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."zelomenu_modifier_options" "o"
  WHERE (("o"."id" = "zelomenu_modifier_option_products"."id_opcao") AND ("o"."id_usuario" = "zelomenu_modifier_option_products"."id_usuario")))) AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_modifier_option_products"."id_produto") AND ("p"."id_usuario" = "zelomenu_modifier_option_products"."id_usuario"))))));



CREATE POLICY "zelomenu_modifier_option_products_actor_select" ON "public"."zelomenu_modifier_option_products" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_modifier_option_products_actor_update" ON "public"."zelomenu_modifier_option_products" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."zelomenu_modifier_options" "o"
  WHERE (("o"."id" = "zelomenu_modifier_option_products"."id_opcao") AND ("o"."id_usuario" = "zelomenu_modifier_option_products"."id_usuario")))) AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_modifier_option_products"."id_produto") AND ("p"."id_usuario" = "zelomenu_modifier_option_products"."id_usuario"))))));



ALTER TABLE "public"."zelomenu_modifier_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_modifier_options_actor_delete" ON "public"."zelomenu_modifier_options" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario")));



CREATE POLICY "zelomenu_modifier_options_actor_insert" ON "public"."zelomenu_modifier_options" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."zelomenu_modifier_groups" "g"
  WHERE (("g"."id" = "zelomenu_modifier_options"."id_grupo") AND ("g"."id_usuario" = "zelomenu_modifier_options"."id_usuario"))))));



CREATE POLICY "zelomenu_modifier_options_actor_select" ON "public"."zelomenu_modifier_options" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_modifier_options_actor_update" ON "public"."zelomenu_modifier_options" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."zelomenu_modifier_groups" "g"
  WHERE (("g"."id" = "zelomenu_modifier_options"."id_grupo") AND ("g"."id_usuario" = "zelomenu_modifier_options"."id_usuario"))))));



ALTER TABLE "public"."zelomenu_product_publications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zelomenu_product_publications_actor_delete" ON "public"."zelomenu_product_publications" FOR DELETE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario")));



CREATE POLICY "zelomenu_product_publications_actor_insert" ON "public"."zelomenu_product_publications" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_product_publications"."id_produto") AND ("p"."id_usuario" = "zelomenu_product_publications"."id_usuario"))))));



CREATE POLICY "zelomenu_product_publications_actor_select" ON "public"."zelomenu_product_publications" FOR SELECT TO "authenticated" USING (("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario"));



CREATE POLICY "zelomenu_product_publications_actor_update" ON "public"."zelomenu_product_publications" FOR UPDATE TO "authenticated" USING ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario"))) WITH CHECK ((("public"."get_owner_user_id"("auth"."uid"()) = "id_usuario") AND "public"."fiado_actor_can"('produtos.gerenciar'::"text", "id_usuario") AND (EXISTS ( SELECT 1
   FROM "public"."produtos" "p"
  WHERE (("p"."id" = "zelomenu_product_publications"."id_produto") AND ("p"."id_usuario" = "zelomenu_product_publications"."id_usuario"))))));



ALTER TABLE "public"."zelomenu_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zelomenu_table_capabilities" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_empresa_membro_por_email"("p_id_empresa" integer, "p_email" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_empresa_membro_por_email"("p_id_empresa" integer, "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_empresa_membro_por_email"("p_id_empresa" integer, "p_email" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid", "target_user_email" "text", "action_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid", "target_user_email" "text", "action_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid", "target_user_email" "text", "action_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_extend_subscription"("p_subscription_id" "uuid", "p_months" integer, "p_reason" "text", "p_admin_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_extend_subscription"("p_subscription_id" "uuid", "p_months" integer, "p_reason" "text", "p_admin_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_all_auth_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_all_auth_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_auth_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_sales_counts"("days_ago" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_sales_counts"("days_ago" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_sales_counts"("days_ago" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_total_sales_value"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_total_sales_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_total_sales_value"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_users_last_seen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_users_last_seen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_users_last_seen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_users_without_profile"("min_age_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_users_without_profile"("min_age_hours" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ajustar_estoque_categoria"("p_categoria_id" bigint, "p_estoque" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajustar_estoque_categoria"("p_categoria_id" bigint, "p_estoque" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_estoque_categoria"("p_categoria_id" bigint, "p_estoque" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ajustar_estoque_produto"("p_produto_id" bigint, "p_estoque" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajustar_estoque_produto"("p_produto_id" bigint, "p_estoque" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_estoque_produto"("p_produto_id" bigint, "p_estoque" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_payment" "jsonb", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_payment" "jsonb", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_payment" "jsonb", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."comanda_aplicar_delta_item"("p_id_comanda" "uuid", "p_id_produto" integer, "p_delta" integer, "p_preco_unitario" numeric, "p_modifiers" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comanda_aplicar_delta_item"("p_id_comanda" "uuid", "p_id_produto" integer, "p_delta" integer, "p_preco_unitario" numeric, "p_modifiers" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."comanda_aplicar_delta_item"("p_id_comanda" "uuid", "p_id_produto" integer, "p_delta" integer, "p_preco_unitario" numeric, "p_modifiers" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."comanda_cancelar_com_estoque"("p_id_comanda" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comanda_cancelar_com_estoque"("p_id_comanda" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."comanda_cancelar_com_estoque"("p_id_comanda" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."comanda_garantir_estoque_baixado"("p_id_comanda" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comanda_garantir_estoque_baixado"("p_id_comanda" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."comanda_garantir_estoque_baixado"("p_id_comanda" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."comanda_modifier_stock_requirements"("p_id_produto" bigint, "p_modifiers" "jsonb", "p_item_quantity" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_fill_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_fill_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_fill_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_validate_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_validate_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."comanda_pagamento_itens_validate_quantity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."comandas_mutation_rbac_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."comandas_mutation_rbac_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."comandas_mutation_rbac_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_zelomenu_cart_legacy"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_zelomenu_cart_legacy"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_zelo_order"("p_session_id" "uuid", "p_expected_revision" integer, "p_idempotency_key" "text", "p_snapshots" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_zelo_order"("p_session_id" "uuid", "p_expected_revision" integer, "p_idempotency_key" "text", "p_snapshots" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."criar_venda_completa"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."dashboard_resumo"() TO "anon";
GRANT ALL ON FUNCTION "public"."dashboard_resumo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dashboard_resumo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."deactivate_expired_subscriptions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_expired_subscriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrementar_estoque"("p_id" integer, "p_qtd" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrementar_estoque"("p_id" integer, "p_qtd" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_account"("p_user_id" "uuid", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_account"("p_user_id" "uuid", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_vendas_pagamentos_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_vendas_pagamentos_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_vendas_pagamentos_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_zelo_order_sale"("p_order_id" "uuid", "p_sale_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_zelo_order_sale"("p_order_id" "uuid", "p_sale_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."fiado_actor_can"("p_permission" "text", "p_owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fiado_actor_can"("p_permission" "text", "p_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_actor_can"("p_permission" "text", "p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_estornar_venda"("p_id_venda" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_estornar_venda"("p_id_venda" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_estornar_venda"("p_id_venda" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_excluir_pagamento"("p_id_lancamento" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_excluir_pagamento"("p_id_lancamento" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_excluir_pagamento"("p_id_lancamento" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_excluir_pessoa"("p_id_pessoa" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_excluir_pessoa"("p_id_pessoa" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_excluir_pessoa"("p_id_pessoa" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_lancar_debito"("p_id_pessoa" "uuid", "p_valor" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_pagamento_venda"() TO "anon";
GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_pagamento_venda"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_pagamento_venda"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_venda"() TO "anon";
GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_venda"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_registrar_debito_venda"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_registrar_pagamento"("p_id_pessoa" "uuid", "p_valor" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fiado_registrar_pagamento_v2"("p_id_pessoa" "uuid", "p_valor" numeric, "p_adicionar_ao_caixa" boolean, "p_id_caixa" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fiado_registrar_pagamento_v2"("p_id_pessoa" "uuid", "p_valor" numeric, "p_adicionar_ao_caixa" boolean, "p_id_caixa" integer, "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fiado_registrar_pagamento_v2"("p_id_pessoa" "uuid", "p_valor" numeric, "p_adicionar_ao_caixa" boolean, "p_id_caixa" integer, "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owner_user_id"("lookup_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_super_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_active_super_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_subscription_active"("p_owner_user_id" "uuid", "p_product" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_subscription_active"("p_owner_user_id" "uuid", "p_product" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_subscription_active"("p_owner_user_id" "uuid", "p_product" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_table_capability"("p_empresa_id" "uuid", "p_comanda_id" "uuid", "p_mesa_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_table_capability"("p_empresa_id" "uuid", "p_comanda_id" "uuid", "p_mesa_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."mesas_status_rbac_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."mesas_status_rbac_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mesas_status_rbac_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_caixa_movimentacao_actor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_caixa_movimentacao_actor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_actor_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_zelomenu_delivery_quote_request"("p_company_id" "uuid", "p_request_id" "uuid", "p_fee" numeric, "p_resolved_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_zelomenu_delivery_quote_request"("p_company_id" "uuid", "p_request_id" "uuid", "p_fee" numeric, "p_resolved_snapshot" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_table_capability"("p_comanda_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_table_capability"("p_comanda_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_subscription_expiration_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_subscription_expiration_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."saldo_caixa"("p_id_caixa" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."saldo_caixa"("p_id_caixa" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_zelomenu_delivery_settings"("p_empresa_id" "uuid", "p_enabled" boolean, "p_address" "jsonb", "p_ranges" "jsonb", "p_pricing_rules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_zelomenu_delivery_settings"("p_empresa_id" "uuid", "p_enabled" boolean, "p_address" "jsonb", "p_ranges" "jsonb", "p_pricing_rules" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_numero_venda"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_numero_venda"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_numero_venda"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."billing_payments" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."billing_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_payments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_pix_payment"("p_payment_id" "uuid", "p_provider_status" "text", "p_mapped_status" "text", "p_amount_paid_cents" integer, "p_expires_at" timestamp with time zone, "p_paid_at" timestamp with time zone, "p_external_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_pix_payment"("p_payment_id" "uuid", "p_provider_status" "text", "p_mapped_status" "text", "p_amount_paid_cents" integer, "p_expires_at" timestamp with time zone, "p_paid_at" timestamp with time zone, "p_external_reference" "text") TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."subscription_effective_expiry"("s" "public"."subscriptions") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."subscription_effective_expiry"("s" "public"."subscriptions") TO "authenticated";
GRANT ALL ON FUNCTION "public"."subscription_effective_expiry"("s" "public"."subscriptions") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transition_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_action" "text", "p_actor_id" "uuid", "p_detail" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_action" "text", "p_actor_id" "uuid", "p_detail" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_zelo_order"("p_order_id" "uuid", "p_expected_revision" integer, "p_action" "text", "p_actor_id" "uuid", "p_detail" "jsonb") TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_cart_sessions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_cart_sessions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_customer" "jsonb", "p_cart" "jsonb", "p_fulfillment" "jsonb", "p_pricing" "jsonb", "p_payment" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_zelomenu_cart"("p_session_id" "uuid", "p_token_hash" "text", "p_expected_revision" integer, "p_customer" "jsonb", "p_cart" "jsonb", "p_fulfillment" "jsonb", "p_pricing" "jsonb", "p_payment" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vendas_actor_can_delete"("p_venda_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vendas_actor_can_delete"("p_venda_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vendas_actor_can_delete"("p_venda_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."vendas_discount_rbac_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vendas_discount_rbac_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vendas_discount_rbac_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vendas_insert_rbac_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."vendas_insert_rbac_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vendas_insert_rbac_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."zelo_order_has_permission"("p_empresa_id" "uuid", "p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelo_order_has_permission"("p_empresa_id" "uuid", "p_permission" "text") TO "service_role";



GRANT ALL ON TABLE "public"."zelo_orders" TO "service_role";
GRANT SELECT ON TABLE "public"."zelo_orders" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."zelo_order_result"("p_order" "public"."zelo_orders") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelo_order_result"("p_order" "public"."zelo_orders") TO "service_role";



REVOKE ALL ON FUNCTION "public"."zelo_order_sale_on_deliver"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelo_order_sale_on_deliver"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."zelochat_decrement_stock"("p_id_usuario" "uuid", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelochat_decrement_stock"("p_id_usuario" "uuid", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."zelochat_increment_ai_usage_daily"("p_empresa_id" "uuid", "p_usage_date" "date", "p_feature" "text", "p_model" "text", "p_status" "text", "p_prompt_tokens" bigint, "p_completion_tokens" bigint, "p_total_tokens" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelochat_increment_ai_usage_daily"("p_empresa_id" "uuid", "p_usage_date" "date", "p_feature" "text", "p_model" "text", "p_status" "text", "p_prompt_tokens" bigint, "p_completion_tokens" bigint, "p_total_tokens" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."zelochat_increment_unread"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."zelochat_increment_unread"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."zelochat_orders_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."zelochat_orders_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."zelochat_orders_set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."access_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."access_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."access_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."access_roles" TO "anon";
GRANT ALL ON TABLE "public"."access_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."access_roles" TO "service_role";



GRANT ALL ON TABLE "public"."access_settings" TO "anon";
GRANT ALL ON TABLE "public"."access_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."access_settings" TO "service_role";



GRANT ALL ON TABLE "public"."access_users" TO "anon";
GRANT ALL ON TABLE "public"."access_users" TO "authenticated";
GRANT ALL ON TABLE "public"."access_users" TO "service_role";



GRANT ALL ON TABLE "public"."account_deletion_log" TO "anon";
GRANT ALL ON TABLE "public"."account_deletion_log" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletion_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_company_metric_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_company_metric_settings" TO "service_role";



GRANT ALL ON TABLE "public"."admin_finance_fixed_expenses" TO "anon";
GRANT ALL ON TABLE "public"."admin_finance_fixed_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_finance_fixed_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."approvals" TO "service_role";



GRANT ALL ON TABLE "public"."billing_webhook_events" TO "service_role";



GRANT SELECT ON TABLE "public"."business_daily_snapshots" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."business_daily_snapshots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."business_daily_snapshots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."business_daily_snapshots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."business_daily_snapshots_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."business_intelligence_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."business_intelligence_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."business_intelligence_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."business_intelligence_runs_id_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."business_signals" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."business_signals" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."business_signals" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."business_signals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."business_signals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."business_signals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."caixa_fechamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."caixa_fechamentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."caixa_fechamentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."caixa_fechamentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."caixa_fechamentos_id_seq" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."caixa_movimentacoes" TO "anon";
GRANT ALL ON TABLE "public"."caixa_movimentacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."caixa_movimentacoes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."caixa_movimentacoes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."caixa_movimentacoes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."caixa_movimentacoes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."caixas" TO "anon";
GRANT ALL ON TABLE "public"."caixas" TO "authenticated";
GRANT ALL ON TABLE "public"."caixas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."caixas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."caixas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."caixas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comanda_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."comanda_itens" TO "service_role";



GRANT ALL ON TABLE "public"."comanda_pagamento_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."comanda_pagamento_itens" TO "service_role";



GRANT ALL ON TABLE "public"."comanda_pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."comanda_pagamentos" TO "service_role";



GRANT ALL ON TABLE "public"."comandas" TO "authenticated";
GRANT ALL ON TABLE "public"."comandas" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."email_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."email_onboarding_logs" TO "anon";
GRANT ALL ON TABLE "public"."email_onboarding_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_onboarding_logs" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."empresa_perfil" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."empresa_perfil" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa_perfil" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("nome_exibicao") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("documento") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("inscricao_estadual") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("endereco") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("contato") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("timezone") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("logo_url") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("rodape_recibo") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("largura_bobina") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("modulo_pdv_ativo") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("modulo_delivery_ativo") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("razao_social") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("plataformas_pagamento") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("last_seen_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("onboarding_completed") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("chave_pix") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("manager_phone") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("horario_abertura") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("horario_fechamento") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("dias_fechamento") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_instructions") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("blocked_dates") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("manager_history") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("tipo_negocio") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelochat_onboarding_done") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_enabled") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("webhook_token") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_can_reengage_pending") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelochat_disabled_builtin_triggers") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_config") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("whatsmiau_instance") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("whatsmiau_connected") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("whatsmiau_phone") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("notify_customer_preparing") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("notify_customer_ready") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("notify_customer_out_for_delivery") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("pix_receipt_config") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_mode") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_schedule_start") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_schedule_end") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelochat_mode") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelochat_internal_send_key_hash") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelochat_onboarding_done_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("tabelas_preco_ativo") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("tabela_preco_1_nome") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("tabela_preco_2_nome") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("tabela_preco_3_nome") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("referral_code") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("deletion_scheduled_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("deletion_requested_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("deletion_source") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("ai_schedule_days") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_slug") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_welcome_text") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_featured_enabled") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_featured_product_ids") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_category_order") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("intelligence_enabled_at") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("gerente_prefs") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("gerente_whatsapp_last_sent_date") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("horario_semanal") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_recommendations_enabled") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_recommendation_product_ids") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_category_suggestions") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_pix_key_type") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_auto_accept_orders") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_postal_code") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_number") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_complement") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_street") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_neighborhood") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_city") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_state") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_latitude") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_longitude") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("delivery_location_version") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_cover_url") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_description") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_sponsored_enabled") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("origem_aquisicao") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_scheduling_enabled") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT SELECT("zelomenu_scheduling_lead_time_minutes") ON TABLE "public"."empresa_perfil" TO "authenticated";



GRANT ALL ON TABLE "public"."empresa_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."empresa_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."empresa_usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."empresas" TO "anon";
GRANT ALL ON TABLE "public"."empresas" TO "authenticated";
GRANT ALL ON TABLE "public"."empresas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."empresas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."empresas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."empresas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fiado_lancamentos" TO "service_role";
GRANT SELECT ON TABLE "public"."fiado_lancamentos" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."fiado_lancamentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fiado_lancamentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fiado_lancamentos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lead_events" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."mesas" TO "authenticated";
GRANT ALL ON TABLE "public"."mesas" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_communication_events" TO "service_role";



GRANT ALL ON TABLE "public"."outreach_messages" TO "service_role";



GRANT ALL ON TABLE "public"."pessoas" TO "anon";
GRANT ALL ON TABLE "public"."pessoas" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoas" TO "service_role";



GRANT ALL ON TABLE "public"."product_usage_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_usage_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_usage_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_usage_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."produtos" TO "anon";
GRANT ALL ON TABLE "public"."produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."produtos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."produtos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."produtos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."produtos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."referral_rewards" TO "anon";
GRANT ALL ON TABLE "public"."referral_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."referral_trigger_events" TO "anon";
GRANT ALL ON TABLE "public"."referral_trigger_events" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_trigger_events" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."registration_nudges" TO "anon";
GRANT ALL ON TABLE "public"."registration_nudges" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_nudges" TO "service_role";



GRANT ALL ON TABLE "public"."subcategorias" TO "anon";
GRANT ALL ON TABLE "public"."subcategorias" TO "authenticated";
GRANT ALL ON TABLE "public"."subcategorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."subcategorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subcategorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subcategorias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_cron_logs" TO "anon";
GRANT ALL ON TABLE "public"."subscription_cron_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_cron_logs" TO "service_role";



GRANT SELECT,MAINTAIN,UPDATE ON TABLE "public"."super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."suppression_list" TO "service_role";



GRANT ALL ON TABLE "public"."user_entitlements" TO "service_role";
GRANT SELECT ON TABLE "public"."user_entitlements" TO "authenticated";



GRANT ALL ON TABLE "public"."v_daily_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."v_leads_pending_followup" TO "service_role";



GRANT ALL ON TABLE "public"."v_top_leads_pending" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."vendas" TO "anon";
GRANT ALL ON TABLE "public"."vendas" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendas_id_seq" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."vendas_itens" TO "anon";
GRANT ALL ON TABLE "public"."vendas_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas_itens" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendas_itens_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendas_itens_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendas_itens_id_seq" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."vendas_pagamentos" TO "anon";
GRANT ALL ON TABLE "public"."vendas_pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas_pagamentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendas_pagamentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendas_pagamentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendas_pagamentos_id_seq" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."vendas_taxas_plataforma" TO "anon";
GRANT ALL ON TABLE "public"."vendas_taxas_plataforma" TO "authenticated";
GRANT ALL ON TABLE "public"."vendas_taxas_plataforma" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendas_taxas_plataforma_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendas_taxas_plataforma_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendas_taxas_plataforma_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events_processed" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events_processed" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events_processed" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_onboarding_logs" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_onboarding_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_onboarding_logs" TO "service_role";



GRANT ALL ON TABLE "public"."zelo_order_events" TO "service_role";
GRANT SELECT ON TABLE "public"."zelo_order_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."zelo_order_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zelo_order_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zelo_order_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."zelo_order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."zelo_order_items" TO "authenticated";



GRANT ALL ON TABLE "public"."zelo_order_outbox" TO "service_role";



GRANT ALL ON SEQUENCE "public"."zelo_order_outbox_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zelo_order_outbox_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zelo_order_outbox_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_ai_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_ai_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_ai_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_billing_payments" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_billing_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_billing_payments" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_billing_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_billing_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_billing_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_drivers" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_drivers" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_email_onboarding_logs" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_email_onboarding_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_email_onboarding_logs" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_escalation_events" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_escalation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_escalation_events" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_messages" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_orders" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_orders" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_pending_orders" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_pending_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_pending_orders" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_quick_responses" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_quick_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_quick_responses" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_response_events" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_response_events" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_response_events" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_session_tags" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_session_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_session_tags" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_tags" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_tags" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_triggers" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_triggers" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_triggers" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_webhook_events_raw" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_webhook_events_raw" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_webhook_events_raw" TO "service_role";



GRANT ALL ON TABLE "public"."zelochat_whatsapp_onboarding_logs" TO "anon";
GRANT ALL ON TABLE "public"."zelochat_whatsapp_onboarding_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."zelochat_whatsapp_onboarding_logs" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_cart_tokens" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_cart_tokens" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_coupon_redemptions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_coupon_redemptions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_coupons" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_coupons" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_cep_cache" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_cep_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_cep_cache" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_distance_cache" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_distance_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_distance_cache" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_geocoding_cache" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_geocoding_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_geocoding_cache" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rule_ranges" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rule_ranges" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rule_ranges" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_quote_requests" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_quote_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_quote_requests" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_delivery_ranges" TO "anon";
GRANT ALL ON TABLE "public"."zelomenu_delivery_ranges" TO "authenticated";
GRANT ALL ON TABLE "public"."zelomenu_delivery_ranges" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_groups" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_groups" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_option_products" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_option_products" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_options" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_modifier_options" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_product_publications" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."zelomenu_product_publications" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."zelomenu_table_capabilities" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




