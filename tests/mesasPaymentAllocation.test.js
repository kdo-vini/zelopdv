import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  allocatePaymentItems,
  calculateAllocatedSubtotal,
  PaymentAllocationError,
  validateItemAllocations,
} from '../src/lib/mesasPaymentAllocation.js';

const items = [
  { id: 'item-a', quantidade: 2, preco_unitario: 12.5 },
  { id: 'item-b', quantidade: 1, preco_unitario: 8 },
];

const migration = readFileSync(
  resolve('supabase/migrations/20260803164855_mesas_payment_item_allocation.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const ownerPolicyMigration = readFileSync(
  resolve('supabase/migrations/20260803170000_mesas_owner_scoped_payment_policies.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

function thrownBy(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

describe('mesas payment item allocation', () => {
  it('allocates selected quantities and calculates the subtotal', () => {
    const result = allocatePaymentItems({
      paymentId: 'payment-1',
      userId: 'owner-1',
      items,
      allocations: [{ id_comanda_item: 'item-a', quantidade: 1 }],
    });

    expect(result.subtotal).toBe(12.5);
    expect(result.rows).toEqual([{
      id_pagamento: 'payment-1',
      id_comanda_item: 'item-a',
      id_usuario: 'owner-1',
      quantidade: 1,
      preco_unitario: 12.5,
      valor: 12.5,
    }]);
  });

  it('allows the remaining quantity after a previous payment', () => {
    const result = validateItemAllocations({
      items,
      existingAllocations: [
        { id_comanda_item: 'item-a', quantidade: 1 },
        { id_comanda_item: 'item-a', quantidade: 0.5 },
      ],
      allocations: [{ id_comanda_item: 'item-a', quantidade: 0.5 }],
    });

    expect(result.subtotal).toBe(6.25);
    expect(result.quantitiesByItem['item-a']).toBe(2);
  });

  it('rejects allocations above the comanda quantity', () => {
    expect(() => validateItemAllocations({
      items,
      allocations: [{ id_comanda_item: 'item-a', quantidade: 3 }],
    })).toThrowError(PaymentAllocationError);

    expect(thrownBy(() => validateItemAllocations({
      items,
      existingAllocations: [{ id_comanda_item: 'item-a', quantidade: 2 }],
      allocations: [{ id_comanda_item: 'item-a', quantidade: 0.01 }],
    }))).toMatchObject({ code: 'quantity_exceeded' });
  });

  it('rejects unknown items and duplicate allocation rows', () => {
    expect(thrownBy(() => validateItemAllocations({
      items,
      allocations: [{ id_comanda_item: 'missing', quantidade: 1 }],
    }))).toMatchObject({ code: 'item_not_found' });

    expect(thrownBy(() => validateItemAllocations({
      items,
      allocations: [
        { id_comanda_item: 'item-a', quantidade: 1 },
        { id_comanda_item: 'item-a', quantidade: 1 },
      ],
    }))).toMatchObject({ code: 'duplicate_allocation' });
  });

  it('keeps general payments compatible by returning no child rows', () => {
    const result = allocatePaymentItems({
      paymentId: 'payment-general',
      userId: 'owner-1',
      items,
    });

    expect(result.rows).toEqual([]);
    expect(result.subtotal).toBe(0);
    expect(calculateAllocatedSubtotal([], items)).toBe(0);
  });

  it('rounds each allocated line and the total to cents', () => {
    const result = allocatePaymentItems({
      items: [{ id: 'item-c', quantidade: 3, preco_unitario: 0.335 }],
      allocations: [{ id_comanda_item: 'item-c', quantidade: 3 }],
    });

    expect(result.rows[0].valor).toBe(1.01);
    expect(result.subtotal).toBe(1.01);
  });

  it('keeps the allocation ledger after parent payment cleanup', () => {
    expect(migration).toContain('create table if not exists public.comanda_pagamento_itens');
    expect(migration).toContain('id_pagamento uuid references public.comanda_pagamentos(id) on delete set null');
    expect(migration).toContain('id_venda bigint references public.vendas(id) on delete set null');
    expect(migration).toContain('id_venda_pagamento bigint references public.vendas_pagamentos(id) on delete set null');
    expect(migration).toContain('id_venda_item bigint references public.vendas_itens(id) on delete set null');
    expect(migration).toContain('id_comanda_pagamento uuid');
    expect(migration).toContain('comanda_pagamento_itens_validate_quantity');
  });

  it('defines tenant-scoped RLS and explicit grants for the child table', () => {
    expect(migration).toContain('alter table public.comanda_pagamento_itens enable row level security');
    expect(migration).toContain('create policy comanda_pagamento_itens_select');
    expect(migration).toContain('create policy comanda_pagamento_itens_insert');
    expect(migration).toContain('get_owner_user_id(auth.uid()) = id_usuario');
    expect(migration).toContain('revoke all on public.comanda_pagamento_itens from anon');
    expect(migration).toContain('grant select, insert, update, delete on public.comanda_pagamento_itens to authenticated, service_role');
  });

  it('keeps payment and close inserts owner-scoped for subusers', () => {
    expect(ownerPolicyMigration).toContain('get_owner_user_id(auth.uid()) = id_usuario');
    expect(ownerPolicyMigration).toContain('create policy comanda_pagamentos_actor_insert');
    expect(ownerPolicyMigration).toContain('create policy vendas_actor_insert');
    expect(ownerPolicyMigration).toContain('create policy vendas_itens_actor_insert');
    expect(ownerPolicyMigration).toContain('create policy vendas_pagamentos_actor_insert');
    expect(ownerPolicyMigration).not.toContain('auth.uid() = id_usuario');
  });
});
