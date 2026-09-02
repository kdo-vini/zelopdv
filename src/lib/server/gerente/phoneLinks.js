// src/lib/server/gerente/phoneLinks.js
/**
 * @file Pareamento do telefone do dono com a empresa para o canal WhatsApp do Zelinho.
 * Código de 6 dígitos, 10 minutos, só o hash vai ao banco.
 */
import crypto from 'node:crypto';

export const PAIRING_TTL_MS = 10 * 60 * 1000;

function throwIfError(error) {
  if (error) throw new Error(error.message || String(error));
}

export function generatePairingCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashPairingCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function maskPhone(phoneNormalized) {
  const digits = String(phoneNormalized || '').replace(/\D/g, '');
  if (!digits.startsWith('55') || digits.length < 12) return '';
  const local = digits.slice(2);
  const ddd = local.slice(0, 2);
  const number = local.slice(2);
  const hidden = '*'.repeat(number.length - 4);
  return `(${ddd}) ${hidden}-${number.slice(-4)}`;
}

export async function startPairing(db, { ownerUserId, now = new Date(), randomInt }) {
  const cleared = await db.from('gerente_pairing_codes').delete().eq('owner_user_id', ownerUserId).is('consumed_at', null);
  throwIfError(cleared.error);
  const code = generatePairingCode(randomInt);
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  const inserted = await db.from('gerente_pairing_codes').insert({ owner_user_id: ownerUserId, code_hash: hashPairingCode(code), expires_at: expiresAt });
  throwIfError(inserted.error);
  return { code, expiresAt };
}

export async function completePairing(db, { phoneNormalized, code, now = new Date() }) {
  if (!/^\d{6}$/.test(String(code || '').trim())) return { ok: false, code: 'INVALID' };
  if (!/^55\d{10,11}$/.test(String(phoneNormalized || ''))) return { ok: false, code: 'INVALID' };
  const found = await db
    .from('gerente_pairing_codes')
    .select('id, owner_user_id, expires_at')
    .eq('code_hash', hashPairingCode(String(code).trim()))
    .is('consumed_at', null)
    .maybeSingle();
  throwIfError(found.error);
  const row = found.data;
  if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, code: 'INVALID' };

  // O código prova posse da conta; o telefone passa a pertencer a este owner.
  const byPhone = await db.from('gerente_phone_links').delete().eq('phone_normalized', phoneNormalized);
  throwIfError(byPhone.error);
  const byOwner = await db.from('gerente_phone_links').delete().eq('owner_user_id', row.owner_user_id);
  throwIfError(byOwner.error);
  const inserted = await db.from('gerente_phone_links').insert({ owner_user_id: row.owner_user_id, phone_normalized: phoneNormalized, verified_at: now.toISOString() });
  throwIfError(inserted.error);
  const consumed = await db.from('gerente_pairing_codes').update({ consumed_at: now.toISOString() }).eq('id', row.id);
  throwIfError(consumed.error);
  return { ok: true, ownerUserId: row.owner_user_id };
}

export async function resolveOwnerByPhone(db, phoneNormalized) {
  const { data, error } = await db.from('gerente_phone_links').select('owner_user_id').eq('phone_normalized', phoneNormalized).maybeSingle();
  throwIfError(error);
  return data?.owner_user_id || null;
}

export async function getLink(db, ownerUserId) {
  const { data, error } = await db.from('gerente_phone_links').select('phone_normalized, verified_at').eq('owner_user_id', ownerUserId).maybeSingle();
  throwIfError(error);
  return data || null;
}

export async function unlinkPhone(db, ownerUserId) {
  const { error } = await db.from('gerente_phone_links').delete().eq('owner_user_id', ownerUserId);
  throwIfError(error);
}
