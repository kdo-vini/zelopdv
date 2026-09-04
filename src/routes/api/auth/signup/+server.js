import { json } from '@sveltejs/kit';
import { isValidEmail } from '$lib/server/authFlow';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit, getRequestIp, maskEmail, normalizeEmail } from '$lib/server/rateLimit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { supabaseAuth } from '$lib/server/supabaseAuth';
import { getPostHogClient } from '$lib/server/posthog';
import { waitUntil } from '@vercel/functions';

// Campos de atribuição aceitos do cliente. Whitelist explícita: o payload vem do
// localStorage do navegador, então é entrada não confiável e não pode virar um saco
// aberto de chaves arbitrárias dentro do user_metadata.
const ACQUISITION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'ttclid', 'msclkid',
  'origem', 'referrer', 'landing', 'captured_at',
];

function sanitizeAcquisition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clean = {};
  for (const key of ACQUISITION_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, 200);
    if (trimmed) clean[key] = trimmed;
  }
  return Object.keys(clean).length ? clean : null;
}

function isExistingUserError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.status === 409
    || message.includes('already registered')
    || message.includes('already been registered')
    || message.includes('already exists')
    || message.includes('user already')
  );
}

export async function POST({ request, getClientAddress }) {
  if (!supabaseAuth) {
    return json({ error: 'Autenticação indisponível no momento.' }, { status: 500 });
  }
  if (!supabaseAdmin) {
    return json({ error: 'Cadastro automático indisponível no momento.' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const referralCode = String(body.referralCode || '').trim();
  const acquisition = sanitizeAcquisition(body.acquisition);

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

  // A origem entra já aqui, e não só no `empresa_perfil`: boa parte de quem cria conta
  // não termina o onboarding (é justamente pra esses que existe o cron de nudge). Se a
  // atribuição só existisse no perfil, todo abandono viraria origem desconhecida.
  const userMetadata = {};
  if (referralCode) userMetadata.referral_code = referralCode;
  if (acquisition) userMetadata.acquisition = acquisition;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: Object.keys(userMetadata).length ? userMetadata : undefined,
  });

  if (createError) {
    if (isExistingUserError(createError)) {
      return json({
        error: 'Este e-mail já está cadastrado. Clique aqui para fazer login.',
        existingUser: true,
      }, { status: 409 });
    }
    return json({ error: createError.message }, { status: 400 });
  }

  const { data: signedIn, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signedIn?.session) {
    return json({
      error: 'Conta criada, mas não foi possível iniciar sessão automaticamente. Tente entrar com e-mail e senha.',
    }, { status: 500 });
  }

  const newUser = signedIn.user || created.user;
  // Keep the registration response independent of the analytics network. The
  // Vercel lifecycle owns completion after returning the already-created session.
  const analytics = Promise.resolve().then(async () => {
    const posthog = getPostHogClient();
    if (!posthog || !newUser?.id) return;
    posthog.capture({
      distinctId: newUser.id,
      event: 'user_registered',
      properties: {
        $set: { email: newUser.email },
        method: 'email',
        has_referral: !!referralCode,
        ...(acquisition || {}),
      },
    });
    await posthog.flush();
  }).catch(() => console.warn('[auth/signup] Analytics indisponível; conta criada.'));
  waitUntil(analytics);

  return json({
    success: true,
    user: newUser,
    session: signedIn.session,
  });
}
