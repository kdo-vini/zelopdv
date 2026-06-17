import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

const VALID_STATUSES = new Set(['active', 'trialing', 'trial_expired', 'past_due', 'canceled']);

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
    const newStatus = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
    const expireImmediately = body.expireImmediately === true;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!subscriptionId) {
      return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });
    }

    if (!VALID_STATUSES.has(newStatus)) {
      return json({ error: `Status inválido. Valores aceitos: ${[...VALID_STATUSES].join(', ')}.` }, { status: 400, headers: cors });
    }

    // Fetch current subscription to validate and return diff
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, manually_extended_until')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) {
      return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      status: newStatus,
      last_modified_by: admin.id,
      last_modified_at: nowIso,
      updated_at: nowIso,
    };

    // Cancel logic: expire immediately and clear manual extension
    if (newStatus === 'canceled' && (expireImmediately || sub.status !== 'canceled')) {
      updatePayload.current_period_end = nowIso;
      updatePayload.manually_extended_until = null;
      updatePayload.cancel_at_period_end = false;
    }

    if (newStatus === 'trial_expired') {
      updatePayload.current_period_end = nowIso;
      updatePayload.manually_extended_until = null;
      updatePayload.cancel_at_period_end = false;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('subscriptions')
      .update(updatePayload)
      .eq('id', subscriptionId);

    if (updateErr) {
      return json({ error: updateErr.message }, { status: 500, headers: cors });
    }

    return json({
      success: true,
      subscriptionId,
      oldStatus: sub.status,
      newStatus,
      expiredImmediately: newStatus === 'canceled' || newStatus === 'trial_expired',
      reason: reason || null,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/update-status] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao atualizar status.' }, { status: 500, headers: cors });
  }
}
