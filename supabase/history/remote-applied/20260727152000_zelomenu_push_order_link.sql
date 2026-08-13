alter table public.zelomenu_push_subscriptions
  add column if not exists order_id text;
create index if not exists idx_zelomenu_push_subscriptions_order_id
  on public.zelomenu_push_subscriptions (order_id);
