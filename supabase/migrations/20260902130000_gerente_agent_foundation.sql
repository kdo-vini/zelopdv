-- Zelinho Gerente conversacional: sessões, histórico e ações confirmadas.
-- Leitura owner-scoped via RLS (mesma capability do Gerente); escrita só pelo servidor.

create table if not exists public.gerente_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('app', 'whatsapp')),
  channel_ref text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create unique index if not exists gerente_agent_sessions_owner_channel_ref_idx
  on public.gerente_agent_sessions (owner_user_id, channel, coalesce(channel_ref, ''));

create table if not exists public.gerente_agent_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.gerente_agent_sessions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  created_at timestamptz not null default now()
);

create index if not exists gerente_agent_messages_session_created_idx
  on public.gerente_agent_messages (session_id, created_at desc);

create table if not exists public.gerente_agent_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.gerente_agent_sessions(id) on delete cascade,
  actor_user_id uuid,
  channel text not null check (channel in ('app', 'whatsapp')),
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'executed', 'failed', 'cancelled', 'expired')),
  before_state jsonb,
  after_state jsonb,
  result jsonb,
  error text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create unique index if not exists gerente_agent_actions_one_pending_per_session_idx
  on public.gerente_agent_actions (session_id)
  where status = 'pending';

create index if not exists gerente_agent_actions_owner_created_idx
  on public.gerente_agent_actions (owner_user_id, created_at desc);

alter table public.gerente_agent_sessions enable row level security;
alter table public.gerente_agent_messages enable row level security;
alter table public.gerente_agent_actions enable row level security;

drop policy if exists gerente_agent_sessions_select_owner on public.gerente_agent_sessions;
create policy gerente_agent_sessions_select_owner
  on public.gerente_agent_sessions for select
  using (owner_user_id = get_owner_user_id(auth.uid()) and fiado_actor_can('relatorios.ver', owner_user_id));

drop policy if exists gerente_agent_messages_select_owner on public.gerente_agent_messages;
create policy gerente_agent_messages_select_owner
  on public.gerente_agent_messages for select
  using (owner_user_id = get_owner_user_id(auth.uid()) and fiado_actor_can('relatorios.ver', owner_user_id));

drop policy if exists gerente_agent_actions_select_owner on public.gerente_agent_actions;
create policy gerente_agent_actions_select_owner
  on public.gerente_agent_actions for select
  using (owner_user_id = get_owner_user_id(auth.uid()) and fiado_actor_can('relatorios.ver', owner_user_id));

revoke all on table public.gerente_agent_sessions from public, anon, authenticated;
revoke all on table public.gerente_agent_messages from public, anon, authenticated;
revoke all on table public.gerente_agent_actions from public, anon, authenticated;
grant select on table public.gerente_agent_sessions to authenticated;
grant select on table public.gerente_agent_messages to authenticated;
grant select on table public.gerente_agent_actions to authenticated;
grant all on table public.gerente_agent_sessions to service_role;
grant all on table public.gerente_agent_messages to service_role;
grant all on table public.gerente_agent_actions to service_role;

alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_chat_type_check;
alter table public.ai_usage_logs
  add constraint ai_usage_logs_chat_type_check
  check (chat_type in ('support', 'assistant', 'intelligence', 'gerente_agent'));
