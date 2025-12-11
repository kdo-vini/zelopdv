// Client-side guards for session, profile, and subscription
import { supabase } from './supabaseClient';

/**
 * Normalize and strictly validate subscription status AND expiration date.
 * Both "active" and "trialing" status grant access (trialing = free trial period).
 * @param {Object} subscription - Subscription object with status and current_period_end
 * @returns {boolean} - True if subscription is active/trialing and not expired
 */
export function isSubscriptionActiveStrict(subscription) {
  if (!subscription) return false;

  const status = (subscription.status ?? '').toString().trim().toLowerCase();
  const isActive = status === 'active' || status === 'trialing';

  // Validate expiration date
  if (subscription.current_period_end) {
    const expiryDate = new Date(subscription.current_period_end);
    const now = new Date();
    const notExpired = expiryDate > now;

    return isActive && notExpired;
  }

  // If no expiration date, only check status (fallback)
  return isActive;
}

/**
 * Ensure user is logged in and has an active subscription; otherwise redirect.
 * Also optionally checks profile completeness.
 * Returns an object with { userId, email } when allowed, or null after redirect.
 */
export async function ensureActiveSubscription({ requireProfile = false, redirectOnFail = true } = {}) {
  // 1) Session
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id || null;
  const email = sess?.session?.user?.email || null;
  if (!userId) {
    if (redirectOnFail) window.location.href = '/login';
    return null;
  }

  // 2) Optional: profile completeness
  if (requireProfile) {
    try {
      const { data: perfil } = await supabase
        .from('empresa_perfil')
        .select('nome_exibicao, documento, contato, largura_bobina')
        .eq('user_id', userId)
        .maybeSingle();
      const ok = Boolean(
        perfil && perfil.nome_exibicao && perfil.documento && perfil.contato &&
        (perfil.largura_bobina === '58mm' || perfil.largura_bobina === '80mm')
      );
      if (!ok) {
        if (redirectOnFail) window.location.href = '/perfil?msg=complete';
        return null;
      }
    } catch {
      // ignore, fallback to allowing page to continue
    }
  }

  // 3) Subscription (redirect only if status !== 'active'/'trialing' OR expired)
  try {
    let { data: sub, error } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, user_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If there's an error or no subscription, redirect with 'subscribe' (new user)
    if (error || !sub) {
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
    if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
    return null;
  }

  return { userId, email };
}
