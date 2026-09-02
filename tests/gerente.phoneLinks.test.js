// tests/gerente.phoneLinks.test.js
import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { PAIRING_TTL_MS, completePairing, generatePairingCode, hashPairingCode, maskPhone, resolveOwnerByPhone, startPairing, unlinkPhone } from '../src/lib/server/gerente/phoneLinks.js';

const now = new Date('2026-09-02T12:00:00Z');

describe('pairing codes', () => {
  it('gera 6 dígitos com zero à esquerda', () => {
    expect(generatePairingCode(() => 42)).toBe('000042');
    expect(generatePairingCode(() => 999999)).toBe('999999');
    expect(hashPairingCode('000042')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('startPairing apaga códigos vivos e grava só o hash', async () => {
    const db = makeDb({ tables: { gerente_pairing_codes: [{ data: null, error: null }, { data: null, error: null }] } });
    const result = await startPairing(db, { ownerUserId: 'owner-1', now, randomInt: () => 123456 });
    expect(result).toEqual({ code: '123456', expiresAt: new Date(now.getTime() + PAIRING_TTL_MS).toISOString() });
    expect(db.calls[0].op).toBe('delete');
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'owner_user_id', value: 'owner-1' }, { op: 'is', field: 'consumed_at', value: null }]));
    expect(db.calls[1].payload).toEqual({ owner_user_id: 'owner-1', code_hash: hashPairingCode('123456'), expires_at: result.expiresAt });
  });

  it('completePairing vincula, consome o código e remove vínculos antigos do telefone e do owner', async () => {
    const db = makeDb({ tables: {
      gerente_pairing_codes: [{ data: { id: 'code-1', owner_user_id: 'owner-1', expires_at: new Date(now.getTime() + 60_000).toISOString() }, error: null }, { data: null, error: null }],
      gerente_phone_links: [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }],
    } });
    const result = await completePairing(db, { phoneNormalized: '5514999991234', code: '123456', now });
    expect(result).toEqual({ ok: true, ownerUserId: 'owner-1' });
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'code_hash', value: hashPairingCode('123456') }, { op: 'is', field: 'consumed_at', value: null }]));
    const linkCalls = db.calls.filter((c) => c.table === 'gerente_phone_links');
    expect(linkCalls[0].op).toBe('delete');
    expect(linkCalls[1].op).toBe('delete');
    expect(linkCalls[2].op).toBe('insert');
    expect(linkCalls[2].payload).toMatchObject({ owner_user_id: 'owner-1', phone_normalized: '5514999991234' });
    const consumed = db.calls.find((c) => c.table === 'gerente_pairing_codes' && c.op === 'update');
    expect(typeof consumed.payload.consumed_at).toBe('string');
  });

  it('completePairing rejeita código expirado ou inexistente', async () => {
    const expired = makeDb({ tables: { gerente_pairing_codes: [{ data: { id: 'c', owner_user_id: 'o', expires_at: new Date(now.getTime() - 1).toISOString() }, error: null }] } });
    expect(await completePairing(expired, { phoneNormalized: '5514999991234', code: '123456', now })).toEqual({ ok: false, code: 'INVALID' });
    const missing = makeDb({ tables: { gerente_pairing_codes: [{ data: null, error: null }] } });
    expect(await completePairing(missing, { phoneNormalized: '5514999991234', code: '000000', now })).toEqual({ ok: false, code: 'INVALID' });
    expect(await completePairing(makeDb(), { phoneNormalized: '5514999991234', code: '12', now })).toEqual({ ok: false, code: 'INVALID' });
  });
});

describe('links', () => {
  it('resolve owner por telefone e desvincula', async () => {
    const db = makeDb({ tables: { gerente_phone_links: [{ data: { owner_user_id: 'owner-1' }, error: null }, { data: null, error: null }] } });
    expect(await resolveOwnerByPhone(db, '5514999991234')).toBe('owner-1');
    await unlinkPhone(db, 'owner-1');
    expect(db.calls[1].op).toBe('delete');
  });

  it('mascara o telefone', () => {
    expect(maskPhone('5514999991234')).toBe('(14) *****-1234');
    expect(maskPhone('551433331234')).toBe('(14) ****-1234');
  });
});
