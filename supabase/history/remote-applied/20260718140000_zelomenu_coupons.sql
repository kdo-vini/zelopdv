-- ZeloMenu — cupons de desconto (MVP) e registro de resgate por cliente.
-- Segue o padrão de zelomenu_modifier_groups (id_usuario, RLS 4-policy).

create table if not exists public.zelomenu_coupons (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('valor', 'percentual', 'frete_gratis')),
  discount_value numeric(10,2),
  min_order_value numeric(10,2),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zelomenu_coupons_code_format check (code ~ '^[A-Z0-9-]{3,30}$'),
  constraint zelomenu_coupons_min_order_non_negative check (min_order_value is null or min_order_value >= 0),
  constraint zelomenu_coupons_valor_requires_value
    check (discount_type <> 'valor' or (discount_value is not null and discount_value > 0)),
  constraint zelomenu_coupons_percentual_requires_value
    check (discount_type <> 'percentual' or (discount_value is not null and discount_value > 0 and discount_value <= 100)),
  constraint zelomenu_coupons_frete_gratis_no_value
    check (discount_type <> 'frete_gratis' or discount_value is null),
  constraint zelomenu_coupons_window_order
    check (starts_at is null or expires_at is null or starts_at <= expires_at)
);
create unique index if not exists zelomenu_coupons_user_code_unique
  on public.zelomenu_coupons (id_usuario, lower(code));
comment on table public.zelomenu_coupons is
  'Cupons de desconto do ZeloMenu público (pedido inteiro). Não vale para mesa/QR nem PDV.';
comment on column public.zelomenu_coupons.discount_value is
  'R$ para discount_type=valor, % (0-100] para percentual, null/ignorado para frete_gratis.';
create index if not exists zelomenu_coupons_user_active_idx
  on public.zelomenu_coupons (id_usuario, active);
alter table public.zelomenu_coupons enable row level security;
drop policy if exists zelomenu_coupons_actor_select on public.zelomenu_coupons;
create policy zelomenu_coupons_actor_select
  on public.zelomenu_coupons
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupons_actor_insert on public.zelomenu_coupons;
create policy zelomenu_coupons_actor_insert
  on public.zelomenu_coupons
  for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupons_actor_update on public.zelomenu_coupons;
create policy zelomenu_coupons_actor_update
  on public.zelomenu_coupons
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupons_actor_delete on public.zelomenu_coupons;
create policy zelomenu_coupons_actor_delete
  on public.zelomenu_coupons
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);
revoke all on public.zelomenu_coupons from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_coupons
  to authenticated, service_role;
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.zelomenu_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.zelomenu_coupons(id) on delete cascade,
  id_usuario uuid not null references auth.users(id) on delete cascade,
  customer_phone text not null check (customer_phone ~ '^[0-9]{8,15}$'),
  order_id uuid references public.zelo_orders(id) on delete set null,
  redeemed_at timestamptz not null default now(),

  constraint zelomenu_coupon_redemptions_one_per_customer unique (coupon_id, customer_phone)
);
comment on table public.zelomenu_coupon_redemptions is
  'Registra o resgate de um cupom por telefone do cliente. A constraint unique(coupon_id, customer_phone) é o que impõe "um por cliente".';
create index if not exists zelomenu_coupon_redemptions_user_idx
  on public.zelomenu_coupon_redemptions (id_usuario);
create index if not exists zelomenu_coupon_redemptions_order_idx
  on public.zelomenu_coupon_redemptions (order_id) where order_id is not null;
alter table public.zelomenu_coupon_redemptions enable row level security;
drop policy if exists zelomenu_coupon_redemptions_actor_select on public.zelomenu_coupon_redemptions;
create policy zelomenu_coupon_redemptions_actor_select
  on public.zelomenu_coupon_redemptions
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupon_redemptions_actor_insert on public.zelomenu_coupon_redemptions;
create policy zelomenu_coupon_redemptions_actor_insert
  on public.zelomenu_coupon_redemptions
  for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupon_redemptions_actor_update on public.zelomenu_coupon_redemptions;
create policy zelomenu_coupon_redemptions_actor_update
  on public.zelomenu_coupon_redemptions
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (get_owner_user_id(auth.uid()) = id_usuario);
drop policy if exists zelomenu_coupon_redemptions_actor_delete on public.zelomenu_coupon_redemptions;
create policy zelomenu_coupon_redemptions_actor_delete
  on public.zelomenu_coupon_redemptions
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);
revoke all on public.zelomenu_coupon_redemptions from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_coupon_redemptions
  to authenticated, service_role;
