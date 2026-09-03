-- Uma sessão aberta por canal; as fechadas viram histórico.
alter table public.gerente_agent_sessions add column if not exists title text;

drop index if exists public.gerente_agent_sessions_owner_channel_ref_idx;

create unique index if not exists gerente_agent_sessions_open_owner_channel_ref_idx
  on public.gerente_agent_sessions (owner_user_id, channel, coalesce(channel_ref, ''))
  where status = 'open';

create index if not exists gerente_agent_sessions_owner_last_message_idx
  on public.gerente_agent_sessions (owner_user_id, last_message_at desc nulls last);
