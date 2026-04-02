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

    // Update in our DB
    const { error: dbErr } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'canceled',
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (dbErr) {
      console.error('[Asaas] Error updating DB after cancel:', dbErr);
      return json({ error: 'Erro ao atualizar banco de dados.' }, { status: 500 });
    }

    return json({ success: true, message: 'Assinatura cancelada com sucesso.' });
  } catch (err) {
    console.error('[Asaas] cancel-subscription error:', err?.message || err);
    return json({ error: 'Falha ao cancelar assinatura.' }, { status: 500 });
  }
}
