import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { safeEqualString } from '$lib/server/safeEqual';
import { buildRateLimitKey, createRateLimitResponse, enforceRateLimit } from '$lib/server/rateLimit';
import { handleChannelMessage } from '$lib/server/gerente/channel';

const KINDS = new Set(['message', 'confirm', 'cancel']);
const MAX_TEXT = 1500;

export async function POST({ request }) {
  const configuredKey = env.GERENTE_CHANNEL_INTERNAL_KEY;
  if (!configuredKey || !env.OPENAI_API_KEY || (env.GERENTE_AGENT_ENABLED || '').toLowerCase() === 'false') {
    return json({ error: 'Canal indisponível.' }, { status: 503 });
  }
  if (!supabaseAdmin) return json({ error: 'Configuração do servidor ausente.' }, { status: 500 });
  const receivedKey = request.headers.get('x-gerente-channel-key') || '';
  if (!safeEqualString(receivedKey, configuredKey)) return json({ error: 'Não autorizado.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const kind = typeof body?.kind === 'string' ? body.kind : 'message';
  const text = typeof body?.text === 'string' ? body.text : '';
  const actionId = typeof body?.action_id === 'string' && body.action_id.trim() ? body.action_id.trim().slice(0, 64) : null;
  if (!phone || !KINDS.has(kind) || text.length > MAX_TEXT) return json({ error: 'Requisição inválida.' }, { status: 400 });
  if ((kind === 'confirm' || kind === 'cancel') && !actionId) return json({ error: 'Requisição inválida.' }, { status: 400 });

  const rateLimit = enforceRateLimit({
    key: buildRateLimitKey('gerente', 'channel', 'phone', phone.replace(/\D/g, '')),
    logKey: 'gerente:channel:phone',
    route: '/api/gerente/channel',
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) return createRateLimitResponse(rateLimit, 'Muitas mensagens. Tente de novo em uma hora.');

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const result = await handleChannelMessage({
      db: supabaseAdmin,
      openai,
      model: env.GERENTE_AGENT_MODEL || undefined,
      phone,
      text,
      kind,
      actionId,
      now: new Date(),
    });
    return json(result);
  } catch (error) {
    console.error('[gerente/channel] failed:', error?.message || error);
    return json({ reply: 'Tive um problema aqui. Tente de novo em um minuto.', pending_action: null, paired: false }, { status: 200 });
  }
}
