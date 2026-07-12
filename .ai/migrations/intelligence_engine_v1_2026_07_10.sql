-- ============================================================================
-- Zelo Intelligence Engine V1 — snapshots, sinais, runs, flag
--
-- Cria as tabelas de suporte ao motor determinístico de métricas + detecção
-- de sinais. Nenhuma UI, notificação ou LLM nesta fase.
--
-- Pré-requisitos (Phase 0 a validar no banco real):
--   - Tipos de produtos.id, vendas.id, caixas.id
--   - Existência de get_owner_user_id(auth.uid())
--   - Índices existentes nas tabelas-fonte (vendas, vendas_itens, etc.)
-- ============================================================================

-- 1) Snapshot diário de métricas por empresa
create table if not exists public.business_daily_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  snapshot_date date not null,
  metrics jsonb not null,
  receita_bruta numeric(12,2) not null default 0,
  receita_realizada numeric(12,2) not null default 0,
  qtd_vendas integer not null default 0,
  ticket_medio numeric(12,2),
  fiado_saldo_total numeric(12,2),
  engine_version text not null,
  computed_at timestamptz not null default now(),
  constraint business_daily_snapshots_user_date_uniq unique (user_id, snapshot_date)
);

comment on table public.business_daily_snapshots is
  'Zelo Intelligence Engine — snapshot diário de métricas por empresa (America/Sao_Paulo).';

-- 2) Sinais detectados
create table if not exists public.business_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  signal_date date not null,
  type text not null,
  dedupe_key text not null,
  severity text not null check (severity in ('info', 'attention', 'critical')),
  score numeric(8,4) not null,
  confidence numeric(4,3) not null,
  evidence jsonb not null,
  narrative text,
  narrative_source text check (narrative_source in ('llm', 'template')),
  read_at timestamptz,
  engine_version text not null,
  created_at timestamptz not null default now(),
  constraint business_signals_user_date_key_uniq unique (user_id, signal_date, dedupe_key)
);

comment on table public.business_signals is
  'Zelo Intelligence Engine — sinais determinísticos detectados por empresa/dia.';

-- 3) Observabilidade de execução
create table if not exists public.business_intelligence_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  target_date date not null,
  companies_scanned integer not null default 0,
  companies_processed integer not null default 0,
  companies_skipped integer not null default 0,
  companies_failed integer not null default 0,
  signals_created integer not null default 0,
  signals_suppressed integer not null default 0,
  llm_calls integer not null default 0,
  llm_tokens_in integer not null default 0,
  llm_tokens_out integer not null default 0,
  llm_cost_usd numeric(10,6) not null default 0,
  errors jsonb not null default '[]'::jsonb,
  engine_version text not null
);

comment on table public.business_intelligence_runs is
  'Zelo Intelligence Engine — registro de cada execução do cron diário.';

-- 4) Feature flag de rollout (piloto por empresa)
alter table public.empresa_perfil
  add column if not exists intelligence_enabled_at timestamptz;

-- ============================================================================
-- RLS: leitura owner-scoped; escrita só service role
-- ============================================================================
alter table public.business_daily_snapshots enable row level security;
alter table public.business_signals enable row level security;
alter table public.business_intelligence_runs enable row level security;

-- Owner e subusuários da empresa leem (mesmo padrão das tabelas operacionais)
create policy business_snapshots_select_owner on public.business_daily_snapshots
  for select
  to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()));

create policy business_signals_select_owner on public.business_signals
  for select
  to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()));

-- Marcar como lido (única escrita permitida ao client)
create policy business_signals_update_read on public.business_signals
  for update
  to authenticated
  using (user_id = public.get_owner_user_id(auth.uid()))
  with check (user_id = public.get_owner_user_id(auth.uid()));

-- Runs: só service role (nenhuma policy para authenticated)

-- ============================================================================
-- Grants mínimos
-- ============================================================================
revoke all on public.business_daily_snapshots from anon, authenticated, service_role;
revoke all on public.business_signals from anon, authenticated, service_role;
revoke all on public.business_intelligence_runs from anon, authenticated;

grant select on public.business_daily_snapshots to authenticated, service_role;
grant select, update (read_at) on public.business_signals to authenticated;
grant insert, update, delete on public.business_daily_snapshots to service_role;
-- service_role precisa de SELECT em business_signals: o engine lê o último
-- sinal por dedupe_key para aplicar cooldown (fetchLastSignalDates).
grant select, insert, update, delete on public.business_signals to service_role;
grant insert, select, update on public.business_intelligence_runs to service_role;

-- ============================================================================
-- Índices
-- ============================================================================
-- Feed in-app: sinais mais recentes primeiro
create index if not exists business_signals_user_date_idx
  on public.business_signals (user_id, signal_date desc);

-- Cooldown lookup: último sinal do mesmo tipo/entidade
create index if not exists business_signals_dedupe_date_idx
  on public.business_signals (user_id, dedupe_key, signal_date desc);

-- Snapshots por empresa (além do unique já indexado)
create index if not exists business_snapshots_user_date_idx
  on public.business_daily_snapshots (user_id, snapshot_date desc);

-- ============================================================================
-- Índices em tabelas-fonte (criar apenas se ausentes — validar na Phase 0)
-- ============================================================================
create index if not exists vendas_usuario_created_idx
  on public.vendas (id_usuario, created_at desc);

create index if not exists vendas_itens_venda_idx
  on public.vendas_itens (id_venda);

create index if not exists vendas_pagamentos_venda_idx
  on public.vendas_pagamentos (id_venda);

create index if not exists caixa_fechamentos_usuario_data_idx
  on public.caixa_fechamentos (id_usuario, data_fechamento desc);

notify pgrst, 'reload schema';
