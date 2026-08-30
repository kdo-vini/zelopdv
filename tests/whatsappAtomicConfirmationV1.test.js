import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
  'supabase/migrations/20260830202349_confirm_whatsapp_zelo_order_atomic_v1.sql',
), 'utf8').replace(/\r\n/g, '\n').toLowerCase();

describe('confirmação atômica WhatsApp v1', () => {
  it('declara a RPC service-role única, bloqueia sessão antes do token e retorna os três outcomes', () => {
    expect(migration).toContain('create or replace function public.confirm_whatsapp_zelo_order_atomic_v1(');
    expect(migration).toContain('p_message_id text');
    expect(migration).toContain('p_token_hash text default null');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain("s.context <> 'whatsapp_order'");
    expect(migration).toContain("s.state <> 'cart_open'");
    expect(migration).toContain('where id = p_session_id\n   for update;');
    expect(migration).toContain('where token_hash = lower(p_token_hash)\n       and session_id = s.id\n     for update;');
    expect(migration).toContain("'outcome', 'confirmed'");
    expect(migration).toContain("'outcome', 'requires_review'");
    expect(migration).toContain("'outcome', 'conflict'");
    expect(migration).toContain('revoke all on function public.confirm_whatsapp_zelo_order_atomic_v1');
    expect(migration).toContain('to service_role');
  });

  it('rematerializa publicação/preço/estoque e preserva a criação canônica sem TOCTOU', () => {
    expect(migration).toContain('zelomenu_product_publications');
    expect(migration).toContain('visivel_online = true');
    expect(migration).toContain('pausado_manualmente = false');
    expect(migration).toContain('estoque_atual');
    expect(migration).toContain('zelomenu_modifier_groups');
    expect(migration).toContain('zelomenu_modifier_options');
    expect(migration).toContain('public.create_zelo_order(');
    expect(migration).toContain('processedmessageids');
    expect(migration).toContain('last_revalidation');
    expect(migration).toContain('revision = s.revision + 1');
  });
});
