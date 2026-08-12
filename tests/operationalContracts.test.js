import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('contrato operacional do banco', () => {
  it('mantém todos os estados canônicos de pedido e a chave de idempotência', () => {
    const sql = read('.ai/migrations/canonical_online_orders_2026_07_12.sql');
    for (const status of [
      'pending_payment', 'pending_review', 'accepted', 'preparing', 'ready',
      'out_for_delivery', 'delivered', 'rejected', 'cancelled',
    ]) expect(sql).toContain(`'${status}'`);
    expect(sql).toContain('zelo_orders_idempotency_uidx');
    expect(sql).toContain('empresa_id,idempotency_key');
  });

  it('protege pedidos canônicos por tenant e deixa outbox apenas para service role', () => {
    const sql = read('.ai/migrations/canonical_online_orders_2026_07_12.sql');
    expect(sql).toContain('get_owner_user_id(auth.uid())');
    expect(sql).toContain('alter table public.zelo_orders enable row level security');
    expect(sql).toContain('revoke all on public.zelo_orders');
    expect(sql).toContain('grant select,insert,update,delete on public.zelo_orders');
  });

  it('faz transição com revisão esperada, ator e auditoria', () => {
    const sql = read('.ai/migrations/canonical_online_orders_2026_07_12.sql');
    expect(sql).toContain('transition_zelo_order');
    expect(sql).toContain('p_expected_revision');
    expect(sql).toContain('zelo_order_events');
    expect(sql).toContain('revision=revision+1');
  });

  it('fecha pedido uma única vez e impede duplicação de venda', () => {
    const sql = read('.ai/migrations/canonical_order_sales_2026_07_23.sql');
    const close = read('.ai/migrations/canonical_online_orders_2026_07_12.sql');
    expect(close).toContain('close_zelo_order');
    expect(close).toContain('if o.sale_id is not null then return');
    expect(sql).toContain('v_client_sale_id');
    expect(close).toContain('update public.zelo_orders set sale_id=');
  });

  it('mantém baixa/restauração de estoque individual, compartilhado e modifiers', () => {
    const sql = read('.ai/migrations/produtos_montaveis_pdv_2026_07_31.sql');
    expect(sql).toContain('comanda_aplicar_delta_item');
    expect(sql).toContain('estoque_compartilhado_atual');
    expect(sql).toContain('zelomenu_modifier_option_products');
    expect(sql).toContain('comanda_cancelar_com_estoque');
    expect(sql).toContain('raise exception');
  });

  it('aplica limites e rollback no allocation ledger de mesas', () => {
    const sql = read('.ai/migrations/mesas_payment_item_allocation_2026_08_03.sql');
    expect(sql).toContain('comanda_pagamento_itens_validate_quantity');
    expect(sql).toContain('Quantidade alocada excede a quantidade do item da comanda');
    expect(sql).toContain('id_pagamento');
    expect(sql).toContain('on delete set null');
    expect(sql).toContain('get_owner_user_id(auth.uid()) = id_usuario');
  });

  it('preserva idempotência e operador no replay offline', () => {
    const sql = read('.ai/migrations/offline_sales_idempotency_2026_05_12.sql');
    expect(sql).toContain('client_sale_id');
    expect(sql).toContain('vendas_user_client_sale_id_unique');
    expect(sql).toContain('id_usuario');
    expect(sql).toContain('created_at');
  });

  it('mantém regras de acesso owner-scoped em roles, usuários e auditoria', () => {
    const sql = read('docs/modules/ACESSOS.md');
    const server = read('src/lib/server/accessControl.js');
    for (const table of ['access_roles', 'access_users', 'access_settings', 'access_audit_logs']) {
      expect(server).toContain(table);
    }
    expect(sql).toContain('owner_user_id');
    expect(sql).toContain('get_owner_user_id(auth.uid())');
    expect(server).toContain('owner_user_id');
  });

  it('expõe endpoints operacionais essenciais com handlers reais', () => {
    const routes = [
      'src/routes/api/access/roles/+server.js',
      'src/routes/api/access/users/+server.js',
      'src/routes/api/access/activate/+server.js',
      'src/routes/api/access/audit-login/+server.js',
      'src/routes/api/access/roles/[id]/+server.js',
      'src/routes/api/access/users/[id]/+server.js',
      'src/routes/api/account/delete/+server.js',
      'src/routes/api/account/reactivate/+server.js',
      'src/routes/api/produtos/+server.js',
      'src/routes/api/mesas/cozinha/+server.js',
    ];
    for (const route of routes) {
      expect(fs.existsSync(path.join(root, route)), route).toBe(true);
      expect(read(route)).toMatch(/export (async )?function (GET|POST|PATCH|DELETE|OPTIONS)/);
    }
  });

  it('mantém guards explícitos para assinatura, perfil e add-ons', () => {
    const guards = read('src/lib/guards.js');
    expect(guards).toContain('ensureActiveSubscription');
    expect(guards).toContain('hasMesasAddon');
    expect(guards).toContain('hasZeloMenuAccess');
    expect(guards).toContain('hasAcessosAddon');
    expect(guards).toContain('perfil');
  });
});
