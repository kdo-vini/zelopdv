import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  'supabase/migrations/20260829120000_whatsapp_order_canonical_contract.sql',
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const compactMigration = migration.replace(/\s+/g, ' ');

describe('contrato canônico de pedido iniciado no WhatsApp', () => {
  it('materializa whatsapp_order pelo create_zelo_order de cinco argumentos', () => {
    expect(migration).toContain("s.context not in ('whatsapp_order', 'public_order', 'table_order')");
    expect(migration).toContain("when s.context = 'whatsapp_order' then 'whatsapp'");
    expect(migration).toContain("v_source not in ('zelomenu', 'zelochat', 'whatsapp', 'manual', 'legacy_zelochat', 'legacy_pedido', 'mesa')");
    expect(migration).toContain('create or replace function public.create_zelo_order(');
    expect(migration).toContain('p_pessoa_id uuid default null');
    expect(migration).not.toContain('create or replace function public.create_zelo_order(\n  p_session_id uuid,\n  p_expected_revision integer,\n  p_idempotency_key text,\n  p_snapshots jsonb\n)');
    expect(migration).toContain('revoke all on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)');
    expect(migration).toContain('grant execute on function public.create_zelo_order(uuid, integer, text, jsonb, uuid)\n  to service_role');
  });

  it('guarda overrides por relacionamento e uma única sessão aberta por conversa', () => {
    expect(compactMigration).toContain("add column if not exists ordering_overrides jsonb not null default '{}'::jsonb");
    expect(compactMigration).toContain('check (jsonb_typeof(ordering_overrides) = \'object\')');
    expect(migration).toContain('comment on column public.zelochat_customer_relationships.ordering_overrides is');
    expect(migration).toContain('zelochat_cart_sessions_one_open_whatsapp_order_per_conversation');
    expect(compactMigration).toContain("on public.zelomenu_cart_sessions (empresa_id, source_ref) where context = 'whatsapp_order' and state = 'cart_open'");
    expect(migration).toContain("set state = 'archived'");
    expect(migration).toContain("'superseded_open_whatsapp_cart'");
  });

  it('substitui a unicidade legada sem bloquear a próxima conversa WhatsApp após confirmação', () => {
    expect(migration).toContain(
      'drop index if exists public.zelomenu_cart_sessions_active_source_ref_key;',
    );
    expect(compactMigration).toContain(
      "create unique index if not exists zelomenu_cart_sessions_active_non_whatsapp_source_ref_key on public.zelomenu_cart_sessions (empresa_id, context, source_ref) where context in ('public_order', 'table_order') and archived_at is null",
    );
  });

  it('rejeita source whatsapp sem uma sessão whatsapp_order', () => {
    expect(migration).toContain("if v_source = 'whatsapp' then");
    expect(migration).toContain("message = 'whatsapp_order_session_required'");
  });

  it('preserva os contextos existentes ao afirmar o contrato do carrinho', () => {
    expect(migration).toContain("check (context = any (array['whatsapp_order'::text, 'public_order'::text, 'table_order'::text]))");
    expect(migration).toContain("check (source = any (array['zelomenu'::text, 'zelochat'::text, 'whatsapp'::text, 'manual'::text, 'legacy_zelochat'::text, 'legacy_pedido'::text, 'mesa'::text]))");
  });
});
