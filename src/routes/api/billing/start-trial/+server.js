import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { enviarBoasVindas } from '$lib/server/whatsapp';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { emailDay0 } from '$lib/server/emailTemplates';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });

    // Auth
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;
    const email = user.email;

    // Idempotency: return early if subscription already exists
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSub) {
      return json({
        success: true,
        trialEnd: existingSub.current_period_end,
        alreadyExists: true,
      });
    }

    // Create trial subscription record (no Asaas call needed)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: userId,
        status: 'trialing',
        current_period_end: trialEnd.toISOString(),
        cancel_at_period_end: false,
        payment_provider: 'asaas',
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertError) {
      console.error('[start-trial] DB insert failed:', insertError);
      return json({ error: 'Erro ao ativar período de teste. Tente novamente.' }, { status: 500 });
    }

    // Fire-and-forget: track last activity
    supabaseAdmin
      .from('empresa_perfil')
      .update({ last_seen_at: nowIso })
      .eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[start-trial] last_seen_at:', error.message); })
      .catch((e) => console.warn('[start-trial] last_seen_at catch:', e.message));

    // Fire-and-forget: day-0 email — uses auth email directly, no perfil dependency
    if (isEmailConfigured()) {
      const { subject, html } = emailDay0('');
      sendEmail({ to: email, subject, html })
        .then((sent) => {
          if (sent) {
            supabaseAdmin
              .from('email_onboarding_logs')
              .insert({ user_id: userId, email_day: 0, recipient_email: email })
              .then(() => {})
              .catch(() => {});
          }
        })
        .catch((e) => console.warn('[start-trial] Email day-0 error:', e?.message));
    }

    // Fire-and-forget: WhatsApp — needs perfil.contato (phone number)
    supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, contato')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data: perfil }) => {
        if (!perfil?.contato) return;
        enviarBoasVindas(perfil.contato, perfil.nome_exibicao || '')
          .then((sent) => {
            if (sent) {
              supabaseAdmin
                .from('subscriptions')
                .update({ whatsapp_onboarding_sent_at: new Date().toISOString() })
                .eq('user_id', userId)
                .then(() => {})
                .catch(() => {});
            }
          })
          .catch((e) => console.warn('[start-trial] WhatsApp error:', e?.message));
      })
      .catch((e) => console.warn('[start-trial] perfil fetch error:', e?.message));

    return json({ success: true, trialEnd: trialEnd.toISOString() });

  } catch (err) {
    console.error('[start-trial] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao iniciar período de teste' }, { status: 500 });
  }
}
