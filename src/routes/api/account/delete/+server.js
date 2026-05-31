// Self-service account deletion (LGPD Art. 18, III).
// Orchestrates the irreversible deletion of a user's account and ALL their data
// across Zelo PDV + ZeloChat (shared DB):
//   1. auth: verify the caller owns the account and is NOT a sub-user
//   2. Stripe: cancel the subscription immediately (so billing stops)
//   3. Storage: best-effort removal of the account's files
//   4. DB: public.delete_account() purges every table + the auth identity
//
// The destructive RPC is service_role-only, so this endpoint is the single
// gate — the browser can never purge directly and skip steps 2/3.
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

async function removePrefix(bucket, prefix) {
  // Lists and removes every object under `prefix` (best-effort).
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data?.length) return;
    const paths = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths);
  } catch (e) {
    console.warn(`[account/delete] storage cleanup ${bucket}/${prefix} falhou:`, e?.message || e);
  }
}

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Serviço indisponível.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;

    // Only the account owner may delete. Sub-users (funcionários) operate under an
    // owner and must never be able to destroy the owner's account.
    const { data: ownProfile } = await supabaseAdmin
      .from('empresa_perfil')
      .select('id, logo_url')
      .eq('user_id', userId)
      .maybeSingle();
    if (!ownProfile) {
      return json({ error: 'Apenas o titular da conta pode apagá-la.' }, { status: 403 });
    }
    const empresaId = ownProfile.id;

    // 1) Cancel Stripe subscription immediately (not at period end — the account is going away).
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
          await stripe.subscriptions.cancel(sub.provider_subscription_id);
        } catch (stripeErr) {
          const msg = stripeErr?.message || '';
          if (!/resource_missing|not.?found|no such|already canceled/i.test(msg)) {
            console.error('[account/delete] Stripe cancel error:', msg);
            return json({
              error: 'Não foi possível cancelar a assinatura. Tente novamente em alguns minutos.',
            }, { status: 502 });
          }
        }
      }
    }

    // 2) Storage cleanup (best-effort — the authoritative PII lives in the DB).
    await Promise.allSettled([
      supabaseAdmin.storage.from('logos').remove([`${userId}.png`, `${userId}.jpg`, `${userId}.jpeg`, `${userId}.webp`]),
      removePrefix('zelochat-media', `send/${empresaId}`),
      removePrefix('zelochat-media', `received/${empresaId}`),
      removePrefix('delivery-assets', `${empresaId}`),
    ]);

    // 3) Purge all DB data + the auth identity (irreversible).
    const { error: rpcErr } = await supabaseAdmin.rpc('delete_account', {
      p_user_id: userId,
      p_source: 'pdv',
    });
    if (rpcErr) {
      console.error('[account/delete] RPC error:', rpcErr);
      return json({ error: 'Falha ao apagar a conta. Nenhum dado foi removido.' }, { status: 500 });
    }

    return json({ success: true });
  } catch (err) {
    console.error('[account/delete] error:', err?.message || err);
    return json({ error: 'Falha ao apagar a conta.' }, { status: 500 });
  }
}
