-- Tabela de assinaturas Stripe sincronizada via webhook
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text check (status in ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  price_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

-- Usuário autenticado pode ver sua própria assinatura
create policy if not exists "subscriptions_self_select" on public.subscriptions
  for select using (
    auth.uid() = user_id
    or (user_email is not null and user_email = (auth.jwt() ->> 'email'))
  );

-- Webhook (service role) pode inserir/atualizar
create policy if not exists "subscriptions_service_upsert" on public.subscriptions
  for insert to authenticated, anon with check (false); -- placeholder to avoid open writes

-- OBS: Inserts/updates reais acontecem com a service role key pelo webhook (sem RLS).
