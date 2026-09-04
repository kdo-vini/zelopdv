import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { expiredReactivation, EXPIRED_REACTIVATION_MESSAGE } from '$lib/server/adminSubscriptionPolicy.js';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

const VALID_STATUSES = new Set(['active', 'trialing', 'trial_expired', 'past_due', 'canceled']);
const VALID_PLAN_TIERS = new Set(['pdv', 'chat', 'bundle']);

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
    const userId = body.userId;
    const profile = body.profile || {};
    const subscription = body.subscription || {};

    if (!userId) {
      return json({ error: 'userId obrigatório.' }, { status: 400, headers: cors });
    }

    // Validate subscription fields if provided
    if (subscription.status && !VALID_STATUSES.has(subscription.status)) {
      return json({ error: `Status inválido: ${subscription.status}.` }, { status: 400, headers: cors });
    }
    if (subscription.plan_tier && !VALID_PLAN_TIERS.has(subscription.plan_tier)) {
      return json({ error: `Plano inválido: ${subscription.plan_tier}.` }, { status: 400, headers: cors });
    }

    const nowIso = new Date().toISOString();
    const results = { profileUpdated: false, subscriptionUpdated: false };
    const hasSubFields = ['status', 'plan_tier', 'has_mesas_addon', 'has_acessos_addon', 'has_zelo_menu']
      .some((field) => subscription[field] !== undefined);
    let selectedSubscription = null;
    if (hasSubFields) {
      for (const field of ['has_mesas_addon', 'has_acessos_addon', 'has_zelo_menu']) {
        if (subscription[field] !== undefined && typeof subscription[field] !== 'boolean') {
          return json({ error: `${field} deve ser booleano.` }, { status: 400, headers: cors });
        }
      }
      let query = supabaseAdmin.from('subscriptions')
        .select('id, user_id, status, current_period_end, manually_extended_until, updated_at')
        .eq('user_id', userId);
      // Legacy callers select the same latest row shown in the user editor.
      if (body.subscriptionId) query = query.eq('id', body.subscriptionId);
      else query = query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(1);
      const { data, error } = await query.maybeSingle();
      if (error) return json({ error: 'Não foi possível consultar a assinatura.' }, { status: 500, headers: cors });
      if (!data) return json({ error: 'Assinatura não encontrada para este usuário.' }, { status: 404, headers: cors });
      selectedSubscription = data;
      if (expiredReactivation(data, subscription.status)) {
        return json({ error: EXPIRED_REACTIVATION_MESSAGE }, { status: 409, headers: cors });
      }
    }

    // Update empresa_perfil if profile fields provided
    if (profile.nome_exibicao !== undefined || profile.contato !== undefined) {
      const profileUpdate = {};
      if (profile.nome_exibicao !== undefined) profileUpdate.nome_exibicao = profile.nome_exibicao;
      if (profile.contato !== undefined) profileUpdate.contato = profile.contato;

      const { error: profileErr } = await supabaseAdmin
        .from('empresa_perfil')
        .update(profileUpdate)
        .eq('user_id', userId);

      if (profileErr) {
        return json({ error: `Erro ao atualizar perfil: ${profileErr.message}` }, { status: 500, headers: cors });
      }
      results.profileUpdated = true;
    }

    // Update subscription if fields provided
    if (hasSubFields) {
      const subUpdate = {
        last_modified_by: admin.id,
        last_modified_at: nowIso,
        updated_at: nowIso,
      };

      if (subscription.status !== undefined) subUpdate.status = subscription.status;
      if (subscription.plan_tier !== undefined) subUpdate.plan_tier = subscription.plan_tier;
      if (subscription.has_mesas_addon !== undefined) subUpdate.has_mesas_addon = subscription.has_mesas_addon;
      if (subscription.has_acessos_addon !== undefined) subUpdate.has_acessos_addon = subscription.has_acessos_addon;
      if (subscription.has_zelo_menu !== undefined) subUpdate.has_zelo_menu = subscription.has_zelo_menu;

      // If ending access, expire immediately and clear manual extension.
      if (subscription.status === 'canceled') {
        subUpdate.current_period_end = nowIso;
        subUpdate.manually_extended_until = null;
        subUpdate.cancel_at_period_end = false;
      }
      if (subscription.status === 'trial_expired') {
        subUpdate.current_period_end = nowIso;
        subUpdate.manually_extended_until = null;
        subUpdate.cancel_at_period_end = false;
      }

      let updateQuery = supabaseAdmin
        .from('subscriptions')
        .update(subUpdate)
        .eq('user_id', userId)
        .eq('id', selectedSubscription.id);
      if (selectedSubscription.updated_at) updateQuery = updateQuery.eq('updated_at', selectedSubscription.updated_at);
      const { data: saved, error: subErr } = await updateQuery.select('id').maybeSingle();

      if (subErr) {
        return json({ error: `Erro ao atualizar assinatura: ${subErr.message}` }, { status: 500, headers: cors });
      }
      if (!saved?.id) return json({ error: 'A assinatura mudou durante a edição. Recarregue antes de salvar.' }, { status: 409, headers: cors });
      results.subscriptionUpdated = true;
    }

    return json({
      success: true,
      userId,
      ...results,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/update-user-subscription] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao atualizar usuário.' }, { status: 500, headers: cors });
  }
}
