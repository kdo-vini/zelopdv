// Admin-only: reclassifica uma subscription como 'manual' (limpa provider_*).
// Pra subs órfãs no Stripe (IDs legados de migração que não existem no provedor real).
// Não chama Stripe — pura limpeza de DB.
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
    return json({ error: 'Origem não permitida.' }, { status: 403 });
  }

  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500, headers: cors });

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
    const { subscriptionId } = body;

    if (!subscriptionId) return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, payment_provider, provider_subscription_id')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });

    const { error: updErr } = await supabaseAdmin
      .from('subscriptions')
      .update({
        payment_provider: 'manual',
        provider_subscription_id: null,
        provider_customer_id: null,
        billing_type: null,
        last_modified_by: admin.id,
        last_modified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (updErr) return json({ error: updErr.message }, { status: 500, headers: cors });

    return json({
      success: true,
      previousProvider: sub.payment_provider,
      previousProviderSubId: sub.provider_subscription_id,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/reclassify-manual] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao reclassificar.' }, { status: 500, headers: cors });
  }
}
