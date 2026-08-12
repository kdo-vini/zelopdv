# P0 security containment — pre-change production snapshot

## PRE-CHANGE PRODUCTION SNAPSHOT

Captured from the linked Supabase project on 2026-08-12 before the forward-only containment migration. This file is intentionally immutable evidence for the first security PR; it is not a migration and must not be replayed.

### Affected view/table ACLs

`pg_class.relacl` returned the following ACLs. The explicit `anon` and `authenticated` grants are the client exposure being removed. `service_role` and `postgres` grants are retained by the migration.

```text
public.user_entitlements             {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
public.v_daily_metrics                {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
public.v_leads_pending_followup      {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
public.v_top_leads_pending            {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
public.super_admins                   {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

### Affected view definitions

```sql
-- public.user_entitlements
SELECT user_id,
       plan_tier,
       status,
       current_period_end,
       manually_extended_until,
       payment_provider,
       is_subscription_active(user_id, 'pdv'::text) AS pdv_active,
       is_subscription_active(user_id, 'chat'::text) AS chat_active,
       subscription_effective_expiry(s.*) AS effective_expiry,
       has_mesas_addon,
       has_acessos_addon,
       has_zelo_menu
FROM subscriptions s
WHERE status <> ALL (ARRAY['canceled'::text, 'incomplete'::text]);

-- public.v_daily_metrics
SELECT count(*) FILTER (WHERE created_at >= CURRENT_DATE) AS leads_collected_today,
       count(*) FILTER (WHERE fit_status = 'qualified'::fit_status AND created_at >= CURRENT_DATE) AS leads_qualified_today,
       count(*) FILTER (WHERE status = 'approved'::lead_status AND updated_at >= CURRENT_DATE) AS leads_approved_today,
       count(*) FILTER (WHERE status = 'contacted'::lead_status AND last_contacted_at >= CURRENT_DATE) AS leads_contacted_today,
       count(*) FILTER (WHERE status = 'interested'::lead_status AND updated_at >= CURRENT_DATE) AS leads_interested_today,
       count(*) FILTER (WHERE status = 'won'::lead_status AND updated_at >= CURRENT_DATE) AS leads_won_today,
       count(*) FILTER (WHERE next_followup_at >= now() AND next_followup_at <= (now() + '24:00:00'::interval)) AS followups_due_tomorrow,
       avg(score) FILTER (WHERE created_at >= CURRENT_DATE) AS avg_score_today
FROM leads;

-- public.v_leads_pending_followup
SELECT l.id,
       l.business_name,
       l.segment,
       l.city,
       l.state,
       l.country,
       l.phone,
       l.normalized_phone,
       l.whatsapp,
       l.email,
       l.instagram,
       l.website,
       l.google_maps_url,
       l.source,
       l.source_ref,
       l.raw_data,
       l.dedupe_key,
       l.score,
       l.score_reason,
       l.fit_status,
       l.product_fit,
       l.pain_hypothesis,
       l.recommended_action,
       l.status,
       l.opt_in_whatsapp,
       l.whatsapp_window_until,
       l.consent_source,
       l.last_contacted_at,
       l.next_followup_at,
       l.created_at,
       l.updated_at,
       count(e.id) AS event_count
FROM leads l
LEFT JOIN lead_events e ON e.lead_id = l.id
WHERE l.status = 'contacted'::lead_status
  AND l.last_contacted_at IS NOT NULL
  AND l.last_contacted_at >= (now() - '4 days'::interval)
  AND l.last_contacted_at <= (now() - '2 days'::interval)
GROUP BY l.id;

-- public.v_top_leads_pending
SELECT id,
       business_name,
       segment,
       city,
       state,
       country,
       phone,
       normalized_phone,
       whatsapp,
       email,
       instagram,
       website,
       google_maps_url,
       source,
       source_ref,
       raw_data,
       dedupe_key,
       score,
       score_reason,
       fit_status,
       product_fit,
       pain_hypothesis,
       recommended_action,
       status,
       opt_in_whatsapp,
       whatsapp_window_until,
       consent_source,
       last_contacted_at,
       next_followup_at,
       created_at,
       updated_at
FROM leads
WHERE fit_status = 'qualified'::fit_status
  AND (status = ANY (ARRAY['new'::lead_status, 'qualified'::lead_status, 'approved'::lead_status]))
  AND (status <> ALL (ARRAY['blocked'::lead_status, 'ignored'::lead_status]))
ORDER BY score DESC
LIMIT 20;
```

### Affected function ACLs

`pg_proc.proacl` returned the same ACL for each function below. `=X/postgres` is the implicit `PUBLIC` execute grant; the named client grants were also present.

```text
{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

Functions captured:

```text
admin_extend_subscription(uuid,integer,text,uuid)
deactivate_expired_subscriptions()
run_subscription_expiration_check()
admin_delete_user(uuid,text,jsonb)
admin_get_users_last_seen()
admin_get_sales_counts(integer)
admin_get_all_auth_users()
admin_get_users_without_profile(integer)
admin_get_total_sales_value()
```

### Affected function definitions

```sql
CREATE OR REPLACE FUNCTION public.admin_extend_subscription(p_subscription_id uuid, p_months integer, p_reason text, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_current_end timestamp with time zone;
  v_new_end timestamp with time zone;
  v_is_expired boolean;
  v_target_user_id uuid;
BEGIN
  SELECT current_period_end, user_id INTO v_current_end, v_target_user_id
  FROM subscriptions WHERE id = p_subscription_id;
  IF v_current_end IS NULL THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada');
  END IF;
  v_is_expired := v_current_end < now();
  IF v_is_expired THEN
    v_new_end := now() + (p_months || ' months')::interval;
  ELSE
    v_new_end := v_current_end + (p_months || ' months')::interval;
  END IF;
  UPDATE subscriptions
  SET current_period_end = v_new_end,
      status = 'active',
      manually_extended_until = NULL,
      admin_notes = COALESCE(admin_notes || E'\n', '') || to_char(now(), 'DD/MM/YYYY HH24:MI') || ' - ' || p_reason,
      last_modified_by = p_admin_id,
      last_modified_at = now(),
      updated_at = now()
  WHERE id = p_subscription_id;
  INSERT INTO admin_activity_logs (admin_id, admin_email, action, target_user_id, target_email, details)
  SELECT p_admin_id, sa.email, 'renew_subscription', v_target_user_id, au.email,
         jsonb_build_object('subscription_id', p_subscription_id, 'months_added', p_months,
                            'new_expiry', v_new_end, 'was_expired', v_is_expired, 'reason', p_reason)
  FROM super_admins sa CROSS JOIN auth.users au
  WHERE sa.id = p_admin_id AND au.id = v_target_user_id;
  RETURN jsonb_build_object('success', true, 'new_expiry', v_new_end, 'was_expired', v_is_expired);
END;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_expired_subscriptions()
RETURNS TABLE(deactivated_count integer, deactivated_users jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_count integer := 0;
  v_users jsonb := '[]'::jsonb;
  v_user record;
BEGIN
  FOR v_user IN
    SELECT s.id AS subscription_id, s.user_id, s.current_period_end,
           s.manually_extended_until, ep.nome_exibicao, ep.contato
    FROM subscriptions s
    LEFT JOIN empresa_perfil ep ON ep.user_id = s.user_id
    WHERE s.status = 'active'
      AND COALESCE(s.manually_extended_until, s.current_period_end) < now()
  LOOP
    UPDATE subscriptions SET status = 'canceled', updated_at = now()
    WHERE id = v_user.subscription_id;
    v_count := v_count + 1;
    v_users := v_users || jsonb_build_object(
      'user_id', v_user.user_id, 'company', v_user.nome_exibicao,
      'email', v_user.contato,
      'expired_at', COALESCE(v_user.manually_extended_until, v_user.current_period_end));
  END LOOP;
  RETURN QUERY SELECT v_count, v_users;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_subscription_expiration_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO v_result FROM deactivate_expired_subscriptions();
  INSERT INTO subscription_cron_logs (deactivated_count, deactivated_users)
  VALUES (v_result.deactivated_count, v_result.deactivated_users);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO subscription_cron_logs (deactivated_count, error)
  VALUES (0, SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid, target_user_email text, action_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_users_last_seen()
RETURNS TABLE(user_id uuid, effective_last_seen timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.id AS user_id,
         GREATEST(ep.last_seen_at, au.last_sign_in_at, MAX(s.updated_at)) AS effective_last_seen
  FROM auth.users au
  LEFT JOIN public.empresa_perfil ep ON ep.user_id = au.id
  LEFT JOIN auth.sessions s ON s.user_id = au.id
  GROUP BY au.id, ep.last_seen_at, au.last_sign_in_at;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_sales_counts(days_ago integer DEFAULT 30)
RETURNS TABLE(id_usuario uuid, sales_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id_usuario, count(*)::bigint AS sales_count
  FROM vendas
  WHERE created_at >= now() - (days_ago || ' days')::interval
  GROUP BY id_usuario;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_all_auth_users()
RETURNS TABLE(user_id uuid, email text, auth_created_at timestamp with time zone,
              last_sign_in_at timestamp with time zone, raw_user_meta_data jsonb,
              nome_exibicao text, contato text, documento text, modulo_pdv_ativo boolean,
              profile_created_at timestamp with time zone, last_seen_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id AS user_id, u.email, u.created_at AS auth_created_at,
         u.last_sign_in_at, u.raw_user_meta_data, p.nome_exibicao, p.contato,
         p.documento, p.modulo_pdv_ativo, p.created_at AS profile_created_at,
         p.last_seen_at
  FROM auth.users u
  LEFT JOIN public.empresa_perfil p ON p.user_id = u.id
  ORDER BY u.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_users_without_profile(min_age_hours integer DEFAULT 2)
RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.email, u.created_at
  FROM auth.users u
  LEFT JOIN public.empresa_perfil p ON p.user_id = u.id
  WHERE p.user_id IS NULL
    AND u.created_at < now() - (min_age_hours || ' hours')::interval
    AND u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.access_users au
                    WHERE au.auth_user_id = u.id OR lower(au.email) = lower(u.email))
  ORDER BY u.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_total_sales_value()
RETURNS TABLE(id_usuario uuid, total_revenue numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  return query
    select v.id_usuario, coalesce(sum(v.valor_total), 0)::numeric as total_revenue
    from vendas v
    group by v.id_usuario;
end;
$function$;
```

### Existing `super_admins` policies

```text
select_super_admins: FOR SELECT TO authenticated USING (true)
update_super_admins: FOR UPDATE TO authenticated USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active))
delete_super_admins: FOR DELETE TO authenticated USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active))
modify_super_admins: FOR INSERT TO authenticated WITH CHECK (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active))
```

### Consumer classification used for blast-radius design

```text
user_entitlements: no repository consumer found; owner/subuser SELECT compatibility is preserved with security_invoker.
v_daily_metrics: no repository consumer found; leadbot/analytics view, client roles removed.
v_leads_pending_followup: no repository consumer found; leadbot PII view, client roles removed.
v_top_leads_pending: no repository consumer found; leadbot PII view, client roles removed.
admin_get_all_auth_users: browser-side admin-dashboard RPC; authenticated execution retained with in-function active-super-admin guard.
admin_get_sales_counts: browser-side admin-dashboard RPC; authenticated execution retained with in-function active-super-admin guard.
admin_get_total_sales_value: browser-side admin-dashboard RPC; authenticated execution retained with in-function active-super-admin guard.
admin_get_users_last_seen: browser-side admin-dashboard RPC; authenticated execution retained with in-function active-super-admin guard.
admin_delete_user: browser-side admin-dashboard RPC; authenticated execution retained because the function already checks active super_admins.
admin_extend_subscription: no runtime consumer found (only helper comment); service-role execution retained.
admin_get_users_without_profile: server-side cron via supabaseAdmin/service-role; service-role execution retained.
deactivate_expired_subscriptions: no runtime consumer found; service-role execution retained.
run_subscription_expiration_check: no runtime consumer found; service-role execution retained.
```

### Manual rollback after deployment

Do not rewrite or delete the forward-only migration. If production behavior must
be restored, run a reviewed SQL rollback in a transaction: restore the affected
function definitions from this snapshot, restore the original `select_super_admins`
policy (`USING (true)`), restore the pre-change `anon`/`authenticated` grants
from the ACL section, reset `security_invoker` on `user_entitlements`, and then
drop `public.is_active_super_admin()`. Commit only after the authorization matrix
has been rerun; otherwise issue `ROLLBACK`.
