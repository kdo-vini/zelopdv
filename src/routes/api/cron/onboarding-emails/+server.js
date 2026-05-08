/**
 * GET /api/cron/onboarding-emails
 *
 * Daily cron job that sends onboarding emails to trialing users.
 * Protected by CRON_SECRET via Authorization: Bearer <secret>.
 *
 * Vercel automatically injects the CRON_SECRET env var as a Bearer token
 * when calling cron jobs — configure it in your Vercel project settings.
 *
 * Schedule: 0 6 * * * (6am UTC = 3am BRT) — defined in vercel.json
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
 *   See .ai/migrations/whatsapp_onboarding_logs.sql
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { EMAIL_SEQUENCE, EMAIL_DAYS } from '$lib/server/emailTemplates';
import {
  enviarFollowup28d,
  isWhatsAppConfigured,
} from '$lib/server/whatsapp';

const WHATSAPP_SEQUENCE = new Map([
  [28, enviarFollowup28d],
]);
const WHATSAPP_DAYS = [28];

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
    .select('user_id, created_at, current_period_end')
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

  let whatsappLogAvailable = isWhatsAppConfigured();
  let whatsappSentSet = new Set();

  if (whatsappLogAvailable) {
    const { data: alreadySentWhatsApp, error: whatsappLogsErr } = await supabaseAdmin
      .from('whatsapp_onboarding_logs')
      .select('user_id, message_day')
      .in('user_id', userIds);

    if (whatsappLogsErr) {
      whatsappLogAvailable = false;
      console.warn(
        '[onboarding-emails] WhatsApp logs indisponiveis; pulando follow-ups de WhatsApp:',
        whatsappLogsErr.message
      );
    } else {
      whatsappSentSet = new Set(
        (alreadySentWhatsApp || []).map((r) => `${r.user_id}:${r.message_day}`)
      );
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
      } else {
        results.errors++;
        results.details.push({ user_id, emailDay, to: userEmail, error: 'send failed' });
      }
      }
    }

    if (!whatsappLogAvailable) continue;

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

      const sent = await sendWhatsApp(telefone, nome);

      if (sent) {
        const { error: insertErr } = await supabaseAdmin
          .from('whatsapp_onboarding_logs')
          .insert({
            user_id,
            message_day: messageDay,
            recipient_phone: telefone,
          });

        if (insertErr && !insertErr.message.includes('duplicate')) {
          console.error('[onboarding-emails] Erro ao salvar log de WhatsApp:', insertErr.message);
        }

        whatsappSentSet.add(`${user_id}:${messageDay}`);
        results.whatsappSent++;
        results.whatsappDetails.push({ user_id, messageDay });
      } else {
        results.whatsappErrors++;
        results.whatsappDetails.push({ user_id, messageDay, error: 'send failed' });
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
