/**
 * GET /api/cron/nudge-incomplete-registration
 *
 * Cron job that finds users who signed up more than 2 hours ago but never
 * completed onboarding (no empresa_perfil row), and sends them a single
 * nudge email to finish their registration.
 *
 * Deduplication is handled via the `registration_nudges` table — each user
 * only ever receives one nudge.
 *
 * Protected by CRON_SECRET via Authorization: Bearer <secret>.
 * Vercel automatically injects the CRON_SECRET env var as a Bearer token
 * when calling cron jobs — configure it in your Vercel project settings.
 *
 * Required env vars:
 *   CRON_SECRET                   — shared secret for endpoint protection
 *   RESEND_API_KEY                — Resend API key
 *   RESEND_FROM_EMAIL             — Sender address
 *   SUPABASE_URL                  — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — Supabase service role key (bypasses RLS)
 *
 * Required DB objects (created via migration):
 *   public.registration_nudges    — deduplication table
 *   admin_get_users_without_profile(min_age_hours) — RPC
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { emailNudgeCompleteProfile } from '$lib/server/emailTemplates';
import { logOnboardingCommunication } from '$lib/server/onboardingEvents';

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
    console.warn('[nudge-incomplete-registration] RESEND_API_KEY ou RESEND_FROM_EMAIL não configurado. Abortando.');
    return json({ error: 'Email não configurado.' }, { status: 500 });
  }

  const results = { sent: 0, skipped: 0, errors: 0 };

  // ── 1. Find users without a profile (signed up > 2 hours ago) ────────────
  const { data: users, error: rpcErr } = await supabaseAdmin
    .rpc('admin_get_users_without_profile', { min_age_hours: 2 });

  if (rpcErr) {
    console.error('[nudge-incomplete-registration] Erro ao buscar usuários sem perfil:', rpcErr.message);
    return json({ error: rpcErr.message }, { status: 500 });
  }

  if (!users?.length) {
    console.log('[nudge-incomplete-registration] Nenhum usuário sem perfil encontrado.');
    return json({ message: 'Nenhum usuário sem perfil encontrado.', ...results });
  }

  const userIds = users.map((u) => u.user_id);

  // ── 2. Fetch already-nudged users (batch) ────────────────────────────────
  const { data: alreadyNudged, error: nudgesErr } = await supabaseAdmin
    .from('registration_nudges')
    .select('user_id')
    .in('user_id', userIds);

  if (nudgesErr) {
    console.error('[nudge-incomplete-registration] Erro ao buscar nudges enviados:', nudgesErr.message);
    return json({ error: nudgesErr.message }, { status: 500 });
  }

  const nudgedSet = new Set((alreadyNudged || []).map((r) => r.user_id));

  // ── 3. Process each user ──────────────────────────────────────────────────
  for (const user of users) {
    const { user_id, email } = user;

    // Skip if nudge was already sent
    if (nudgedSet.has(user_id)) {
      results.skipped++;
      continue;
    }

    const { subject, html } = emailNudgeCompleteProfile(email);

    await logOnboardingCommunication({
      userId: user_id,
      channel: 'email',
      messageDay: -1, // sentinel: pre-onboarding nudge
      status: 'attempted',
      recipient: email,
      provider: 'resend',
      metadata: { source: 'cron', subject, type: 'registration_nudge' },
    });

    const sent = await sendEmail({ to: email, subject, html });

    if (sent) {
      // Insert into deduplication table
      const { error: insertErr } = await supabaseAdmin
        .from('registration_nudges')
        .insert({ user_id, email });

      if (insertErr && !insertErr.message.includes('duplicate')) {
        console.error('[nudge-incomplete-registration] Erro ao salvar nudge:', insertErr.message);
      }

      nudgedSet.add(user_id);
      results.sent++;

      await logOnboardingCommunication({
        userId: user_id,
        channel: 'email',
        messageDay: -1,
        status: 'sent',
        recipient: email,
        provider: 'resend',
        metadata: { source: 'cron', subject, type: 'registration_nudge' },
      });
    } else {
      results.errors++;

      await logOnboardingCommunication({
        userId: user_id,
        channel: 'email',
        messageDay: -1,
        status: 'failed',
        recipient: email,
        provider: 'resend',
        error: 'sendEmail returned false',
        metadata: { source: 'cron', subject, type: 'registration_nudge' },
      });
    }
  }

  console.log(
    `[nudge-incomplete-registration] Concluído. Enviados: ${results.sent}, Ignorados: ${results.skipped}, Erros: ${results.errors}`
  );

  return json({ ok: true, usersProcessed: users.length, ...results });
}
