import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve('.ai/migrations/canonical_order_sales_2026_07_23.sql'), 'utf8')
  .replace(/\r\n/g, '\n')
  .toLowerCase();

describe('lancamento financeiro de pedidos canonicos', () => {
  it('materializa uma venda no caixa aberto quando o pedido e entregue', () => {
    expect(sql).toContain('ensure_zelo_order_sale');
    expect(sql).toContain("new.status = 'delivered'");
    expect(sql).toContain("data_fechamento is null");
    expect(sql).toContain("client_sale_id := 'zelo-order:' || v_order.id");
    expect(sql).toContain('created_at = least(created_at, v_sale_at)');
    expect(sql).toContain('set created_at = least(v.created_at, o.closed_at)');
    expect(sql).toContain('insert into public.vendas_itens');
    expect(sql).toContain('create trigger zelo_order_sale_on_deliver');
  });

  it('mantem o lancamento idempotente e recupera entregas sem venda', () => {
    expect(sql).toContain('on conflict (id_usuario, client_sale_id)');
    expect(sql).toMatch(/where\s+o\.status\s*=\s*'delivered'\s+and\s+o\.sale_id\s+is\s+null/);
    expect(sql).toContain("o.source = 'zelomenu'");
  });

  it('vincula a venda ao caixa que estava aberto no instante da entrega', () => {
    expect(sql).toContain('c.data_abertura <= v_sale_at');
    expect(sql).toContain('(c.data_fechamento is null or c.data_fechamento >= v_sale_at)');
    expect(sql).toContain('new.closed_at');
  });
});
