-- Cobertura mínima de uso de módulos: uma presença por empresa, módulo e dia.
-- Não registra cliques, conteúdo digitado, itens consultados ou dados pessoais.
create table if not exists public.product_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  usage_date date not null,
  feature text not null check (feature in (
    'pdv', 'gerente', 'relatorios', 'zelinho', 'produtos', 'estoque',
    'clientes', 'caixa', 'despesas', 'mesas', 'pedidos', 'acessos', 'ferramentas'
  )),
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint product_usage_events_user_date_feature_uniq unique (user_id, usage_date, feature)
);

comment on table public.product_usage_events is
  'Telemetria operacional mínima: presença diária por módulo, sem rastrear cliques ou conteúdo.';

alter table public.product_usage_events enable row level security;
revoke all on public.product_usage_events from anon, authenticated;
grant select, insert, update, delete on public.product_usage_events to service_role;
grant usage, select on sequence public.product_usage_events_id_seq to service_role;

create index if not exists product_usage_events_user_date_idx
  on public.product_usage_events (user_id, usage_date desc);

notify pgrst, 'reload schema';
