import { json } from '@sveltejs/kit';
import { buildServerAuthRedirectUrl, isValidEmail } from '$lib/server/authFlow';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit, getRequestIp, maskEmail, normalizeEmail } from '$lib/server/rateLimit';
import { supabaseAuth } from '$lib/server/supabaseAuth';

export async function POST({ request, url, getClientAddress }) {
  if (!supabaseAuth) {
    return json({ error: 'Autenticação indisponível no momento.' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const referralCode = String(body.referralCode || '').trim();

  if (!email || !password || !isValidEmail(email)) {
    return json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  }
  if (password.length < 8) {
    return json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  const policies = [
    {
      key: buildRateLimitKey('auth', 'signup', 'ip', ip),
      logKey: `auth:signup:ip:${ip}`,
      route: '/api/auth/signup',
      limit: 5,
      windowMs: 60 * 60 * 1000,
    },
    {
      key: buildRateLimitKey('auth', 'signup', 'email', email),
      logKey: `auth:signup:email:${maskEmail(email)}`,
      route: '/api/auth/signup',
      limit: 3,
      windowMs: 60 * 60 * 1000,
    },
  ];

  for (const policy of policies) {
    const result = enforceRateLimit(policy);
    if (!result.ok) {
      return createRateLimitResponse(result);
    }
  }

  const redirectTo = buildServerAuthRedirectUrl('/login?confirmed=1', url.origin);
  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: referralCode ? { referral_code: referralCode } : undefined,
    },
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const existingUser = !!(data?.user?.identities && data.user.identities.length === 0);
  if (existingUser) {
    return json({
      error: 'Este e-mail já está cadastrado. Clique aqui para fazer login.',
      existingUser: true,
    }, { status: 409 });
  }

  return json({
    success: true,
    user: data.user,
    session: data.session,
  });
}
