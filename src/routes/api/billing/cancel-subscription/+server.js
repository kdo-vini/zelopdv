import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { removeSubscription, isConfigured } from '$lib/server/asaas';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!isConfigured()) return json({ error: 'Asaas não configurado.' }, { status: 500 });

    // Auth
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    // Fire-and-forget: track last activity
    supabaseAdmin
      .from('empresa_perfil')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .then(({ error }) => { if (error) console.warn('[cancel-subscription] last_seen_at:', error.message); })
      .catch((e) => console.warn('[cancel-subscription] last_seen_at catch:', e.message));

    // Find user's subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, status')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.provider_subscription_id) {
      return json({ error: 'Nenhuma assinatura encontrada.' }, { status: 404 });
    }

    // Cancel in Asaas
    try {
      await removeSubscription(sub.provider_subscription_id);
    } catch (asaasErr) {
      console.warn('[Asaas] Error canceling subscription (may already be canceled):', asaasErr?.message);
    }

    // Update in our DB — preserve status so access remains until current_period_end expires.
    // cancel_at_period_end: true signals that renewal was canceled.
    // isSubscriptionActiveStrict checks both status AND current_period_end, so the user
    // retains access until their paid period ends without us needing a cron job.
    const { error: dbErr } = await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (dbErr) {
      console.error('[Asaas] Error updating DB after cancel:', dbErr);
      return json({ error: 'Erro ao atualizar banco de dados.' }, { status: 500 });
    }

    return json({ success: true, message: 'Assinatura cancelada. Acesso mantido até o fim do período atual.' });
  } catch (err) {
    console.error('[Asaas] cancel-subscription error:', err?.message || err);
    return json({ error: 'Falha ao cancelar assinatura.' }, { status: 500 });
  }
}
