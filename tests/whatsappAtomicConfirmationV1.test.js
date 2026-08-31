import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
  'supabase/migrations/20260830202349_confirm_whatsapp_zelo_order_atomic_v1.sql',
), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const runtimeVerifier = readFileSync(resolve(
  'supabase/verification/whatsapp_atomic_confirmation_v1_runtime.sql',
), 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const disposableHarness = readFileSync(resolve(
  'scripts/verify-whatsapp-confirmation-concurrency.mjs',
), 'utf8').replace(/\r\n/g, '\n');

describe('confirmação atômica WhatsApp v1', () => {
  it('preserva a RPC service-role, a ordem sessão→token e os três outcomes', () => {
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

  it('rematerializa o shape canônico exato e modifiers aninhados com quantidade e modo de preço', () => {
    expect(migration).toContain('create or replace function public.zelomenu_whatsapp_materialize_cart_v1(');
    expect(migration).toContain("v_group_input->'selectedoptions'");
    expect(migration).toContain("'baseunitprice'");
    expect(migration).toContain("'modifierdeltatotal'");
    expect(migration).toContain("'observations'");
    expect(migration).toContain("'couponcode'");
    expect(migration).toContain("'coupondiscounttype'");
    expect(migration).toContain("'coupondiscountvalue'");
    expect(migration).not.toContain("'position',");
    expect(migration).toContain("v_group.modo_preco = 'substituir'");
    expect(migration).toContain('v_group.min_selecoes');
    expect(migration).toContain('v_group.max_selecoes');
    expect(migration).toContain('v_group.permite_quantidade');
    expect(migration).toContain('v_group.maximo_por_opcao');
    expect(migration).toContain('add column if not exists minimo_total_quantidade integer not null default 0');
    expect(migration).toContain('add column if not exists maximo_total_quantidade integer');
    expect(migration).toContain('v_group.minimo_total_quantidade');
    expect(migration).toContain('v_group.maximo_total_quantidade');
    expect(migration).toContain('v_total_quantity < v_group.minimo_total_quantidade');
    expect(migration).toContain('v_total_quantity > v_group.maximo_total_quantidade');
    expect(migration).toContain('zelomenu_modifier_option_products');
    expect(migration).toContain('price_override');
  });

  it('trava e revalida todo o catálogo público, inclusive grupos obrigatórios e estoque agregado', () => {
    for (const table of [
      'zelomenu_product_publications',
      'zelomenu_modifier_groups',
      'zelomenu_modifier_options',
      'zelomenu_modifier_option_products',
    ]) {
      expect(migration).toMatch(new RegExp(`from public\\.${table}[\\s\\S]{0,1200}for update`));
    }
    expect(migration).toContain('join public.categorias');
    expect(migration).toContain('pub.nome_publico');
    expect(migration).toContain('required_group_unavailable');
    expect(migration).toContain('sum(requirement.required_quantity)');
    expect(migration).toContain('linked_product_id');
    expect(migration).toContain('stock_unavailable');
  });

  it('revalida ASAP/agendamento e entrega elegível com cobertura, taxa e cache atuais', () => {
    expect(migration).toContain('create or replace function public.zelomenu_whatsapp_fulfillment_v1(');
    expect(migration).toContain("v_delivery_status <> 'eligible'");
    expect(migration).not.toContain("not in ('quoted', 'available')");
    expect(migration).toContain('horario_semanal');
    expect(migration).toContain('zelomenu_scheduling_enabled');
    expect(migration).toContain('zelomenu_scheduling_lead_time_minutes');
    expect(migration).toContain('zelomenu_delivery_distance_cache');
    expect(migration).toContain('origin_location_version = ep.delivery_location_version');
    expect(migration).toContain('cache.expires_at > p_now');
    expect(migration).toContain('request.session_id = p_session_id');
    expect(migration).toContain("request.resolved_snapshot->>'originlocationversion'");
    expect(migration).toContain('ep.delivery_location_version');
    expect(migration).toContain('zelomenu_delivery_ranges');
    expect(migration).toContain('zelomenu_delivery_pricing_rules');
    expect(migration).toContain('zelomenu_delivery_pricing_rule_ranges');
    expect(migration).toContain("coalesce(ep.delivery_config->>'enabled', 'false') <> 'true'");
  });

  it('mantém criação canônica, CAS de review e snapshots coerentes na mesma transação', () => {
    expect(migration).toContain('public.create_zelo_order(');
    expect(migration).toContain('processedmessageids');
    expect(migration).toContain('last_revalidation');
    expect(migration).toContain('revision = s.revision + 1');
    expect(migration).toContain('fulfillment_snapshot = v_fulfillment');
    expect(migration).toContain('where id = s.id and revision = s.revision');
  });

  it('inclui verificador comportamental transacional com fixtures reais para os sete regressions', () => {
    expect(runtimeVerifier).toContain('begin;');
    expect(runtimeVerifier).toContain('rollback;');
    expect(runtimeVerifier).toContain('insert into public.produtos');
    expect(runtimeVerifier).toContain('insert into public.zelomenu_modifier_option_products');
    expect(runtimeVerifier).toContain('insert into public.zelomenu_delivery_distance_cache');
    expect(runtimeVerifier).toContain('public.confirm_whatsapp_zelo_order_atomic_v1');
    expect(runtimeVerifier).toContain('nested_modifier_shape_ok');
    expect(runtimeVerifier).toContain('modifier_total_quantity_3_vs_1_ok');
    expect(runtimeVerifier).toContain('aggregate_linked_stock_review_ok');
    expect(runtimeVerifier).toContain('stale_delivery_review_ok');
    expect(runtimeVerifier).toContain('quote_request_session_binding_ok');
    expect(runtimeVerifier).toContain('quote_request_origin_version_required_ok');
    expect(runtimeVerifier).toContain('canonical_noop_confirmed_ok');
  });

  it('estende o harness descartável fail-closed sem aceitar URL genérica', () => {
    expect(disposableHarness).toContain('whatsapp_atomic_confirmation_v1_runtime.sql');
    expect(disposableHarness).toContain("process.env.ZELOPDV_RUN_WHATSAPP_CONFIRMATION_CONCURRENCY !== '1'");
    expect(disposableHarness).toContain('process.env.ZELOPDV_DISPOSABLE_DB_URL');
    expect(disposableHarness).not.toContain('process.env.DATABASE_URL');
    expect(disposableHarness).not.toContain('process.env.SUPABASE_DB_URL');
    expect(disposableHarness).toContain("url.hostname !== '127.0.0.1'");
    expect(disposableHarness).toContain("url.port !== '55322'");
    expect(disposableHarness).toContain('finalizePsql');
  });
});
