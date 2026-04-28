// Cancela subscription Stripe ao final do período (cancel_at_period_end=true).
// User mantém acesso até current_period_end. Pra cancelamento imediato, use admin-dashboard.
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!stripe) return json({ error: 'Stripe não configurado.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    // Fire-and-forget last_seen
    supabaseAdmin
      .from('empresa_perfil')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .then(() => {})
      .catch(() => {});

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, status, payment_provider')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) return json({ error: 'Nenhuma assinatura encontrada.' }, { status: 404 });
    if (sub.status === 'canceled') {
      return json({ success: true, alreadyCanceled: true, message: 'Assinatura já estava cancelada.' });
    }

    // Se tem provider Stripe, cancela lá. Se não tem (manual/Asaas legado), só atualiza DB.
    if (sub.provider_subscription_id && sub.payment_provider === 'stripe') {
      try {
        await stripe.subscriptions.update(sub.provider_subscription_id, {
          cancel_at_period_end: true,
        });
      } catch (stripeErr) {
        const msg = stripeErr?.message || '';
        const looksLikeAlreadyGone = /resource_missing|not.?found|no such/i.test(msg);
        if (!looksLikeAlreadyGone) {
          console.error('[cancel-subscription] Stripe error:', msg);
          return json({
            error: 'Não foi possível cancelar no Stripe. Tente novamente em alguns minutos.',
          }, { status: 502 });
        }
        console.warn('[cancel-subscription] Subscription Stripe já não existia:', msg);
      }
    }

    const { error: dbErr } = await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (dbErr) {
      console.error('[cancel-subscription] DB update error:', dbErr);
      return json({ error: 'Erro ao atualizar banco de dados.' }, { status: 500 });
    }

    return json({ success: true, message: 'Assinatura cancelada. Acesso mantido até o fim do período atual.' });
  } catch (err) {
    console.error('[cancel-subscription] error:', err?.message || err);
    return json({ error: 'Falha ao cancelar assinatura.' }, { status: 500 });
  }
}
