/**
 * GET /api/cron/expire-trials
 *
 * Daily reconciliation for local free trials created without a billing
 * provider. Stripe-owned subscriptions keep following Stripe webhooks.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { safeEqualString } from '$lib/server/safeEqual';
import { SUBSCRIPTION_STATUS } from '$lib/subscriptionStatus';

function hasFutureManualExtension(sub, now) {
  if (!sub?.manually_extended_until) return false;
  const manualEnd = new Date(sub.manually_extended_until);
  return !Number.isNaN(manualEnd.getTime()) && manualEnd > now;
}

export async function GET({ request }) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || !safeEqualString(authHeader, `Bearer ${cronSecret}`)) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!supabaseAdmin) {
    return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, status, current_period_end, manually_extended_until, provider_subscription_id')
    .eq('status', SUBSCRIPTION_STATUS.TRIALING)
    .lt('current_period_end', nowIso);

  if (fetchErr) {
    console.error('[expire-trials] Erro ao buscar trials vencidos:', fetchErr.message);
    return json({ error: fetchErr.message }, { status: 500 });
  }

  const expiredLocalTrials = (candidates || []).filter((sub) =>
    !sub.provider_subscription_id && !hasFutureManualExtension(sub, now)
  );

  if (expiredLocalTrials.length === 0) {
    return json({
      ok: true,
      message: 'Nenhum trial local vencido encontrado.',
      scanned: candidates?.length || 0,
      expired: 0,
      skippedProviderOwned: (candidates || []).filter((sub) => !!sub.provider_subscription_id).length,
      skippedManualExtension: (candidates || []).filter((sub) => hasFutureManualExtension(sub, now)).length,
    });
  }

  const ids = expiredLocalTrials.map((sub) => sub.id);
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: SUBSCRIPTION_STATUS.TRIAL_EXPIRED,
      updated_at: nowIso,
    })
    .in('id', ids)
    .eq('status', SUBSCRIPTION_STATUS.TRIALING)
    .select('id, user_id');

  if (updateErr) {
    console.error('[expire-trials] Erro ao expirar trials:', updateErr.message);
    return json({ error: updateErr.message }, { status: 500 });
  }

  const expired = updated?.length || 0;
  console.log(`[expire-trials] Trials expirados: ${expired}/${expiredLocalTrials.length}`);

  return json({
    ok: true,
    scanned: candidates?.length || 0,
    expired,
    skippedProviderOwned: (candidates || []).filter((sub) => !!sub.provider_subscription_id).length,
    skippedManualExtension: (candidates || []).filter((sub) => hasFutureManualExtension(sub, now)).length,
    expiredUserIds: (updated || []).map((sub) => sub.user_id),
  });
}
