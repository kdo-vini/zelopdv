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

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('empresa_perfil')
      .select('id, deletion_scheduled_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error('[account/reactivate] profile lookup error:', profileErr);
      return json({ error: 'Falha ao verificar a conta.' }, { status: 500 });
    }
    if (!profile) return json({ error: 'Conta não encontrada.' }, { status: 403 });
    if (!profile.deletion_scheduled_at) {
      return json({ success: true, alreadyActive: true });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('provider_subscription_id, payment_provider, status')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) {
      console.error('[account/reactivate] subscription lookup error:', subErr);
      return json({ error: 'Falha ao verificar a assinatura.' }, { status: 500 });
    }

    const shouldResumeStripe = Boolean(
      sub?.provider_subscription_id
      && sub.payment_provider === 'stripe'
      && sub.status !== 'canceled',
    );
    if (shouldResumeStripe && !stripe) {
      return json({ error: 'Serviço de cobrança indisponível. Tente novamente.' }, { status: 503 });
    }

    // Acquire a database fence before any external effect. While this token is
    // active the purge worker cannot claim the account.
    const { data: reactivationToken, error: beginErr } = await supabaseAdmin.rpc(
      'begin_account_deletion_reactivation',
      { p_empresa_id: profile.id, p_user_id: userId },
    );
    if (beginErr) {
      console.error('[account/reactivate] begin error:', beginErr);
      const beginFailure = `${beginErr.code || ''} ${beginErr.message || ''}`;
      if (/PURGE_IN_PROGRESS|REACTIVATION_IN_PROGRESS/i.test(beginFailure)) {
        return json({ error: 'A exclusão definitiva da conta já está em processamento.' }, { status: 409 });
      }
      return json({ error: 'Falha ao iniciar a reativação da conta.' }, { status: 500 });
    }
    if (!reactivationToken) {
      return json({ success: true, alreadyActive: true });
    }

    if (shouldResumeStripe) {
      try {
        await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: false });
      } catch (stripeErr) {
        const msg = stripeErr?.message || String(stripeErr);
        if (!/resource_missing|not.?found|no such/i.test(msg)) {
          console.error('[account/reactivate] Stripe resume error:', msg);
          return json({
            error: 'Não foi possível reativar a assinatura agora. Tente novamente.',
          }, { status: 502 });
        }
        console.warn('[account/reactivate] Stripe subscription already missing:', msg);
      }
    }

    const { data: completed, error: completeErr } = await supabaseAdmin.rpc(
      'complete_account_deletion_reactivation',
      {
        p_empresa_id: profile.id,
        p_user_id: userId,
        p_reactivation_token: reactivationToken,
      },
    );
    if (completeErr) {
      console.error('[account/reactivate] complete error:', completeErr);
      return json({ error: 'Falha ao reativar a conta.' }, { status: 500 });
    }
    if (completed) return json({ success: true });

    // A concurrent retry may already have completed the same intent. Only that
    // terminal state is an idempotent success; an existing schedule is a real
    // ownership conflict and must stay fenced.
    const { data: currentProfile, error: stateErr } = await supabaseAdmin
      .from('empresa_perfil')
      .select('deletion_scheduled_at')
      .eq('id', profile.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (stateErr) {
      console.error('[account/reactivate] state lookup error:', stateErr);
      return json({ error: 'Falha ao confirmar a reativação da conta.' }, { status: 500 });
    }
    if (currentProfile && !currentProfile.deletion_scheduled_at) {
      return json({ success: true, alreadyActive: true });
    }

    return json({ error: 'A exclusão definitiva da conta já está em processamento.' }, { status: 409 });
  } catch (err) {
    console.error('[account/reactivate] error:', err?.message || err);
    return json({ error: 'Falha ao reativar a conta.' }, { status: 500 });
  }
}
