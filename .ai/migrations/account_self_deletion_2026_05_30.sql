-- Self-service account deletion (LGPD Art. 18, III — direito à eliminação)
-- Shared DB for Zelo PDV + ZeloChat. Deletes ALL data for one auth user across
-- both products, then removes the auth identity.
--
-- Why an explicit ordered purge instead of relying on `DELETE FROM auth.users`
-- cascade (what admin_delete_user does):
--   * comandas / expenses / pedidos FK auth.users with NO ACTION -> they BLOCK the
--     auth.users delete (so admin_delete_user already fails for any real user).
--   * pessoas (PDV customers) and the zelochat_sessions/messages/tags/event/log tables
--     have NO FK to auth.users/empresa_perfil -> they are NOT cascaded and leak PII.
--   * fiado_lancamentos.id_pessoa is ON DELETE RESTRICT, so the account ledger
--     must be purged before its pessoas parent can be removed.
-- This function deletes those explicitly, in dependency order, before the cascade.
--
-- NOT handled here (done by the calling server endpoint, which has the context/SDKs):
--   * Stripe subscription cancellation (subscriptions.provider_subscription_id)
--   * ZeloChat Whatsmiau instance logout/delete (empresa_perfil.whatsmiau_instance)
--   * Storage objects (buckets: logos, zelochat-media, delivery-assets)
--
-- admin_delete_user (admin dashboard) is also repointed at this function so the
-- admin path no longer hits the broken `DELETE FROM auth.users`-only cascade.

-- 1) Retained audit log (no FK to auth.users so it survives the deletion).
--    Stores masked email + sha256 hash only — proof of erasure without keeping PII.
create table if not exists public.account_deletion_log (
  id              uuid primary key default gen_random_uuid(),
  deleted_user_id uuid not null,
  empresa_id      uuid,
  email_masked    text,
  email_fingerprint text,                     -- md5(lower(email)) — opaque dedupe key, no raw PII
  source          text,                       -- 'pdv' | 'zelochat' | 'admin'
  requested_at    timestamptz not null default now()
);

alter table public.account_deletion_log enable row level security;
-- Only super admins may read; nobody may write via the API (function writes as definer).
drop policy if exists account_deletion_log_admin_read on public.account_deletion_log;
create policy account_deletion_log_admin_read on public.account_deletion_log
  for select using (
    exists (select 1 from public.super_admins sa
            where sa.user_id = auth.uid() and sa.is_active = true)
  );

-- 2) The purge function. Granted to service_role only (server-orchestrated self-serve
--    deletion). The guard additionally accepts the user themselves (defense in depth)
--    and active super admins, so admin_delete_user can delegate to it.
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
  -- Guard: service_role (self-serve endpoints), the user deleting themselves, or an
  -- active super admin (admin dashboard via admin_delete_user).
  if not (
    auth.role() = 'service_role'
    or auth.uid() = p_user_id
    or exists (select 1 from super_admins sa where sa.user_id = auth.uid() and sa.is_active = true)
  ) then
    raise exception 'Unauthorized: not allowed to delete this account';
  end if;

  select id into v_empresa from empresa_perfil where user_id = p_user_id;
  select email into v_email from auth.users where id = p_user_id;

  -- Proof-of-erasure audit (masked PII only).
  insert into account_deletion_log (deleted_user_id, empresa_id, email_masked, email_fingerprint, source)
  values (
    p_user_id,
    v_empresa,
    case when v_email is null then null
         else left(v_email, 1) || '***@' || split_part(v_email, '@', 2) end,
    case when v_email is null then null
         else md5(lower(v_email)) end,  -- core md5 (no pgcrypto/extensions schema dependency)
    p_source
  );

  -- 3) ZeloChat data (scoped by empresa_perfil.id). Explicit because several of
  --    these tables have no FK to empresa_perfil and would otherwise be orphaned.
  if v_empresa is not null then
    delete from zelochat_sessions               where empresa_id = v_empresa; -- cascades messages, session_tags, escalation/response events
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
  -- These two are scoped by user_id (not empresa_id) and hold PII (recipient_email/phone).
  delete from zelochat_email_onboarding_logs    where user_id = p_user_id;
  delete from zelochat_whatsapp_onboarding_logs where user_id = p_user_id;

  -- 4) PDV pre-deletes that unblock the auth.users cascade and remove orphan PII.
  --    Order: pedidos -> comandas -> expenses -> vendas -> fiado_lancamentos -> pessoas.
  delete from pedidos  where id_usuario = p_user_id;  -- NO ACTION blocker; cascades pedido_itens
  delete from comandas where id_usuario = p_user_id;  -- NO ACTION blocker; cascades comanda_itens/pagamentos
  delete from expenses where user_id   = p_user_id;   -- NO ACTION blocker
  delete from vendas   where id_usuario = p_user_id;  -- cascades vendas_itens/pagamentos/taxas; frees pessoas FK
  delete from fiado_lancamentos where id_usuario = p_user_id; -- id_pessoa is ON DELETE RESTRICT
  delete from pessoas  where id_usuario = p_user_id;  -- orphan PII (no FK to auth.users)

  -- 5) Remove the auth identity. Cascades everything else owned by this user:
  --    empresa_perfil (-> remaining zelochat_* empresa_perfil-FK tables), subscriptions,
  --    caixas (-> fechamentos/movimentacoes), categorias (-> subcategorias), produtos,
  --    mesas, access_*, referrals/referral_*, billing_payments, *_onboarding_logs,
  --    empresas/empresa_usuarios, super_admins, and auth.sessions/identities/etc.
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_account(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_account(uuid, text) to service_role;

-- 3) Repoint the admin-dashboard deletion at the same robust purge. Keeps the
--    super_admin verification + admin_activity_logs audit, but delegates the actual
--    deletion to delete_account (which handles the cascade gaps the old body did not).
create or replace function public.admin_delete_user(target_user_id uuid, target_user_email text, action_details jsonb default '{}'::jsonb)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_admin_email text;
  v_super_admin_id uuid;
begin
  -- Verify caller is an active super_admin.
  select id, email into v_super_admin_id, v_admin_email
  from super_admins
  where user_id = auth.uid() and is_active = true;

  if v_super_admin_id is null then
    raise exception 'Unauthorized: Caller is not an active super_admin';
  end if;

  -- Log the action (unchanged behavior).
  insert into admin_activity_logs (admin_id, admin_email, action, target_user_id, target_email, details)
  values (v_super_admin_id, v_admin_email, 'delete_user', target_user_id, target_user_email, action_details);

  -- Delegate to the full, ordered purge (fixes the old cascade-only body which
  -- failed on comandas/expenses/pedidos and orphaned pessoas + zelochat PII).
  perform public.delete_account(target_user_id, 'admin');
end;
$$;
