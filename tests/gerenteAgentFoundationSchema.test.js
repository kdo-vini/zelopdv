import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('supabase/migrations/20260902130000_gerente_agent_foundation.sql');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase() : '';
const compact = sql.replace(/\s+/g, ' ');

describe('gerente agent foundation migration', () => {
  it('cria as três tabelas owner-scoped', () => {
    expect(sql).toContain('create table if not exists public.gerente_agent_sessions');
    expect(sql).toContain('create table if not exists public.gerente_agent_messages');
    expect(sql).toContain('create table if not exists public.gerente_agent_actions');
    expect(compact).toContain("channel text not null check (channel in ('app', 'whatsapp'))");
    expect(compact).toContain("role text not null check (role in ('user', 'assistant', 'tool', 'system'))");
    expect(compact).toContain("status text not null default 'pending' check (status in ('pending', 'executed', 'failed', 'cancelled', 'expired'))");
  });

  it('garante uma sessão por canal e uma ação pendente por sessão', () => {
    expect(sql).toContain('gerente_agent_sessions_owner_channel_ref_idx');
    expect(compact).toContain("(owner_user_id, channel, coalesce(channel_ref, ''))");
    expect(sql).toContain('gerente_agent_actions_one_pending_per_session_idx');
    expect(compact).toContain("where status = 'pending'");
  });

  it('leitura via RLS com relatorios.ver e escrita só service_role', () => {
    expect(sql).toContain('enable row level security');
    expect(compact).toContain("owner_user_id = get_owner_user_id(auth.uid()) and fiado_actor_can('relatorios.ver', owner_user_id)");
    expect(sql).toContain('grant select on table public.gerente_agent_sessions to authenticated');
    expect(sql).toContain('grant select on table public.gerente_agent_messages to authenticated');
    expect(sql).toContain('grant select on table public.gerente_agent_actions to authenticated');
    expect(sql).toContain('grant all on table public.gerente_agent_sessions to service_role');
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on table public\.gerente_agent_\w+ to (anon|authenticated)/);
  });

  it('amplia chat_type de ai_usage_logs para gerente_agent', () => {
    expect(compact).toContain("check (chat_type in ('support', 'assistant', 'intelligence', 'gerente_agent'))");
  });
});
