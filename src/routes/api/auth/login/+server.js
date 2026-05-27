import { json } from '@sveltejs/kit';
import { isValidEmail } from '$lib/server/authFlow';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit, getRequestIp, maskEmail, normalizeEmail } from '$lib/server/rateLimit';
import { supabaseAuth } from '$lib/server/supabaseAuth';

export async function POST({ request, getClientAddress }) {
  if (!supabaseAuth) {
    return json({ error: 'Autenticação indisponível no momento.' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');

  if (!email || !password || !isValidEmail(email)) {
    return json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  const policies = [
    {
      key: buildRateLimitKey('auth', 'login', 'ip', ip),
      logKey: `auth:login:ip:${ip}`,
      route: '/api/auth/login',
      limit: 10,
      windowMs: 60 * 1000,
    },
    {
      key: buildRateLimitKey('auth', 'login', 'ip', ip, 'email', email),
      logKey: `auth:login:ip:${ip}:email:${maskEmail(email)}`,
      route: '/api/auth/login',
      limit: 5,
      windowMs: 10 * 60 * 1000,
    },
  ];

  for (const policy of policies) {
    const result = enforceRateLimit(policy);
    if (!result.ok) {
      return createRateLimitResponse(result);
    }
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({
    success: true,
    session: data.session,
    user: data.user,
  });
}
