-- Zero-config offline operation. Manual "prepare this device" and "set as
-- primary" were the only things standing between a fresh store and offline
-- support; there is no billing reason for either to require a deliberate
-- action. This migration makes the store-level switch default to on and
-- lets any operator with caixa access silently claim primary-device status
-- as a side effect of actually running the till online, instead of an
-- owner-only screen nobody who runs a restaurant is going to find first.
begin;

-- New stores (and any store whose settings row does not exist yet) start
-- offline-enabled. The owner can still turn it off explicitly in Perfil >
-- Integrações > Operação offline (see setStoreOfflineOperation), which
-- remains an owner-only action below.
alter table public.offline_settings alter column enabled set default true;

-- This feature has not shipped to a real customer yet (no production usage
-- recorded in docs/CURRENT.md), so there is no observed store that
-- deliberately disabled it to preserve. Backfill is safe.
update public.offline_settings set enabled = true where enabled = false;

create or replace function public.offline_bootstrap_v1(p_device_id text,p_action text default 'read') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=offline_internal.actor_owner(); settings public.offline_settings%rowtype; permissions jsonb; registered boolean;
  subscription public.subscriptions%rowtype; entitled boolean; can_run_caixa boolean;
begin
  if p_device_id is null or length(p_device_id) not between 1 and 200 or p_action not in ('read','register','set_primary','enable','disable','claim_primary') then raise exception 'Aparelho ou ação inválida.'; end if;
  select * into subscription from public.subscriptions where user_id=owner_id order by updated_at desc nulls last,id limit 1;
  entitled:=coalesce(subscription.manually_extended_until>now() or (subscription.status in ('active','trialing') and (subscription.current_period_end is null or subscription.current_period_end>now())),false);
  if p_action not in ('read','disable') and not entitled then raise exception 'Assinatura ativa necessária para preparar o aparelho.' using errcode='42501'; end if;
  if p_action in ('set_primary','enable','disable') and auth.uid()<>owner_id then raise exception 'Somente o titular pode configurar o offline.' using errcode='42501'; end if;
  can_run_caixa:=public.fiado_actor_can('caixa.abrir',owner_id) or public.fiado_actor_can('caixa.fechar',owner_id) or public.fiado_actor_can('caixa.movimentar',owner_id);
  -- claim_primary rides along with an online caixa action the operator just
  -- performed; it needs the same capability that action itself required, not
  -- the owner-only governance gate above.
  if p_action='claim_primary' and not can_run_caixa then raise exception 'Permissão de caixa necessária.' using errcode='42501'; end if;
  if p_action<>'read' then
    if not (public.fiado_actor_can('pdv.acessar',owner_id) or public.fiado_actor_can('mesas.acessar',owner_id) or public.fiado_actor_can('pedidos.acessar',owner_id)) then raise exception 'Sem acesso operacional.' using errcode='42501'; end if;
    insert into public.offline_devices(owner_user_id,device_id,registered_by) values(owner_id,p_device_id,auth.uid()) on conflict do nothing;
    insert into public.offline_settings(owner_user_id) values(owner_id) on conflict do nothing;
    if p_action='set_primary' then update public.offline_settings set primary_device_id=p_device_id,enabled=true,updated_at=now() where owner_user_id=owner_id; end if;
    if p_action in ('enable','disable') then update public.offline_settings set enabled=(p_action='enable'),updated_at=now() where owner_user_id=owner_id; end if;
    -- Best-effort bookkeeping: never overrides an owner who explicitly turned
    -- offline operation off for the store.
    if p_action='claim_primary' then update public.offline_settings set primary_device_id=p_device_id,updated_at=now() where owner_user_id=owner_id and enabled=true; end if;
  end if;
  select * into settings from public.offline_settings where owner_user_id=owner_id;
  select exists(select 1 from public.offline_devices where owner_user_id=owner_id and device_id=p_device_id) into registered;
  select r.permissions into permissions from public.access_users u join public.access_roles r on r.id=u.role_id and r.owner_user_id=owner_id where u.auth_user_id=auth.uid() and u.owner_user_id=owner_id and u.status='active';
  return jsonb_build_object('available',true,'enabled',coalesce(settings.enabled,false) and registered and entitled,'registered',registered,'subscriptionActive',entitled,'hasMesasAccess',coalesce(subscription.has_mesas_addon,false),
    'deviceId',p_device_id,'ownerUserId',owner_id,'operatorId',auth.uid(),'isPrimaryDevice',settings.primary_device_id=p_device_id,
    'primaryDeviceId',settings.primary_device_id,'permissions',permissions,'isOwner',auth.uid()=owner_id,'schemaVersion',1,
    'validatedAt',now(),'expiresAt',now()+interval '7 days');
end $$;
revoke all on function public.offline_bootstrap_v1(text,text) from public,anon;
grant execute on function public.offline_bootstrap_v1(text,text) to authenticated;
commit;
