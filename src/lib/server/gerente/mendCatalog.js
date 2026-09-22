/**
 * @file Machine-to-machine catalog ops for Mend (not Zelinho chat persona).
 * Owner is resolved from paired WhatsApp phone; writes reuse gerente_* RPCs.
 */
import { normalizeBrazilianPhone } from '../../masks.js';
import { isSubscriptionActiveStrict } from '../../subscriptionStatus.js';
import { completePairing, resolveOwnerByPhone } from './phoneLinks.js';
import {
  buscarProduto,
  excluirCatalogo,
  prepararExclusaoCatalogo,
} from './tools/catalog.js';

async function isOwnerSubscriptionActive(db, ownerUserId, now) {
  const { data, error } = await db
    .from('subscriptions')
    .select('status, current_period_end, manually_extended_until, updated_at')
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return isSubscriptionActiveStrict(data?.[0], now);
}

async function requireOwner(db, phone, now) {
  const phoneNormalized = normalizeBrazilianPhone(phone);
  if (!phoneNormalized) return { ok: false, code: 'PHONE_INVALID' };
  const ownerUserId = await resolveOwnerByPhone(db, phoneNormalized);
  if (!ownerUserId) return { ok: false, code: 'NOT_PAIRED', phoneNormalized };
  if (!(await isOwnerSubscriptionActive(db, ownerUserId, now))) {
    return { ok: false, code: 'INACTIVE', phoneNormalized, ownerUserId };
  }
  return { ok: true, phoneNormalized, ownerUserId };
}

export async function handleMendCatalogAction({
  db,
  action,
  phone,
  code = null,
  termo = null,
  produto_ids = [],
  categoria_ids = [],
  todos = false,
  limite = 5,
  now = new Date(),
}) {
  if (action === 'pair') {
    const phoneNormalized = normalizeBrazilianPhone(phone);
    if (!phoneNormalized) return { ok: false, code: 'PHONE_INVALID' };
    const pairing = await completePairing(db, {
      phoneNormalized,
      code: String(code || '').trim(),
      now,
    });
    if (!pairing.ok) return { ok: false, code: 'PAIR_INVALID' };
    return { ok: true, paired: true, owner_user_id: pairing.ownerUserId };
  }

  if (action === 'resolve') {
    const owner = await requireOwner(db, phone, now);
    if (!owner.ok) return { ok: false, code: owner.code, paired: false };
    return { ok: true, paired: true, owner_user_id: owner.ownerUserId };
  }

  const owner = await requireOwner(db, phone, now);
  if (!owner.ok) return { ok: false, code: owner.code, paired: false };

  if (action === 'search') {
    const result = await buscarProduto(db, owner.ownerUserId, {
      termo: String(termo || ''),
      limite,
    });
    if (!result.ok) return { ok: false, code: 'SEARCH_FAILED', error: result.error };
    return {
      ok: true,
      paired: true,
      produtos: result.data?.produtos ?? [],
    };
  }

  if (action === 'prepare_delete') {
    const preview = await prepararExclusaoCatalogo(db, owner.ownerUserId, {
      produto_ids,
      categoria_ids,
      todos: todos === true,
    });
    if (!preview.ok) return { ok: false, code: 'PREPARE_FAILED', error: preview.error };
    return { ok: true, paired: true, preview: preview.data };
  }

  if (action === 'execute_delete') {
    const executed = await excluirCatalogo(db, owner.ownerUserId, {
      produto_ids,
      categoria_ids,
      todos: todos === true,
    });
    if (!executed.ok) return { ok: false, code: 'EXECUTE_FAILED', error: executed.error };
    return { ok: true, paired: true, result: executed.data, before: executed.before };
  }

  return { ok: false, code: 'ACTION_INVALID' };
}

export function summarizeDeleteResult(result) {
  const deleted = Array.isArray(result?.excluidos) ? result.excluidos.length : 0;
  const archived = Array.isArray(result?.arquivados) ? result.arquivados.length : 0;
  const categories = Array.isArray(result?.categorias_excluidas)
    ? result.categorias_excluidas.length
    : 0;
  return `Pronto: ${deleted} produto(s) excluído(s), ${archived} arquivado(s) e ${categories} categoria(s) vazia(s) removida(s).`;
}
