import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  'supabase/migrations/20260829121000_whatsapp_confirmation_tokens.sql',
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const compactMigration = migration.replace(/\s+/g, ' ');

describe('tokens opacos para confirmação de pedido WhatsApp', () => {
  it('persiste somente o hash SHA-256 ligado à sessão, conversa, revisão e validade', () => {
    expect(migration).toContain('create table if not exists public.zelomenu_whatsapp_confirmation_tokens');
    expect(migration).toContain('token_hash text not null unique');
    expect(migration).toContain("check (token_hash ~ '^[0-9a-f]{64}$')");
    expect(compactMigration).toContain('empresa_id uuid not null');
    expect(compactMigration).toContain('session_id uuid not null references public.zelomenu_cart_sessions(id) on delete cascade');
    expect(compactMigration).toContain('source_ref text not null');
    expect(compactMigration).toContain('revision integer not null check (revision > 0)');
    expect(compactMigration).toContain('expires_at timestamptz not null');
    expect(migration).toContain('invalidated_at timestamptz');
    expect(migration).toContain('zelomenu_whatsapp_confirmation_tokens_cleanup_idx');
  });

  it('bloqueia token e sessão, valida todos os bindings e expiração antes da confirmação', () => {
    expect(migration).toContain('create or replace function public.confirm_whatsapp_zelo_order(');
    expect(migration).toContain('for update');
    expect(migration).toContain("s.context <> 'whatsapp_order'");
    expect(migration).toContain('v_token.empresa_id <> p_empresa_id');
    expect(migration).toContain('v_token.source_ref <> p_source_ref');
    expect(migration).toContain('v_token.revision <> p_expected_revision');
    expect(migration).toContain('s.revision <> p_expected_revision');
    expect(migration).toContain('v_token.expires_at <= now()');
    expect(migration).toContain("message = 'confirmation_token_expired'");
  });

  it('usa o agregado canônico e torna consumo/retry idempotentes', () => {
    expect(migration).toContain('public.create_zelo_order(');
    expect(migration).toContain('where zelomenu_session_id = v_token.session_id');
    expect(migration).toContain('v_token.consumed_at is not null');
    expect(compactMigration).toContain('set consumed_at = now() where id = v_token.id and consumed_at is null');
    expect(migration).not.toMatch(/insert\s+into\s+public\.zelo_orders/);
  });

  it('emite e substitui tokens somente por RPC atômica, serializada pela sessão', () => {
    expect(migration).toContain('create or replace function public.issue_whatsapp_zelo_confirmation_token(');
    expect(migration).toContain("s.context <> 'whatsapp_order'");
    expect(migration).toContain("s.state <> 'cart_open'");
    expect(migration).toContain('where session_id = s.id');
    expect(compactMigration).toContain('set invalidated_at = now() where session_id = s.id and consumed_at is null and invalidated_at is null');
    expect(migration).toContain('insert into public.zelomenu_whatsapp_confirmation_tokens');
    expect(migration).toContain('grant execute on function public.issue_whatsapp_zelo_confirmation_token');
    expect(migration).toContain('to service_role');
  });

  it('usa a mesma ordem sessão→token e deriva a idempotência do binding imutável', () => {
    const confirmationStart = migration.indexOf('create or replace function public.confirm_whatsapp_zelo_order(');
    const confirmation = migration.slice(confirmationStart);
    const sessionLock = confirmation.search(/from public\.zelomenu_cart_sessions\s+where id = v_session_id\s+for update;/);
    const tokenLock = confirmation.search(/from public\.zelomenu_whatsapp_confirmation_tokens\s+where token_hash = lower\(p_token_hash\)\s+and session_id = s\.id\s+for update;/);

    expect(sessionLock).toBeGreaterThan(-1);
    expect(tokenLock).toBeGreaterThan(sessionLock);
    expect(confirmation).toContain("v_idempotency_key := 'whatsapp:' || v_token.session_id::text || ':' || v_token.id::text;");
    expect(confirmation).toContain('v_idempotency_key,');
    expect(confirmation).not.toContain('    p_idempotency_key,\n    \'{}\'::jsonb,');
    expect(confirmation).toContain("message = 'confirmation_canonical_order_session_mismatch'");
  });

  it('mantém tabela e RPC exclusivas de service_role e registra o limite de revalidação', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table public.zelomenu_whatsapp_confirmation_tokens from public, anon, authenticated');
    expect(migration).toContain('grant all on table public.zelomenu_whatsapp_confirmation_tokens to service_role');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain('revoke all on function public.confirm_whatsapp_zelo_order');
    expect(migration).toContain('grant execute on function public.confirm_whatsapp_zelo_order');
    expect(migration).toContain('revoke all on function public.issue_whatsapp_zelo_confirmation_token');
    expect(migration).toContain('revalidação completa de catálogo e preço ocorre no zelomenu');
  });
});
