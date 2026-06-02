// Snapshot de entitlement (acesso) para tolerância a offline no gate de sessão.
//
// Problema que resolve: `ensureActiveSubscription` valida sessão/assinatura via
// Supabase a cada cold-start. Se a rede está fora (caso da fábrica com Wi-Fi
// oscilando), o operador era expulso para /assinatura — que também não carrega
// offline. Aqui guardamos o último entitlement CONFIRMADO online e o reusamos
// dentro de uma janela de carência quando — e somente quando — a falha é de
// rede. Negativo confirmado pelo servidor (expirado, sem assinatura) nunca usa
// o cache: o redirecionamento normal acontece.
//
// Segurança: a janela de carência é curta e o snapshot só é gravado após uma
// validação online bem-sucedida. Não vira bypass eterno de assinatura.

const STORAGE_KEY = 'zelo_entitlement_snapshot';

// Janela de carência: por quanto tempo um entitlement validado online continua
// valendo offline. 7 dias cobre fins de semana/feriados sem rede sem virar uso
// indefinido sem assinatura.
export const ENTITLEMENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function getStore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Persiste o entitlement validado online. Chamar somente após confirmação
 * positiva do servidor.
 * @param {{ userId: string, email?: string|null, ownerUserId: string, isSubUser: boolean, roleId?: string|null }} ctx
 * @param {number} [now] timestamp em ms (injetável para teste)
 */
export function saveEntitlementSnapshot(ctx, now = Date.now()) {
  const store = getStore();
  if (!store || !ctx?.userId) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: ctx.userId,
        email: ctx.email ?? null,
        ownerUserId: ctx.ownerUserId,
        isSubUser: !!ctx.isSubUser,
        roleId: ctx.roleId ?? null,
        validatedAt: now
      })
    );
  } catch {
    // localStorage cheio/bloqueado: tolerância a offline é best-effort.
  }
}

/**
 * Lê o snapshot se pertencer ao mesmo usuário e ainda estar dentro da janela.
 * Retorna o contexto de acesso (mesmo formato de ensureActiveSubscription) ou null.
 * @param {string} userId auth uid da sessão atual
 * @param {number} [now] timestamp em ms (injetável para teste)
 */
export function loadEntitlementSnapshot(userId, now = Date.now()) {
  const store = getStore();
  if (!store || !userId) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || snap.userId !== userId) return null;
    if (!snap.validatedAt || now - snap.validatedAt > ENTITLEMENT_GRACE_MS) return null;
    return {
      userId: snap.userId,
      email: snap.email ?? null,
      ownerUserId: snap.ownerUserId,
      isSubUser: !!snap.isSubUser,
      roleId: snap.roleId ?? null,
      validatedAt: snap.validatedAt,
      fromCache: true
    };
  } catch {
    return null;
  }
}

/** Remove o snapshot (ex.: logout ou troca de usuário). */
export function clearEntitlementSnapshot() {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
