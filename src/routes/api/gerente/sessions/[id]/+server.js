import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { loadSessionMessages } from '$lib/server/gerente/sessions';

const NOT_FOUND_MESSAGE = 'Conversa não encontrada.';

export async function GET({ request, params }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { ownerUserId } = auth;

  const rateLimit = enforceRateLimit({
    key: buildRateLimitKey('gerente', 'sessions', 'owner', ownerUserId),
    logKey: `gerente:sessions:owner:${ownerUserId}`,
    route: '/api/gerente/sessions/[id]',
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) return createRateLimitResponse(rateLimit, 'Muitas tentativas. Tente de novo em instantes.');

  const sessionId = typeof params?.id === 'string' ? params.id.trim() : '';
  if (!sessionId) return json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

  try {
    const { found, messages } = await loadSessionMessages(supabaseAdmin, { sessionId, ownerUserId });
    if (!found) return json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    return json({ messages });
  } catch (error) {
    console.error('[gerente/sessions/[id]] load failed:', error?.message || error);
    return json({ error: 'Não consegui carregar essa conversa.' }, { status: 500 });
  }
}
