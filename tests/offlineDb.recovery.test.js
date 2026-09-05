import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, contarVendasSemTitular, recuperarVendasSemTitular } from '../src/lib/offlineDb.js';

beforeEach(async () => { await db.vendas_pendentes.clear(); });

function client(rows, error = null) {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(async () => ({ data: rows, error })) };
  return { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-a' } } })) }, from: vi.fn(() => query), query };
}
const pending = (extra = {}) => ({ status: 'aguardando', payload: { id_caixa: 12, client_sale_id: 'original-intent', valor_total: 25 }, ...extra });

describe('recovery of unowned offline sales', () => {
  it('uses a server-confirmed caixa owner and preserves payload and intention without submitting a sale', async () => {
    const id = await db.vendas_pendentes.add(pending());
    const sb = client([{ id: 12, id_usuario: 'owner-a' }]);
    expect(await contarVendasSemTitular()).toBe(1);
    expect(await recuperarVendasSemTitular(sb, 'owner-a')).toEqual({ recovered: 1, unresolved: 0 });
    expect(await db.vendas_pendentes.get(id)).toEqual({ ...pending(), id, ownerUserId: 'owner-a' });
    expect(sb.from).toHaveBeenCalledWith('caixas');
    expect(sb.query.eq).toHaveBeenCalledWith('id_usuario', 'owner-a');
    expect(sb.query.in).toHaveBeenCalledWith('id', [12]);
    expect(await contarVendasSemTitular()).toBe(0);
  });

  it('preserves foreign, unprovable, conflicting, and already-owned records', async () => {
    const records = [pending({ payload: { id_caixa: 13 } }), pending({ payload: {} }),
      pending({ payload: { id_caixa: 12, owner_user_id: 'owner-b' } }), pending({ ownerUserId: 'owner-b' })];
    await db.vendas_pendentes.bulkAdd(records);
    const before = await db.vendas_pendentes.toArray();
    expect(await recuperarVendasSemTitular(client([{ id: 13, id_usuario: 'owner-b' }, { id: 12, id_usuario: 'owner-a' }]), 'owner-a'))
      .toEqual({ recovered: 0, unresolved: 3 });
    expect(await db.vendas_pendentes.toArray()).toEqual(before);
  });

  it('requires the current authenticated user to be the owner', async () => {
    await db.vendas_pendentes.add(pending());
    const sb = client([]);
    await expect(recuperarVendasSemTitular(sb, 'owner-b')).rejects.toThrow(/titular/i);
    expect(sb.from).not.toHaveBeenCalled();
    expect(await contarVendasSemTitular()).toBe(1);
  });

  it('does not recover on a query error or session change during verification', async () => {
    await db.vendas_pendentes.add(pending());
    await expect(recuperarVendasSemTitular(client(null, new Error('offline')), 'owner-a')).rejects.toThrow('offline');
    const sb = client([{ id: 12, id_usuario: 'owner-a' }]);
    sb.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'owner-a' } } }).mockResolvedValue({ data: { user: { id: 'owner-b' } } });
    await expect(recuperarVendasSemTitular(sb, 'owner-a')).rejects.toThrow(/titular/i);
    expect(await contarVendasSemTitular()).toBe(1);
  });

  it('does not overwrite a record changed by another tab during the server query', async () => {
    const id = await db.vendas_pendentes.add(pending());
    const sb = client([]);
    sb.query.in.mockImplementation(async () => {
      await db.vendas_pendentes.update(id, { payload: { id_caixa: 13, client_sale_id: 'changed' } });
      return { data: [{ id: 12, id_usuario: 'owner-a' }] };
    });
    expect(await recuperarVendasSemTitular(sb, 'owner-a')).toEqual({ recovered: 0, unresolved: 1 });
    expect((await db.vendas_pendentes.get(id)).ownerUserId).toBeUndefined();
  });

  it('supports a legacy flat caixa reference without inventing owner or operator for unsupported records', async () => {
    await db.vendas_pendentes.add({ status: 'aguardando', id_caixa: 12, itens: [{ nome: 'Old item' }] });
    expect(await recuperarVendasSemTitular(client([{ id: 12, id_usuario: 'owner-a' }]), 'owner-a')).toEqual({ recovered: 1, unresolved: 0 });
    const [row] = await db.vendas_pendentes.toArray();
    expect(row.ownerUserId).toBe('owner-a');
    expect(row.operatorUserId).toBeUndefined();
    expect(row.payload).toBeUndefined();
  });
});
