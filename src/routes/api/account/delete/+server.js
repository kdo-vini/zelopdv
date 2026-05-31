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
    const { data: ownProfile } = await supabaseAdmin
      .from('empresa_perfil')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!ownProfile) {
      return json({ error: 'Apenas o titular da conta pode apagá-la.' }, { status: 403 });
    }

    // 1) Cancel Stripe subscription at period end (reversible).
    if (stripe) {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('provider_subscription_id, payment_provider')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sub?.provider_subscription_id && sub.payment_provider === 'stripe') {
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
    }

    // 2) Schedule the deletion (grace period).
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const { error: dbErr } = await supabaseAdmin
      .from('empresa_perfil')
      .update({
        deletion_scheduled_at: scheduledAt.toISOString(),
        deletion_requested_at: now.toISOString(),
        deletion_source: 'pdv',
      })
      .eq('user_id', userId);
    if (dbErr) {
      console.error('[account/delete] schedule error:', dbErr);
      return json({ error: 'Falha ao agendar a exclusão.' }, { status: 500 });
    }

    return json({ success: true, scheduledAt: scheduledAt.toISOString(), graceDays: GRACE_DAYS });
  } catch (err) {
    console.error('[account/delete] error:', err?.message || err);
    return json({ error: 'Falha ao agendar a exclusão da conta.' }, { status: 500 });
  }
}
