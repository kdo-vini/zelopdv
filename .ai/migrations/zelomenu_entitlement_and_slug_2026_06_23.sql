-- ============================================================================
-- ZeloMenu entitlement flag + public store slug
--
-- Adds the two PDV-owned, additive columns the ZeloMenu rollout needs
-- (D-102 slug, D-103 entitlement, D-104 pricing), each following an existing
-- pattern already in production:
--   - subscriptions.has_zelo_menu   -> mirrors has_mesas_addon / has_pedidos_addon
--   - empresa_perfil.zelomenu_slug  -> mirrors empresa_perfil.referral_code unique slug
--
-- Both are additive and change NO existing behavior on their own:
--   * has_zelo_menu defaults false; chat/bundle already include ZeloMenu by
--     product policy (D-014), so the ZeloChat resolver stays fail-safe ON for
--     them regardless of this flag. The flag is the gate for pdv-only + ZeloMenu
--     (the +R$40 addon / R$99 tier).
--   * zelomenu_slug starts NULL (no public link until the operator sets one).
--
-- Apply order: this migration must land BEFORE any app code that SELECTs the
-- new columns. ZeloChat code reads them with safe fallback, but PDV guards
-- (hasZeloMenuAccess) select has_zelo_menu directly.
-- ============================================================================

-- 1) Entitlement flag -----------------------------------------------------------
alter table public.subscriptions
  add column if not exists has_zelo_menu boolean not null default false;

comment on column public.subscriptions.has_zelo_menu is
  'ZeloMenu module entitlement. chat/bundle include ZeloMenu by product policy (D-014); a pdv-only subscription needs this true for the +R$40 ZeloMenu addon (R$99 tier).';

-- Backfill: chat/bundle already include ZeloMenu (D-014). Make it explicit in
-- the data without touching billing. pdv-only rows stay false (must buy the addon).
update public.subscriptions
  set has_zelo_menu = true
  where plan_tier in ('chat', 'bundle')
    and has_zelo_menu is distinct from true;

-- 2) Public store slug ----------------------------------------------------------
alter table public.empresa_perfil
  add column if not exists zelomenu_slug text;

comment on column public.empresa_perfil.zelomenu_slug is
  'Public ZeloMenu store slug for menu.zelopdv.com.br/{slug}. Unique when non-null; NULL means no public link yet.';

create unique index if not exists empresa_perfil_zelomenu_slug_unique
  on public.empresa_perfil (zelomenu_slug)
  where zelomenu_slug is not null;

-- 3) Surface the flag in the canonical entitlement view -------------------------
-- Same definition as canonical_entitlement_2026_06_11.sql, with has_zelo_menu
-- appended at the end (create or replace view allows appending trailing columns).
create or replace view public.user_entitlements as
select
  s.user_id,
  s.plan_tier,
  s.status,
  s.current_period_end,
  s.manually_extended_until,
  s.payment_provider,
  public.is_subscription_active(s.user_id, 'pdv') as pdv_active,
  public.is_subscription_active(s.user_id, 'chat') as chat_active,
  public.subscription_effective_expiry(s) as effective_expiry,
  s.has_mesas_addon,
  s.has_pedidos_addon,
  s.has_acessos_addon,
  s.has_zelo_menu
from public.subscriptions s
where s.status not in ('canceled', 'incomplete');
