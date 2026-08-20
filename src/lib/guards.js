// Client-side guards for session, profile, and subscription
import { supabase } from './supabaseClient';
import { requiredOk } from './profileUtils';
import { addToast } from './stores/ui';
import { isNetworkError } from './netStatus';
import { saveEntitlementSnapshot, loadEntitlementSnapshot } from './offlineEntitlement';
import { isSubscriptionActiveStrict } from './subscriptionStatus';
import { withTimeout } from './utils';

export { isSubscriptionActiveStrict };

/**
 * For pages gated by an add-on: when the addon is inactive AND the current
 * user is a sub-user, redirect to /app with a warning toast (a sub-user
 * cannot buy the add-on, so the owner-targeted upsell is dead-end UX).
 * Owners without the addon keep seeing the upsell screen.
 *
 * Returns true if the redirect was triggered — caller should early-return.
 */
export function bounceSubUserMissingAddon({ addonActive, isSubUser, addonLabel = 'Este módulo' }) {
  if (addonActive || !isSubUser) return false;
  if (typeof window === 'undefined') return false;
  addToast(`${addonLabel} não está ativo na empresa. Fale com o titular para liberar o acesso.`, 'warning');
  window.location.href = '/app';
  return true;
}

/**
 * Returns the user_id whose subscription should be inspected for a given
 * authenticated user. Sub-users inherit the owner's subscription (and add-ons),
 * so the addon check helpers must redirect their query to the owner. Falls
 * back to the original userId for owners or on lookup error.
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function resolveSubscriptionUserId(userId) {
  if (!userId) return userId;
  try {
    const { data } = await supabase
      .from('access_users')
      .select('owner_user_id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    return data?.owner_user_id || userId;
  } catch {
    return userId;
  }
}

async function readSubscription(userId, columns, label) {
  if (!userId) return null;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select(columns)
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch (err) {
    console.warn(`[Guards] ${label} error:`, err?.message);
    return null;
  }
}

async function hasSubscriptionAddon(userId, flag, label) {
  const data = await readSubscription(userId, `${flag}, plan_tier`, label);
  if (!data) return false;
  return ['pdv', 'bundle'].includes(data.plan_tier) && !!data[flag];
}

async function hasZeloMenuEntitlement(userId, label) {
  const data = await readSubscription(userId, 'has_zelo_menu, plan_tier', label);
  if (!data) return false;
  if (data.plan_tier === 'chat' || data.plan_tier === 'bundle') return true;
  return data.plan_tier === 'pdv' && !!data.has_zelo_menu;
}

async function hasPlanAccess(userId, allowedPlans, label) {
  const data = await readSubscription(
    userId,
    'plan_tier, status, current_period_end, manually_extended_until',
    label
  );
  return isSubscriptionActiveStrict(data) && allowedPlans.includes(data?.plan_tier);
}

/**
 * Ensure user is logged in and has an active subscription; otherwise redirect.
 * Also optionally checks profile completeness.
 * Returns an object with { userId, email, ownerUserId, isSubUser, roleId } when allowed, or null after redirect.
 * Sub-users are detected before the profile check and short-circuit to the owner's subscription validation.
 */
export async function ensureActiveSubscription({ requireProfile = false, redirectOnFail = true } = {}) {
  // 1) Session - with timeout to prevent infinite hang
  let userId = null;
  let email = null;
  try {
    const { data: sess } = await withTimeout(supabase.auth.getSession(), 8000);
    userId = sess?.session?.user?.id || null;
    email = sess?.session?.user?.email || null;
  } catch (err) {
    console.warn('[Guards] getSession timeout or error:', err?.message);
    if (redirectOnFail) window.location.href = '/login';
    return null;
  }

  if (!userId) {
    if (redirectOnFail) window.location.href = '/login';
    return null;
  }

  // Fallback offline: quando uma das checagens abaixo falha por REDE (não por
  // negativo confirmado do servidor), reusa o último entitlement validado
  // online dentro da janela de carência. Mantém o operador trabalhando quando o
  // Wi-Fi oscila, sem virar bypass de assinatura.
  const offlineFallback = () => {
    const snap = loadEntitlementSnapshot(userId);
    if (!snap) return null;
    console.warn('[Guards] Rede indisponível — usando entitlement em cache validado em', new Date(snap.validatedAt).toISOString());
    return { userId: snap.userId, email: snap.email ?? email, ownerUserId: snap.ownerUserId, isSubUser: snap.isSubUser, roleId: snap.roleId };
  };

  // 2) Sub-user check — before profile check, so sub-users skip the profile requirement
  try {
    const { data: accessUser, error: accessError } = await supabase
      .from('access_users')
      .select('owner_user_id, role_id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (accessError && isNetworkError(accessError)) {
      const fb = offlineFallback();
      if (fb) return fb;
    }

    if (accessUser) {
      // This user is a sub-user — verify the owner's subscription and add-on
      const ownerUserId = accessUser.owner_user_id;

      let { data: ownerSub, error: ownerSubError } = await supabase
        .from('subscriptions')
        .select('status, current_period_end, manually_extended_until, has_acessos_addon')
        .eq('user_id', ownerUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownerSubError && isNetworkError(ownerSubError)) {
        const fb = offlineFallback();
        if (fb) return fb;
      }

      if (ownerSubError || !ownerSub || !isSubscriptionActiveStrict(ownerSub) || !ownerSub.has_acessos_addon) {
        if (redirectOnFail) window.location.href = '/assinatura?msg=addon_required';
        return null;
      }

      const subCtx = {
        userId,
        email,
        ownerUserId,
        isSubUser: true,
        roleId: accessUser.role_id,
      };
      saveEntitlementSnapshot(subCtx);
      return subCtx;
    }
  } catch (err) {
    console.warn('[Guards] sub-user check error:', err?.message);
    if (isNetworkError(err)) {
      const fb = offlineFallback();
      if (fb) return fb;
    }
    // Fall through to owner flow on unexpected error
  }

  // 3) Optional: profile completeness (owners only)
  if (requireProfile) {
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('empresa_perfil')
        .select('nome_exibicao, documento, contato, largura_bobina')
        .eq('user_id', userId)
        .maybeSingle();
      if (perfilError && isNetworkError(perfilError)) {
        const fb = offlineFallback();
        if (fb) return fb;
        // Sem snapshot e offline: não dá para verificar perfil — não redireciona
        // por isso; deixa a checagem de assinatura abaixo decidir.
      } else if (!perfilError) {
        const ok = Boolean(perfil && requiredOk(perfil));
        if (!ok) {
          if (redirectOnFail) window.location.href = '/perfil?msg=complete';
          return null;
        }
      }
    } catch (err) {
      if (isNetworkError(err)) {
        const fb = offlineFallback();
        if (fb) return fb;
      }
      // ignore, fallback to allowing page to continue
    }
  }

  // 4) Subscription (redirect only if status is inactive OR effective expiry passed)
  // plan_tier filter: chat-only subscribers should not access PDV routes.
  // Note: plan_tier is NOT filtered in SQL to avoid blocking NULL (legacy users).
  // Chat-only redirect happens after fetch.
  try {
    let { data: sub, error } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, manually_extended_until, user_id, plan_tier')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Falha de REDE: tenta entitlement em cache antes de expulsar o operador.
    if (error && isNetworkError(error)) {
      const fb = offlineFallback();
      if (fb) return fb;
    }

    // If there's an error or no subscription, redirect with 'subscribe' (new user)
    if (error || !sub) {
      if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
      return null;
    }

    // Chat-only users should not access PDV routes.
    if (sub.plan_tier === 'chat') {
      // Redirect to assinatura with a message specific to plan mismatch
      if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
      return null;
    }

    const isActiveStrict = isSubscriptionActiveStrict(sub);
    if (!isActiveStrict) {
      // User had subscription but it's not active anymore - use 'expired'
      if (redirectOnFail) window.location.href = '/assinatura?msg=expired';
      return null;
    }
  } catch (err) {
    console.error('[Guards] Error checking subscription:', err);
    if (isNetworkError(err)) {
      const fb = offlineFallback();
      if (fb) return fb;
    }
    if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
    return null;
  }

  const ownerCtx = { userId, email, ownerUserId: userId, isSubUser: false, roleId: null };
  saveEntitlementSnapshot(ownerCtx);
  return ownerCtx;
}

/**
 * Returns whether the given user has the Mesas add-on active on their subscription.
 * Read-only — does not redirect. Call AFTER ensureActiveSubscription so an active sub is guaranteed.
 * Defesa em camadas: só retorna true se o plano permitir Mesas (pdv ou bundle).
 * Plano 'chat' nunca permite Mesas, mesmo com flag has_mesas_addon=true (inconsistência protegida).
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasMesasAddon(userId) {
  return hasSubscriptionAddon(userId, 'has_mesas_addon', 'hasMesasAddon');
}

/**
 * Returns whether the given user has the Acessos (Access Control) add-on active on their subscription.
 * Read-only — does not redirect. Call AFTER ensureActiveSubscription so an active sub is guaranteed.
 * Only pdv or bundle plans can use this add-on.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasAcessosAddon(userId) {
  return hasSubscriptionAddon(userId, 'has_acessos_addon', 'hasAcessosAddon');
}

/**
 * Returns whether the user has access to ZeloMenu (publicação self-service + menu público).
 * Read-only; does not redirect. Espelha o resolver de domínio do ZeloChat
 * (src/domain/zelomenuEntitlements.ts) — os dois repos precisam concordar.
 *  - chat/bundle incluem ZeloMenu por política de produto (D-014), independente da flag.
 *  - pdv puro precisa do addon ZeloMenu (has_zelo_menu, R$99).
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasZeloMenuAccess(userId) {
  return hasZeloMenuEntitlement(userId, 'hasZeloMenuAccess');
}

/**
 * Returns whether the user can review/accept online orders (ordering_review, ZLM-005).
 * chat/bundle sim; pdv precisa do ZeloMenu.
 *
 * 2026-07-28: o fallback pelo legado `has_pedidos_addon` (D-099) saiu daqui junto
 * com o módulo Pedidos + Cozinha. A coluna será removida depois do deploy dos
 * consumidores cross-repo, sem mudar o contrato atual de acesso.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasOrderingReviewAccess(userId) {
  return hasZeloMenuEntitlement(userId, 'hasOrderingReviewAccess');
}

/**
 * Returns whether the user can use the kitchen queue (kitchen_queue, ZLM-005).
 *
 * 2026-07-28: o fallback por `has_mesas_addon` (D-100) saiu daqui. Com o módulo
 * legado aposentado, a fila de preparo é alimentada exclusivamente pelo motor
 * canônico `zelo_orders`, cujo domínio é o ZeloMenu — um cliente só-Mesas não
 * tem produtor de pedido nenhum e via a tela vazia. Consequência aceita: quem
 * tem só Mesas deixa de ver o item Cozinha.
 *
 * Hoje isto é idêntico a `hasOrderingReviewAccess` de propósito: as duas
 * capabilities derivam do mesmo domínio compartilhado do ZeloMenu. As funções
 * seguem separadas porque os chamadores são distintos (revisão de pedido vs.
 * painel de preparo) e a distinção pode voltar a divergir sem virar refactor.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasKitchenQueueAccess(userId) {
  return hasZeloMenuEntitlement(userId, 'hasKitchenQueueAccess');
}

/**
 * Returns whether the user has access to ZeloChat (plan_tier 'chat' ou 'bundle' + sub ativa).
 * Read-only — não redireciona. Pode ser usado pelo app ZeloChat (separado) lendo do mesmo DB,
 * ou por upsell cards no PDV.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasZeloChatAccess(userId) {
  return hasPlanAccess(userId, ['chat', 'bundle'], 'hasZeloChatAccess');
}

/**
 * Returns whether the user has access to ZeloPDV (plan_tier 'pdv' ou 'bundle' + sub ativa).
 * Read-only — não redireciona.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasZeloPdvAccess(userId) {
  return hasPlanAccess(userId, ['pdv', 'bundle'], 'hasZeloPdvAccess');
}
