import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { closeOpenSession, listSessions } from '$lib/server/gerente/sessions';

function checkRateLimit(ownerUserId) {
  return enforceRateLimit({
    key: buildRateLimitKey('gerente', 'sessions', 'owner', ownerUserId),
    logKey: `gerente:sessions:owner:${ownerUserId}`,
    route: '/api/gerente/sessions',
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
}

export async function GET({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { ownerUserId } = auth;

  const rateLimit = checkRateLimit(ownerUserId);
  if (!rateLimit.ok) return createRateLimitResponse(rateLimit, 'Muitas tentativas. Tente de novo em instantes.');

  try {
    const sessions = await listSessions(supabaseAdmin, { ownerUserId });
    return json({ sessions });
  } catch (error) {
    console.error('[gerente/sessions] list failed:', error?.message || error);
    return json({ error: 'Não consegui carregar suas conversas.' }, { status: 500 });
  }
}

export async function POST({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { ownerUserId } = auth;

  const rateLimit = checkRateLimit(ownerUserId);
  if (!rateLimit.ok) return createRateLimitResponse(rateLimit, 'Muitas tentativas. Tente de novo em instantes.');

  try {
    const result = await closeOpenSession(supabaseAdmin, { ownerUserId, channel: 'app' });
    return json({ ok: true, closed: result.closed });
  } catch (error) {
    console.error('[gerente/sessions] close failed:', error?.message || error);
    return json({ error: 'Não consegui abrir uma nova conversa.' }, { status: 500 });
  }
}
