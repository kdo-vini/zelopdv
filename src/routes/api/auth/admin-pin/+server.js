import { json } from '@sveltejs/kit';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { safeEqualString } from '$lib/server/safeEqual';
import { getServerAccessContext } from '$lib/server/accessControl';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const PIN_PATTERN = /^\d{4,6}$/;

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

async function authenticate(request) {
  if (!supabaseAdmin) return { response: json({ error: 'Serviço indisponível.' }, { status: 503 }) };

  const token = getBearerToken(request);
  if (!token) return { response: json({ error: 'Não autorizado.' }, { status: 401 }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user?.id) return { response: json({ error: 'Não autorizado.' }, { status: 401 }) };

  return { user };
}

async function loadPin(ownerUserId) {
  const { data, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('pin_admin, pin_enabled')
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (error) {
    console.error('[auth/admin-pin] profile lookup error:', error.message);
    return { error: json({ error: 'Não foi possível carregar a configuração de segurança.' }, { status: 500 }) };
  }

  if (!data) return { error: json({ error: 'Conta não encontrada.' }, { status: 404 }) };
  return {
    pin: String(data.pin_admin || ''),
    enabled: data.pin_enabled !== false,
  };
}

export async function GET({ request }) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const context = await getServerAccessContext(auth.user.id);
  const profile = await loadPin(context.ownerUserId);
  if (profile.error) return profile.error;

  // The browser receives only the state needed to render the lock. The PIN
  // itself never crosses the API boundary.
  return json({
    configured: Boolean(profile.pin),
    enabled: profile.enabled,
    canSet: !context.isSubUser,
  });
}

export async function POST({ request }) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const action = body?.action;
  const pin = String(body?.pin || '');
  if (!['verify', 'set', 'disable'].includes(action)) {
    return json({ error: 'PIN deve ter entre 4 e 6 dígitos.' }, { status: 400 });
  }

  if (['verify', 'set'].includes(action) && !PIN_PATTERN.test(pin)) {
    return json({ error: 'PIN deve ter entre 4 e 6 dígitos.' }, { status: 400 });
  }

  const context = await getServerAccessContext(auth.user.id);
  if (action === 'verify') {
    const result = enforceRateLimit({
      key: buildRateLimitKey('auth', 'admin-pin', 'verify', auth.user.id),
      logKey: `auth:admin-pin:verify:user:${auth.user.id}`,
      route: '/api/auth/admin-pin',
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!result.ok) return createRateLimitResponse(result);

    const profile = await loadPin(context.ownerUserId);
    if (profile.error) return profile.error;
    if (!profile.pin || !safeEqualString(pin, profile.pin)) {
      return json({ error: 'PIN incorreto.' }, { status: 401 });
    }
    return json({ success: true });
  }

  // Only the account owner can create, replace, or disable the company PIN.
  // Sub-users may verify the owner's PIN, but cannot change the shared gate.
  if (context.isSubUser) return json({ error: 'Somente o titular pode alterar o PIN.' }, { status: 403 });

  const currentProfile = await loadPin(context.ownerUserId);
  if (currentProfile.error) return currentProfile.error;

  if (action === 'disable' && currentProfile.pin) {
    const currentPin = String(body?.currentPin || '');
    if (!PIN_PATTERN.test(currentPin) || !safeEqualString(currentPin, currentProfile.pin)) {
      return json({ error: 'PIN incorreto.' }, { status: 401 });
    }
  }

  if (action === 'disable') {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('empresa_perfil')
      .update({ pin_admin: null, pin_enabled: false })
      .eq('user_id', context.ownerUserId)
      .select('user_id')
      .maybeSingle();

    if (profileError) {
      console.error('[auth/admin-pin] profile disable error:', profileError.message);
      return json({ error: 'Não foi possível desativar o PIN.' }, { status: 500 });
    }
    if (!profile) return json({ error: 'Conta não encontrada.' }, { status: 404 });
    return json({ success: true, configured: false, enabled: false });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('empresa_perfil')
    .update({ pin_admin: pin, pin_enabled: true })
    .eq('user_id', context.ownerUserId)
    .select('user_id')
    .maybeSingle();

  if (profileError) {
    console.error('[auth/admin-pin] profile update error:', profileError.message);
    return json({ error: 'Não foi possível salvar o PIN.' }, { status: 500 });
  }
  if (!profile) return json({ error: 'Conta não encontrada.' }, { status: 404 });

  return json({ success: true, configured: true, enabled: true });
}
