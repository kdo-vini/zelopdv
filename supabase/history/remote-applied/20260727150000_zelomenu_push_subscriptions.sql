-- Anonymous PWA subscriptions. The service role owns writes; no customer
-- account is required to receive order updates or opt-in campaigns.
create table if not exists public.zelomenu_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  client_id text not null,
  subscription jsonb not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_zelomenu_push_subscriptions_client_id
  on public.zelomenu_push_subscriptions (client_id);
comment on table public.zelomenu_push_subscriptions is
  'ZeloMenu: subscriptions PWA para atualizações de pedidos e campanhas com consentimento.';
