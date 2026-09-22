import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { safeEqualString } from '$lib/server/safeEqual';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { handleMendCatalogAction } from '$lib/server/gerente/mendCatalog';

const ACTIONS = new Set(['resolve', 'pair', 'search', 'prepare_delete', 'execute_delete']);

export async function POST({ request }) {
  const configuredKey = env.GERENTE_CHANNEL_INTERNAL_KEY;
  if (!configuredKey) return json({ error: 'Canal indisponível.' }, { status: 503 });
  if (!supabaseAdmin) return json({ error: 'Configuração do servidor ausente.' }, { status: 500 });
  const receivedKey = request.headers.get('x-gerente-channel-key') || '';
  if (!safeEqualString(receivedKey, configuredKey)) {
    return json({ error: 'Não autorizado.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const action = typeof body?.action === 'string' ? body.action : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!ACTIONS.has(action) || !phone) {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const rateLimit = enforceRateLimit({
    key: buildRateLimitKey('gerente', 'mend-catalog', 'phone', phone.replace(/\D/g, '')),
    logKey: 'gerente:mend-catalog:phone',
    route: '/api/gerente/mend/catalog',
    limit: 40,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return createRateLimitResponse(rateLimit, 'Muitas solicitações. Tente de novo em uma hora.');
  }

  try {
    const result = await handleMendCatalogAction({
      db: supabaseAdmin,
      action,
      phone,
      code: body?.code ?? null,
      termo: body?.termo ?? null,
      produto_ids: Array.isArray(body?.produto_ids) ? body.produto_ids : [],
      categoria_ids: Array.isArray(body?.categoria_ids) ? body.categoria_ids : [],
      todos: body?.todos === true,
      limite: body?.limite,
      now: new Date(),
    });
    return json(result);
  } catch (error) {
    console.error('[gerente/mend/catalog] failed:', error?.message || error);
    return json({ ok: false, code: 'INTERNAL' }, { status: 500 });
  }
}
