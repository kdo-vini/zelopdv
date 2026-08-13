// Self-service account deletion (LGPD Art. 18, III) — SCHEDULES deletion with a
// 14-day grace period instead of purging immediately.
//   1. auth: verify the caller owns the account and is NOT a sub-user
//   2. Stripe: cancel at period end (reversible — resumes on reactivation)
//   3. DB: mark empresa_perfil.deletion_scheduled_at = now() + 14 days
// The actual irreversible purge (delete_account RPC + storage + Whatsmiau) is run
// by the deletion sweeper once the grace period elapses. The user can reactivate
// any time before then via POST /api/account/reactivate.
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const GRACE_DAYS = 14;

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Serviço indisponível.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;

    // Only the account owner may delete. Sub-users (funcionários) must never be
    // able to schedule deletion of the owner's account.
    const { data: ownProfile, error: profileErr } = await supabaseAdmin
      .from('empresa_perfil')
      .select('id, deletion_scheduled_at, deletion_purge_token, deletion_reactivation_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error('[account/delete] profile lookup error:', profileErr);
      return json({ error: 'Falha ao verificar a conta.' }, { status: 500 });
    }
    if (!ownProfile) {
      return json({ error: 'Apenas o titular da conta pode apagá-la.' }, { status: 403 });
    }

    if (ownProfile.deletion_purge_token != null || ownProfile.deletion_reactivation_token != null) {
      return json({ error: 'A exclus\u00e3o definitiva da conta j\u00e1 est\u00e1 em processamento.' }, { status: 409 });
    }
    if (ownProfile.deletion_scheduled_at) {
      return json({
        success: true,
        scheduledAt: ownProfile.deletion_scheduled_at,
        graceDays: GRACE_DAYS,
        alreadyScheduled: true,
      });
    }

    // 1) Cancel Stripe subscription at period end (reversible).
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('provider_subscription_id, payment_provider')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) {
      console.error('[account/delete] subscription lookup error:', subErr);
      return json({ error: 'Falha ao verificar a assinatura.' }, { status: 500 });
    }
    if (sub?.provider_subscription_id && sub.payment_provider === 'stripe') {
      if (!stripe) {
        return json({ error: 'Serviço de cobrança indisponível. Tente novamente.' }, { status: 503 });
      }
      try {
        await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true });
      } catch (stripeErr) {
        const msg = stripeErr?.message || '';
        if (!/resource_missing|not.?found|no such/i.test(msg)) {
          console.error('[account/delete] Stripe cancel error:', msg);
          return json({
            error: 'Não foi possível agendar o cancelamento da assinatura. Tente novamente.',
          }, { status: 502 });
        }
      }
    }

    // 2) Schedule the deletion (grace period).
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const { data: scheduledProfile, error: dbErr } = await supabaseAdmin
      .from('empresa_perfil')
      .update({
        deletion_scheduled_at: scheduledAt.toISOString(),
        deletion_requested_at: now.toISOString(),
        deletion_source: 'pdv',
      })
      .eq('user_id', userId)
      .is('deletion_purge_token', null)
      .is('deletion_reactivation_token', null)
      .is('deletion_scheduled_at', null)
      .select('id')
      .maybeSingle();
    if (dbErr) {
      console.error('[account/delete] schedule error:', dbErr);
      return json({ error: 'Falha ao agendar a exclusão.' }, { status: 500 });
    }

    if (!scheduledProfile) {
      const { data: currentProfile, error: stateErr } = await supabaseAdmin
        .from('empresa_perfil')
        .select('deletion_scheduled_at, deletion_purge_token, deletion_reactivation_token')
        .eq('id', ownProfile.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (stateErr) {
        console.error('[account/delete] state lookup error:', stateErr);
        return json({ error: 'Falha ao confirmar o agendamento da exclus\u00e3o.' }, { status: 500 });
      }
      if (currentProfile?.deletion_purge_token != null || currentProfile?.deletion_reactivation_token != null) {
        return json({ error: 'A exclus\u00e3o definitiva da conta j\u00e1 est\u00e1 em processamento.' }, { status: 409 });
      }
      if (currentProfile?.deletion_scheduled_at) {
        return json({
          success: true,
          scheduledAt: currentProfile.deletion_scheduled_at,
          graceDays: GRACE_DAYS,
          alreadyScheduled: true,
        });
      }
      return json({ error: 'A exclus\u00e3o definitiva da conta j\u00e1 est\u00e1 em processamento.' }, { status: 409 });
    }

    return json({ success: true, scheduledAt: scheduledAt.toISOString(), graceDays: GRACE_DAYS });
  } catch (err) {
    console.error('[account/delete] error:', err?.message || err);
    return json({ error: 'Falha ao agendar a exclusão da conta.' }, { status: 500 });
  }
}
