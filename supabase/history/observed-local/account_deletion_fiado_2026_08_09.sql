-- Fix account purge for tenants that have fiado ledger history.
-- fiado_lancamentos.id_pessoa is ON DELETE RESTRICT, so the shared account
-- deletion function must remove the tenant ledger before removing pessoas.

begin;

create or replace function public.delete_account(p_user_id uuid, p_source text default 'unknown')
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

revoke all on function public.delete_account(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_account(uuid, text) to service_role;

commit;
