// Client-side guards for session, profile, and subscription
import { supabase } from './supabaseClient';
import { requiredOk } from './profileUtils';
import { addToast } from './stores/ui';
import { isNetworkError } from './netStatus';
import { saveEntitlementSnapshot, loadEntitlementSnapshot } from './offlineEntitlement';

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

/**
 * Normalize and strictly validate subscription status AND expiration date.
 * Both "active" and "trialing" status grant access (trialing = free trial period).
 * Also checks manually_extended_until for admin-extended subscriptions.
 * @param {Object} subscription - Subscription object
 * @returns {boolean} - True if subscription is active/trialing and not expired
 */
export function isSubscriptionActiveStrict(subscription) {
  if (!subscription) return false;

  const status = (subscription.status ?? '').toString().trim().toLowerCase();
  const isActive = status === 'active' || status === 'trialing';

  // Check manually_extended_until (admin extension overrides expiry)
  if (subscription.manually_extended_until) {
    const extendedUntil = new Date(subscription.manually_extended_until);
    if (extendedUntil > new Date()) return true;
  }

  // Validate expiration date
  if (subscription.current_period_end) {
    const expiryDate = new Date(subscription.current_period_end);
    const notExpired = expiryDate > new Date();
    return isActive && notExpired;
  }

  // If no expiration date, only check status (fallback)
  return isActive;
}

/**
 * Ensure user is logged in and has an active subscription; otherwise redirect.
 * Also optionally checks profile completeness.
 * Returns an object with { userId, email, ownerUserId, isSubUser, roleId } when allowed, or null after redirect.
 * Sub-users are detected before the profile check and short-circuit to the owner's subscription validation.
 */
export async function ensureActiveSubscription({ requireProfile = false, redirectOnFail = true } = {}) {
  // Helper: wrap promise with timeout
  const withTimeout = (promise, ms = 8000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);

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

  // 4) Subscription (redirect only if status !== 'active'/'trialing' OR expired)
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
  if (!userId) return false;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select('has_mesas_addon, plan_tier')
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    const planAllowsMesas = data.plan_tier === 'pdv' || data.plan_tier === 'bundle';
    return planAllowsMesas && !!data.has_mesas_addon;
  } catch (err) {
    console.warn('[Guards] hasMesasAddon error:', err?.message);
    return false;
  }
}

/**
 * Returns whether the given user has the Pedidos + Cozinha add-on active.
 * Read-only; does not redirect. Only plans with PDV can use this add-on.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasPedidosAddon(userId) {
  if (!userId) return false;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select('has_pedidos_addon, plan_tier')
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    const planAllowsPedidos = data.plan_tier === 'pdv' || data.plan_tier === 'bundle';
    return planAllowsPedidos && !!data.has_pedidos_addon;
  } catch (err) {
    console.warn('[Guards] hasPedidosAddon error:', err?.message);
    return false;
  }
}

/**
 * Returns whether the given user has the Acessos (Access Control) add-on active on their subscription.
 * Read-only — does not redirect. Call AFTER ensureActiveSubscription so an active sub is guaranteed.
 * Only pdv or bundle plans can use this add-on.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasAcessosAddon(userId) {
  if (!userId) return false;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select('has_acessos_addon, plan_tier')
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    const planAllowsAcessos = data.plan_tier === 'pdv' || data.plan_tier === 'bundle';
    return planAllowsAcessos && !!data.has_acessos_addon;
  } catch (err) {
    console.warn('[Guards] hasAcessosAddon error:', err?.message);
    return false;
  }
}

/**
 * Returns whether the user has access to ZeloChat (plan_tier 'chat' ou 'bundle' + sub ativa).
 * Read-only — não redireciona. Pode ser usado pelo app ZeloChat (separado) lendo do mesmo DB,
 * ou por upsell cards no PDV.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasZeloChatAccess(userId) {
  if (!userId) return false;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select('plan_tier, status, current_period_end, manually_extended_until')
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isSubscriptionActiveStrict(data)) return false;
    return data?.plan_tier === 'chat' || data?.plan_tier === 'bundle';
  } catch (err) {
    console.warn('[Guards] hasZeloChatAccess error:', err?.message);
    return false;
  }
}

/**
 * Returns whether the user has access to ZeloPDV (plan_tier 'pdv' ou 'bundle' + sub ativa).
 * Read-only — não redireciona.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasZeloPdvAccess(userId) {
  if (!userId) return false;
  try {
    const subUserId = await resolveSubscriptionUserId(userId);
    const { data } = await supabase
      .from('subscriptions')
      .select('plan_tier, status, current_period_end, manually_extended_until')
      .eq('user_id', subUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isSubscriptionActiveStrict(data)) return false;
    return data?.plan_tier === 'pdv' || data?.plan_tier === 'bundle';
  } catch (err) {
    console.warn('[Guards] hasZeloPdvAccess error:', err?.message);
    return false;
  }
}
