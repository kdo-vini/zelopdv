import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { enviarBoasVindas } from '$lib/server/whatsapp';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { emailDay0 } from '$lib/server/emailTemplates';
import { logOnboardingCommunication } from '$lib/server/onboardingEvents';

async function fetchPerfil(userId) {
  const { data: perfil, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('nome_exibicao, contato')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[start-trial] perfil fetch error:', error.message);
    return null;
  }

  return perfil;
}

async function touchLastSeen(userId, nowIso) {
  const { error } = await supabaseAdmin
    .from('empresa_perfil')
    .update({ last_seen_at: nowIso })
    .eq('user_id', userId);

  if (error) {
    console.warn('[start-trial] last_seen_at:', error.message);
  }
}

async function maybeSendDay0Email({ userId, email, nomeLoja }) {
  if (!email) {
    await logOnboardingCommunication({
      userId,
      channel: 'email',
      messageDay: 0,
      status: 'skipped',
      provider: 'resend',
      error: 'missing recipient email',
    });
    return false;
  }

  if (!isEmailConfigured()) {
    await logOnboardingCommunication({
      userId,
      channel: 'email',
      messageDay: 0,
      status: 'failed',
      recipient: email,
      provider: 'resend',
      error: 'RESEND_API_KEY or RESEND_FROM_EMAIL not configured',
    });
    return false;
  }

  const { data: alreadySent, error: logErr } = await supabaseAdmin
    .from('email_onboarding_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('email_day', 0)
    .maybeSingle();

  if (logErr) {
    console.warn('[start-trial] Email log check error:', logErr.message);
  }

  if (alreadySent) return true;

  const { subject, html } = emailDay0(nomeLoja || '');
  await logOnboardingCommunication({
    userId,
    channel: 'email',
    messageDay: 0,
    status: 'attempted',
    recipient: email,
    provider: 'resend',
    metadata: { subject },
  });
  const sent = await sendEmail({ to: email, subject, html });

  if (!sent) {
    await logOnboardingCommunication({
      userId,
      channel: 'email',
      messageDay: 0,
      status: 'failed',
      recipient: email,
      provider: 'resend',
      error: 'sendEmail returned false',
      metadata: { subject },
    });
    return false;
  }

  const { error: insertErr } = await supabaseAdmin
    .from('email_onboarding_logs')
    .insert({ user_id: userId, email_day: 0, recipient_email: email });

  if (insertErr && !insertErr.message?.includes('duplicate')) {
    console.warn('[start-trial] Email log insert error:', insertErr.message);
  }

  await logOnboardingCommunication({
    userId,
    channel: 'email',
    messageDay: 0,
    status: 'sent',
    recipient: email,
    provider: 'resend',
    metadata: { subject },
  });

  return true;
}

async function maybeSendWelcomeWhatsApp({ userId, perfil }) {
  if (!perfil?.contato) {
    await logOnboardingCommunication({
      userId,
      channel: 'whatsapp',
      messageDay: 0,
      status: 'skipped',
      provider: 'techneia',
      error: 'missing profile contact',
    });
    return false;
  }

  await logOnboardingCommunication({
    userId,
    channel: 'whatsapp',
    messageDay: 0,
    status: 'attempted',
    recipient: perfil.contato,
    provider: 'techneia',
  });
  const sent = await enviarBoasVindas(perfil.contato, perfil.nome_exibicao || '');

  if (!sent) {
    await logOnboardingCommunication({
      userId,
      channel: 'whatsapp',
      messageDay: 0,
      status: 'failed',
      recipient: perfil.contato,
      provider: 'techneia',
      error: 'enviarBoasVindas returned false',
    });
    return false;
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ whatsapp_onboarding_sent_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    console.warn('[start-trial] WhatsApp sent_at update error:', error.message);
  }

  await logOnboardingCommunication({
    userId,
    channel: 'whatsapp',
    messageDay: 0,
    status: 'sent',
    recipient: perfil.contato,
    provider: 'techneia',
  });

  return true;
}

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;
    const email = user.email;

    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, current_period_end, whatsapp_onboarding_sent_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSub) {
      const perfil = await fetchPerfil(userId);
      const emailDay0Sent = await maybeSendDay0Email({
        userId,
        email,
        nomeLoja: perfil?.nome_exibicao || '',
      });
      let whatsappDay0Sent = Boolean(existingSub.whatsapp_onboarding_sent_at);
      if (!existingSub.whatsapp_onboarding_sent_at) {
        whatsappDay0Sent = await maybeSendWelcomeWhatsApp({
          userId,
          perfil,
        });
      }

      return json({
        success: true,
        trialEnd: existingSub.current_period_end,
        alreadyExists: true,
        onboarding: {
          emailDay0Sent,
          whatsappDay0Sent,
        },
      });
    }

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
        payment_provider: null,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertError) {
      console.error('[start-trial] DB insert failed:', insertError);
      return json({ error: 'Erro ao ativar período de teste. Tente novamente.' }, { status: 500 });
    }

    const perfil = await fetchPerfil(userId);
    const sideEffects = await Promise.allSettled([
      touchLastSeen(userId, nowIso),
      maybeSendDay0Email({
        userId,
        email,
        nomeLoja: perfil?.nome_exibicao || '',
      }),
      maybeSendWelcomeWhatsApp({
        userId,
        perfil,
      }),
    ]);

    for (const result of sideEffects) {
      if (result.status === 'rejected') {
        console.warn('[start-trial] Side effect rejected:', result.reason?.message || result.reason);
      }
    }

    return json({
      success: true,
      trialEnd: trialEnd.toISOString(),
      onboarding: {
        emailDay0Sent: sideEffects[1]?.status === 'fulfilled' && sideEffects[1].value === true,
        whatsappDay0Sent: sideEffects[2]?.status === 'fulfilled' && sideEffects[2].value === true,
      },
    });

  } catch (err) {
    console.error('[start-trial] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao iniciar período de teste' }, { status: 500 });
  }
}
