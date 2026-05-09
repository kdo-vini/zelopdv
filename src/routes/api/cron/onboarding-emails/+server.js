/**
 * GET /api/cron/onboarding-emails
 *
 * Daily cron job that sends onboarding emails to trialing users.
 * Protected by CRON_SECRET via Authorization: Bearer <secret>.
 *
 * Vercel automatically injects the CRON_SECRET env var as a Bearer token
 * when calling cron jobs — configure it in your Vercel project settings.
 *
 * Schedule: 0 9 * * * (9am UTC = 6am BRT) — defined in vercel.json
 *
 * Required env vars:
 *   CRON_SECRET         — shared secret for endpoint protection
 *   RESEND_API_KEY      — Resend API key
 *   RESEND_FROM_EMAIL   — Sender address, e.g. "Vinicius - Zelo PDV <vinicius@zelopdv.com.br>"
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (bypasses RLS)
 *
 * Required tables (run migrations in Supabase SQL editor):
 *   See .ai/migrations/email_onboarding_logs.sql
 *   subscriptions WhatsApp sent_at columns
 *   onboarding_communication_events
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { EMAIL_SEQUENCE, EMAIL_DAYS } from '$lib/server/emailTemplates';
import {
  enviarBoasVindas,
  enviarFollowup7d,
  enviarFollowup28d,
  isWhatsAppConfigured,
} from '$lib/server/whatsapp';
import { logOnboardingCommunication } from '$lib/server/onboardingEvents';

const WHATSAPP_SEQUENCE = new Map([
  [0, enviarBoasVindas],
  [7, enviarFollowup7d],
  [28, enviarFollowup28d],
]);
const WHATSAPP_DAYS = [0, 7, 28];

export async function GET({ request }) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!supabaseAdmin) {
    return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  if (!isEmailConfigured()) {
    console.warn('[onboarding-emails] RESEND_API_KEY ou RESEND_FROM_EMAIL não configurado. Abortando.');
    return json({ error: 'Email não configurado.' }, { status: 500 });
  }

  const now = new Date();
  const results = {
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
    whatsappSent: 0,
    whatsappSkipped: 0,
    whatsappErrors: 0,
    whatsappDetails: [],
  };

  // ── 1. Fetch all active trials ────────────────────────────────────────────
  const { data: trials, error: trialsErr } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'user_id, created_at, current_period_end, whatsapp_onboarding_sent_at, whatsapp_followup_7d_sent_at, whatsapp_followup_28d_sent_at'
    )
    .eq('status', 'trialing')
    .gt('current_period_end', now.toISOString());

  if (trialsErr) {
    console.error('[onboarding-emails] Erro ao buscar trials:', trialsErr.message);
    return json({ error: trialsErr.message }, { status: 500 });
  }

  if (!trials?.length) {
    return json({ message: 'Nenhum trial ativo encontrado.', ...results });
  }

  const userIds = trials.map((t) => t.user_id);

  // ── 2. Fetch already-sent emails (batch) ──────────────────────────────────
  const { data: alreadySent, error: logsErr } = await supabaseAdmin
    .from('email_onboarding_logs')
    .select('user_id, email_day')
    .in('user_id', userIds);

  if (logsErr) {
    console.error('[onboarding-emails] Erro ao buscar logs:', logsErr.message);
    return json({ error: logsErr.message }, { status: 500 });
  }

  /** @type {Set<string>} user_id:email_day */
  const sentSet = new Set((alreadySent || []).map((r) => `${r.user_id}:${r.email_day}`));

  const whatsappAvailable = isWhatsAppConfigured();
  let whatsappSentSet = new Set();

  if (whatsappAvailable) {
    for (const trial of trials) {
      if (trial.whatsapp_onboarding_sent_at) whatsappSentSet.add(`${trial.user_id}:0`);
      if (trial.whatsapp_followup_7d_sent_at) whatsappSentSet.add(`${trial.user_id}:7`);
      if (trial.whatsapp_followup_28d_sent_at) whatsappSentSet.add(`${trial.user_id}:28`);
    }
  }

  // ── 3. Fetch user profiles (nome + email) ─────────────────────────────────
  const { data: profiles } = await supabaseAdmin
    .from('empresa_perfil')
    .select('user_id, nome_exibicao, contato')
    .in('user_id', userIds);

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

  // ── 4. Process each trial ─────────────────────────────────────────────────
  for (const trial of trials) {
    const { user_id, created_at } = trial;

    // Calculate how many full days have elapsed since trial start
    const daysSince = Math.floor(
      (now.getTime() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fetch user email from auth (only once per user)
    let userEmail = null;
    try {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(user_id);
      userEmail = user?.email ?? null;
    } catch {
      // ignore individual errors
    }

    if (!userEmail) {
      results.skipped++;
      results.details.push({ user_id, reason: 'email not found', daysSince });
    }

    const profile = profileMap[user_id] || {};
    const nome = profile.nome_exibicao || '';
    const telefone = profile.contato || '';

    // Find all email days that should be sent but haven't been yet
    if (userEmail) {
      for (const emailDay of EMAIL_DAYS) {
      if (daysSince < emailDay) continue; // not yet time
      if (sentSet.has(`${user_id}:${emailDay}`)) continue; // already sent

      const templateFn = EMAIL_SEQUENCE.get(emailDay);
      if (!templateFn) continue;

      const { subject, html } = templateFn(nome);

      await logOnboardingCommunication({
        userId: user_id,
        channel: 'email',
        messageDay: emailDay,
        status: 'attempted',
        recipient: userEmail,
        provider: 'resend',
        metadata: { source: 'cron', subject },
      });
      const sent = await sendEmail({ to: userEmail, subject, html });

      if (sent) {
        // Record send — UNIQUE(user_id, email_day) prevents duplicates at DB level too
        const { error: insertErr } = await supabaseAdmin
          .from('email_onboarding_logs')
          .insert({
            user_id,
            email_day: emailDay,
            recipient_email: userEmail,
          });

        if (insertErr && !insertErr.message.includes('duplicate')) {
          console.error('[onboarding-emails] Erro ao salvar log:', insertErr.message);
        }

        // Add to in-memory set so we don't try to send it again this run
        sentSet.add(`${user_id}:${emailDay}`);

        results.sent++;
        results.details.push({ user_id, emailDay, to: userEmail });
        await logOnboardingCommunication({
          userId: user_id,
          channel: 'email',
          messageDay: emailDay,
          status: 'sent',
          recipient: userEmail,
          provider: 'resend',
          metadata: { source: 'cron', subject },
        });
      } else {
        results.errors++;
        results.details.push({ user_id, emailDay, to: userEmail, error: 'send failed' });
        await logOnboardingCommunication({
          userId: user_id,
          channel: 'email',
          messageDay: emailDay,
          status: 'failed',
          recipient: userEmail,
          provider: 'resend',
          error: 'sendEmail returned false',
          metadata: { source: 'cron', subject },
        });
      }
      }
    }

    if (!whatsappAvailable) continue;

    if (!telefone) {
      results.whatsappSkipped++;
      results.whatsappDetails.push({ user_id, reason: 'phone not found', daysSince });
      continue;
    }

    for (const messageDay of WHATSAPP_DAYS) {
      if (daysSince < messageDay) continue;
      if (whatsappSentSet.has(`${user_id}:${messageDay}`)) continue;

      const sendWhatsApp = WHATSAPP_SEQUENCE.get(messageDay);
      if (!sendWhatsApp) continue;

      await logOnboardingCommunication({
        userId: user_id,
        channel: 'whatsapp',
        messageDay,
        status: 'attempted',
        recipient: telefone,
        provider: 'zelochat',
        metadata: { source: 'cron' },
      });
      const sent = await sendWhatsApp(telefone, nome);

      if (sent) {
        whatsappSentSet.add(`${user_id}:${messageDay}`);
        const sentField = {
          0: 'whatsapp_onboarding_sent_at',
          7: 'whatsapp_followup_7d_sent_at',
          28: 'whatsapp_followup_28d_sent_at',
        }[messageDay];
        if (sentField) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ [sentField]: new Date().toISOString() })
            .eq('user_id', user_id);
        }
        results.whatsappSent++;
        results.whatsappDetails.push({ user_id, messageDay });
        await logOnboardingCommunication({
          userId: user_id,
          channel: 'whatsapp',
          messageDay,
          status: 'sent',
          recipient: telefone,
          provider: 'zelochat',
          metadata: { source: 'cron' },
        });
      } else {
        results.whatsappErrors++;
        results.whatsappDetails.push({ user_id, messageDay, error: 'send failed' });
        await logOnboardingCommunication({
          userId: user_id,
          channel: 'whatsapp',
          messageDay,
          status: 'failed',
          recipient: telefone,
          provider: 'zelochat',
          error: 'WhatsApp sender returned false',
          metadata: { source: 'cron' },
        });
      }
    }
  }

  console.log(
    `[onboarding-emails] Concluído. Enviados: ${results.sent}, Ignorados: ${results.skipped}, Erros: ${results.errors}`
  );

  return json({
    ok: true,
    trialsProcessed: trials.length,
    ...results,
  });
}
