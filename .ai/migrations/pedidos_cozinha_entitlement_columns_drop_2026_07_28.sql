-- Fase 2B — remover flags legadas depois do deploy dos consumidores.
--
-- Pré-condição: o ZeloMenu publicado já não seleciona
-- subscriptions.has_pedidos_addon. A view é recriada sem a coluna antes do
-- ALTER TABLE, preservando os grants existentes e sem CASCADE.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='subscriptions' and column_name='has_pedidos_addon'
  ) then
    raise exception 'PRECONDITION_FAILED: subscriptions.has_pedidos_addon is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='billing_payments' and column_name='has_pedidos_addon'
  ) then
    raise exception 'PRECONDITION_FAILED: billing_payments.has_pedidos_addon is missing';
  end if;
end $$;

drop view public.user_entitlements;

create view public.user_entitlements as
select
  user_id,
  plan_tier,
  status,
  current_period_end,
  manually_extended_until,
  payment_provider,
  is_subscription_active(user_id, 'pdv'::text) as pdv_active,
  is_subscription_active(user_id, 'chat'::text) as chat_active,
  subscription_effective_expiry(s.*) as effective_expiry,
  has_mesas_addon,
  has_acessos_addon,
  has_zelo_menu
from public.subscriptions s
where status <> all (array['canceled'::text, 'incomplete'::text]);

revoke all on public.user_entitlements from public;
grant select, insert, update, delete, truncate, references, trigger
  on public.user_entitlements to anon;
grant select, insert, update, delete, truncate, references, trigger
  on public.user_entitlements to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.user_entitlements to service_role;

alter table public.subscriptions drop column has_pedidos_addon;
alter table public.billing_payments drop column has_pedidos_addon;

commit;
