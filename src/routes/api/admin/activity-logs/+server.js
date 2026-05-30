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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function unauthorized(headers) {
  return json({ error: 'Não autorizado.' }, { status: 401, headers });
}

async function requireSuperAdmin(request, headers) {
  if (!supabaseAdmin) {
    return { errorResponse: json({ error: 'Supabase admin não configurado.' }, { status: 500, headers }) };
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { errorResponse: unauthorized(headers) };

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return { errorResponse: unauthorized(headers) };

  const { data: admin } = await supabaseAdmin
    .from('super_admins')
    .select('id, is_active, email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) {
    return { errorResponse: json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers }) };
  }

  return { admin, user };
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function GET({ request, url }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    const auth = await requireSuperAdmin(request, cors);
    if (auth.errorResponse) return auth.errorResponse;

    const limitParam = Number(url.searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;
    const adminId = url.searchParams.get('adminId');

    let query = supabaseAdmin
      .from('admin_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (adminId) query = query.eq('admin_id', adminId);

    const { data, error } = await query;
    if (error) {
      return json({ error: error.message }, { status: 500, headers: cors });
    }

    return json({ logs: data || [] }, { headers: cors });
  } catch (err) {
    console.error('[admin/activity-logs][GET] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao buscar logs.' }, { status: 500, headers: cors });
  }
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    const auth = await requireSuperAdmin(request, cors);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const {
      adminId,
      action,
      targetUserId = null,
      targetEmail: providedTargetEmail = null,
      details = {},
    } = body;

    if (!action || typeof action !== 'string') {
      return json({ error: 'action obrigatório.' }, { status: 400, headers: cors });
    }
    if (adminId && adminId !== auth.admin.id) {
      return json({ error: 'adminId divergente da sessão autenticada.' }, { status: 403, headers: cors });
    }

    let targetEmail = providedTargetEmail;
    if (!targetEmail && targetUserId) {
      try {
        const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        if (!userErr) targetEmail = userData?.user?.email || null;
      } catch (lookupErr) {
        console.warn('[admin/activity-logs] target user lookup failed:', lookupErr?.message || lookupErr);
      }
    }

    const payload = {
      admin_id: auth.admin.id,
      admin_email: auth.admin.email || null,
      action,
      target_user_id: targetUserId,
      target_email: targetEmail,
      details,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('admin_activity_logs')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500, headers: cors });
    }

    return json({ success: true, log: data }, { headers: cors });
  } catch (err) {
    console.error('[admin/activity-logs][POST] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao registrar log.' }, { status: 500, headers: cors });
  }
}
