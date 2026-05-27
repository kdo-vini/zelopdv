import { json } from '@sveltejs/kit';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit, maskEmail } from '$lib/server/rateLimit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { supabaseAuth } from '$lib/server/supabaseAuth';

export async function POST({ request }) {
  if (!supabaseAdmin || !supabaseAuth) {
    return json({ error: 'Autenticação indisponível no momento.' }, { status: 500 });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user?.email) {
    return json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const policies = [
    {
      key: buildRateLimitKey('auth', 'pin-reset-otp', 'user', user.id),
      logKey: `auth:pin-reset-otp:user:${user.id}`,
      route: '/api/auth/pin-reset-otp',
      limit: 3,
      windowMs: 60 * 60 * 1000,
    },
    {
      key: buildRateLimitKey('auth', 'pin-reset-otp', 'day', 'user', user.id),
      logKey: `auth:pin-reset-otp:day:user:${user.id}:email:${maskEmail(user.email)}`,
      route: '/api/auth/pin-reset-otp',
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
    },
  ];

  for (const policy of policies) {
    const result = enforceRateLimit(policy);
    if (!result.ok) {
      return createRateLimitResponse(result);
    }
  }

  const { error } = await supabaseAuth.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({
    success: true,
    email: user.email,
    message: `Código enviado para ${user.email}`,
  });
}
