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

function maxDate(...dates) {
  return dates.filter(Boolean).reduce((latest, current) => (current > latest ? current : latest), dates.find(Boolean) || null);
}

function parseTargetDate(dateString) {
  if (typeof dateString !== 'string') return null;
  const trimmed = dateString.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return parseDate(`${trimmed}T23:59:59.999-03:00`);
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
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const days = Number(body.days);
    const targetDate = typeof body.targetDate === 'string' ? body.targetDate : '';

    if (!subscriptionId) return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });
    if (!reason) return json({ error: 'Motivo obrigatório.' }, { status: 400, headers: cors });

    const isDaysMode = Number.isFinite(days) && days > 0;
    const parsedTargetDate = parseTargetDate(targetDate);
    const isTargetDateMode = !!parsedTargetDate;

    if (!isDaysMode && !isTargetDateMode) {
      return json({ error: 'Informe dias ou uma data final válida.' }, { status: 400, headers: cors });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end, manually_extended_until, payment_provider, billing_type, cancel_at_period_end')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });

    const now = new Date();
    const currentPeriodEnd = parseDate(sub.current_period_end);
    const manualUntil = parseDate(sub.manually_extended_until);
    const effectiveExpiry = maxDate(currentPeriodEnd, manualUntil);
    const baseDate = maxDate(effectiveExpiry, now) || now;

    let newExpiry;
    if (isTargetDateMode) {
      newExpiry = parsedTargetDate;
      if (effectiveExpiry && newExpiry <= effectiveExpiry) {
        return json({
          error: `A data final precisa ser posterior ao vencimento atual (${effectiveExpiry.toLocaleDateString('pt-BR')}).`,
        }, { status: 400, headers: cors });
      }
      if (!effectiveExpiry && newExpiry <= now) {
        return json({ error: 'A data final precisa ser futura.' }, { status: 400, headers: cors });
      }
    } else {
      newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    }

    const nowIso = now.toISOString();
    const updatePayload = {
      manually_extended_until: newExpiry.toISOString(),
      status: 'active',
      cancel_at_period_end: false,
      last_modified_by: admin.id,
      last_modified_at: nowIso,
      updated_at: nowIso,
    };

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
      previousExpiry: effectiveExpiry?.toISOString() || null,
      newExpiry: newExpiry.toISOString(),
      wasExpired: effectiveExpiry ? effectiveExpiry < now : true,
      provider: sub.payment_provider || null,
      billingType: sub.billing_type || null,
      mode: isTargetDateMode ? 'target_date' : 'days',
      days: isDaysMode ? days : null,
      targetDate: isTargetDateMode ? targetDate : null,
      reason,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/extend-subscription] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao estender assinatura.' }, { status: 500, headers: cors });
  }
}
