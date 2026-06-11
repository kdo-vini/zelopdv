import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500, headers: cors });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: admin } = await supabaseAdmin
      .from('super_admins')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!admin) return json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers: cors });

    const body = await request.json().catch(() => ({}));
    const subscriptionId = body.subscriptionId;
    const days = Number(body.days);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!subscriptionId) {
      return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });
    }

    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return json({ error: 'days deve ser um inteiro entre 1 e 365.' }, { status: 400, headers: cors });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) {
      return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });
    }

    const now = new Date();
    const currentEnd = parseDate(sub.current_period_end);
    const baseDate = !currentEnd || currentEnd < now ? now : currentEnd;
    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    const nowIso = now.toISOString();
    const newEndIso = newEnd.toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'trialing',
        current_period_end: newEndIso,
        last_modified_by: admin.id,
        last_modified_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', subscriptionId);

    if (updateErr) {
      return json({ error: updateErr.message }, { status: 500, headers: cors });
    }

    return json({
      success: true,
      subscriptionId,
      days,
      newExpiry: newEndIso,
      previousExpiry: currentEnd?.toISOString() || null,
      previousStatus: sub.status,
      reason: reason || null,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/extend-trial] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao estender trial.' }, { status: 500, headers: cors });
  }
}
