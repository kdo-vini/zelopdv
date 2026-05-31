// Cancels a pending self-service account deletion (within the 14-day grace period).
// Clears the schedule and resumes the Stripe subscription (cancel_at_period_end=false).
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Serviço indisponível.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;

    const { data: profile } = await supabaseAdmin
      .from('empresa_perfil')
      .select('id, deletion_scheduled_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Conta não encontrada.' }, { status: 403 });
    if (!profile.deletion_scheduled_at) {
      return json({ success: true, alreadyActive: true });
    }

    // Resume Stripe subscription if it was set to cancel at period end.
    if (stripe) {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('provider_subscription_id, payment_provider, status')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sub?.provider_subscription_id && sub.payment_provider === 'stripe' && sub.status !== 'canceled') {
        try {
          await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: false });
        } catch (stripeErr) {
          // Non-fatal: the account stays active even if Stripe resume hiccups.
          console.warn('[account/reactivate] Stripe resume warning:', stripeErr?.message || stripeErr);
        }
      }
    }

    const { error: dbErr } = await supabaseAdmin
      .from('empresa_perfil')
      .update({
        deletion_scheduled_at: null,
        deletion_requested_at: null,
        deletion_source: null,
      })
      .eq('user_id', userId);
    if (dbErr) {
      console.error('[account/reactivate] error:', dbErr);
      return json({ error: 'Falha ao reativar a conta.' }, { status: 500 });
    }

    return json({ success: true });
  } catch (err) {
    console.error('[account/reactivate] error:', err?.message || err);
    return json({ error: 'Falha ao reativar a conta.' }, { status: 500 });
  }
}
