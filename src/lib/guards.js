// Client-side guards for session, profile, and subscription
import { supabase } from './supabaseClient';

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

  // 3) Subscription
  try {
    let { data: sub } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, user_email, user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!sub && email) {
      const { data: subByEmail } = await supabase
        .from('subscriptions')
        .select('id, status, current_period_end, user_email, user_id')
        .eq('user_email', email)
        .maybeSingle();
      sub = subByEmail || null;
    }
    const now = new Date();
    const periodOk = sub?.current_period_end ? new Date(sub.current_period_end) > now : false;
    const isActive = sub && (sub.status === 'active' || (sub.status === 'trialing' && periodOk));
    if (!isActive) {
      if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
      return null;
    }
  } catch {
    if (redirectOnFail) window.location.href = '/assinatura?msg=subscribe';
    return null;
  }

  return { userId, email };
}
