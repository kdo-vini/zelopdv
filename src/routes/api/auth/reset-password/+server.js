import { json } from '@sveltejs/kit';
import { buildServerAuthRedirectUrl, isValidEmail } from '$lib/server/authFlow';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit, getRequestIp, maskEmail, normalizeEmail } from '$lib/server/rateLimit';
import { supabaseAuth } from '$lib/server/supabaseAuth';

const SUCCESS_MESSAGE = 'Se existir uma conta com este e-mail, enviaremos instruções para redefinir a senha.';

export async function POST({ request, url, getClientAddress }) {
  if (!supabaseAuth) {
    return json({ error: 'Autenticação indisponível no momento.' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);

  if (!email || !isValidEmail(email)) {
    return json({ error: 'Informe um e-mail válido.' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  const policies = [
    {
      key: buildRateLimitKey('auth', 'reset-password', 'ip', ip),
      logKey: `auth:reset-password:ip:${ip}`,
      route: '/api/auth/reset-password',
      limit: 5,
      windowMs: 60 * 60 * 1000,
    },
    {
      key: buildRateLimitKey('auth', 'reset-password', 'email', email),
      logKey: `auth:reset-password:email:${maskEmail(email)}`,
      route: '/api/auth/reset-password',
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

  const redirectTo = buildServerAuthRedirectUrl('/redefinir-senha', url.origin);
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ success: true, message: SUCCESS_MESSAGE });
}
