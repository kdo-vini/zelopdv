-- billing_payments_has_zelo_menu_2026_07_01
--
-- Adiciona coluna has_zelo_menu na tabela billing_payments para espelhar
-- o schema de subscriptions, permitindo que cobranças PIX registrem o
-- add-on ZeloMenu corretamente.
--
-- Aplicar no Supabase:
--   psql "postgresql://..." -f .ai/migrations/billing_payments_has_zelo_menu_2026_07_01.sql

alter table public.billing_payments
  add column if not exists has_zelo_menu boolean not null default false;

comment on column public.billing_payments.has_zelo_menu is
  'Espelha subscriptions.has_zelo_menu no momento da cobrança.';
