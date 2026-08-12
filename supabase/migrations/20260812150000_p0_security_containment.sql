-- P0 security containment only.
--
-- This migration removes unintended client access to SECURITY DEFINER views/RPCs
-- and narrows super_admins exposure without changing billing, sales, offline,
-- or application routing behavior.

-- A SECURITY DEFINER helper avoids recursive self-lookups in the
-- super_admins SELECT policy while exposing only a boolean decision.
create or replace function public.is_active_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.super_admins sa
    where sa.user_id = auth.uid()
      and sa.is_active = true
  );
$$;

revoke all on function public.is_active_super_admin() from public, anon, authenticated;
grant execute on function public.is_active_super_admin() to authenticated, service_role;

-- The entitlement view has no repository consumer, but it may be used by
-- legitimate owner/subuser clients. Invoker security makes subscriptions RLS
-- apply to those callers instead of exposing every subscription through the
-- view owner. Client roles retain SELECT only.
alter view public.user_entitlements set (security_invoker = true);
revoke all on public.user_entitlements from public, anon, authenticated;
grant select on public.user_entitlements to authenticated, service_role;

-- These leadbot views expose lead PII and have no application consumer.
-- Keep the existing service_role/postgres grants unchanged.
revoke all on public.v_daily_metrics from public, anon, authenticated;
revoke all on public.v_leads_pending_followup from public, anon, authenticated;
revoke all on public.v_top_leads_pending from public, anon, authenticated;

-- Active super-admins may still list the table (the dashboard uses that to
-- filter admin accounts), while a non-admin authenticated caller can see only
-- its own active row. Anonymous access is removed entirely.
drop policy if exists select_super_admins on public.super_admins;
create policy select_super_admins
  on public.super_admins
  for select
  to authenticated
  using ((auth.uid() = user_id and is_active = true) or public.is_active_super_admin());

revoke all on public.super_admins from public, anon;
revoke insert, delete, truncate, references, trigger
  on public.super_admins
  from authenticated;
grant select, update on public.super_admins to authenticated;

-- Browser-side dashboard reads remain callable for authenticated users, but
-- each function now enforces the active-super-admin check itself. The
-- service_role path is retained for server-side callers.
create or replace function public.admin_get_all_auth_users()
returns table(
  user_id uuid,
  email text,
  auth_created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  raw_user_meta_data jsonb,
  nome_exibicao text,
  contato text,
  documento text,
  modulo_pdv_ativo boolean,
  profile_created_at timestamp with time zone,
  last_seen_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $$
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

create or replace function public.admin_get_sales_counts(days_ago integer default 30)
returns table(id_usuario uuid, sales_count bigint)
language sql
security definer
set search_path to 'public'
as $$
  select id_usuario, count(*)::bigint as sales_count
  from vendas
  where (coalesce(auth.role(), '') = 'service_role' or public.is_active_super_admin())
    and created_at >= now() - (days_ago || ' days')::interval
  group by id_usuario;
$$;

create or replace function public.admin_get_users_last_seen()
returns table(user_id uuid, effective_last_seen timestamp with time zone)
language sql
stable
security definer
set search_path to 'public'
as $$
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

create or replace function public.admin_get_total_sales_value()
returns table(id_usuario uuid, total_revenue numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
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

grant execute on function public.admin_get_all_auth_users() to authenticated, service_role;
grant execute on function public.admin_get_sales_counts(integer) to authenticated, service_role;
grant execute on function public.admin_get_users_last_seen() to authenticated, service_role;
grant execute on function public.admin_get_total_sales_value() to authenticated, service_role;

revoke execute on function public.admin_get_all_auth_users() from public, anon;
revoke execute on function public.admin_get_sales_counts(integer) from public, anon;
revoke execute on function public.admin_get_users_last_seen() from public, anon;
revoke execute on function public.admin_get_total_sales_value() from public, anon;

-- admin_delete_user already checks auth.uid() against an active super_admin.
-- Remove only the unintended public/anonymous execution so the existing
-- authenticated dashboard contract is preserved.
revoke execute on function public.admin_delete_user(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_delete_user(uuid, text, jsonb) to authenticated, service_role;

-- These functions have no browser consumer and can mutate/read global admin
-- state. Keep the server/cron service-role path and remove client execution.
revoke execute on function public.admin_extend_subscription(uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_extend_subscription(uuid, integer, text, uuid) to service_role;

revoke execute on function public.admin_get_users_without_profile(integer)
  from public, anon, authenticated;
grant execute on function public.admin_get_users_without_profile(integer) to service_role;

revoke execute on function public.deactivate_expired_subscriptions()
  from public, anon, authenticated;
grant execute on function public.deactivate_expired_subscriptions() to service_role;

revoke execute on function public.run_subscription_expiration_check()
  from public, anon, authenticated;
grant execute on function public.run_subscription_expiration_check() to service_role;
