/**
 * GET /api/cron/intelligence-notify
 *
 * Sends one opted-in Zelinho daily digest per company. The engine remains the
 * source of truth: this route only reads persisted snapshots/signals.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { safeEqualString } from '$lib/server/safeEqual';
import { sendWhatsAppTextDetailed, isWhatsAppConfigured, getWhatsAppSendError } from '$lib/server/whatsapp';
import { normalizeBrazilianPhone } from '$lib/masks';
import { buildDailyDigestText, isDigestDue } from '$lib/server/intelligence/digest.js';

export const config = { maxDuration: 300 };

function brtNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: values.hour };
}

function readPrefs(profile) {
  const prefs = profile.gerente_prefs && typeof profile.gerente_prefs === 'object' ? profile.gerente_prefs : {};
  const whatsapp = prefs.whatsapp && typeof prefs.whatsapp === 'object' ? prefs.whatsapp : {};
  return { enabled: whatsapp.enabled === true, hour: String(whatsapp.hora || ''), mutedTypes: Array.isArray(prefs.muted_types) ? prefs.muted_types : [] };
}

export async function GET({ request }) {
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || !safeEqualString(request.headers.get('authorization'), `Bearer ${cronSecret}`)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if ((env.INTELLIGENCE_ENGINE_ENABLED || '').toLowerCase() !== 'true') {
    return json({ ok: true, skipped: true, reason: 'engine disabled via INTELLIGENCE_ENGINE_ENABLED' });
  }
  if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  if (!isWhatsAppConfigured()) return json({ ok: true, skipped: true, reason: 'whatsapp not configured' });

  const { date: today, hour } = brtNow();
  const { data: profiles, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('user_id, nome_exibicao, razao_social, contato, gerente_prefs, gerente_whatsapp_last_sent_date, intelligence_enabled_at')
    .not('intelligence_enabled_at', 'is', null);
  if (error) return json({ error: error.message }, { status: 500 });

  const results = { sent: 0, skipped: 0, errors: 0, details: [] };
  for (const profile of profiles || []) {
    const prefs = readPrefs(profile);
    if (!prefs.enabled || prefs.hour !== hour || !isDigestDue(profile.gerente_whatsapp_last_sent_date, today)) {
      results.skipped++;
      continue;
    }
    const phone = normalizeBrazilianPhone(profile.contato);
    if (!phone) {
      results.errors++;
      results.details.push({ user_id: profile.user_id, error: 'telefone inválido' });
      continue;
    }

    try {
      const [{ data: snapshot, error: snapshotError }, { data: signals, error: signalsError }] = await Promise.all([
        supabaseAdmin.from('business_daily_snapshots').select('snapshot_date, receita_bruta, qtd_vendas, ticket_medio').eq('user_id', profile.user_id).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from('business_signals').select('type, severity, evidence, narrative, signal_date').eq('user_id', profile.user_id).order('signal_date', { ascending: false }).limit(3),
      ]);
      if (snapshotError) throw snapshotError;
      if (signalsError) throw signalsError;
      if (!snapshot) {
        results.skipped++;
        results.details.push({ user_id: profile.user_id, skipped: 'sem snapshot' });
        continue;
      }
      const dailySignals = (signals || []).filter((signal) => signal.signal_date === snapshot.snapshot_date);
      const message = buildDailyDigestText(dailySignals, snapshot, profile, { mutedTypes: prefs.mutedTypes });
      // Claim before sending: overlapping cron executions cannot deliver the same
      // digest twice. A provider failure releases the claim below for a retry.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('empresa_perfil')
        .update({ gerente_whatsapp_last_sent_date: today })
        .eq('user_id', profile.user_id)
        .or(`gerente_whatsapp_last_sent_date.is.null,gerente_whatsapp_last_sent_date.lt.${today}`)
        .select('user_id');
      if (claimError) throw claimError;
      if (!claimed?.length) {
        results.skipped++;
        results.details.push({ user_id: profile.user_id, skipped: 'já enviado por outra execução' });
        continue;
      }
      const result = await sendWhatsAppTextDetailed(phone, message);
      if (!result.ok) {
        await supabaseAdmin
          .from('empresa_perfil')
          .update({ gerente_whatsapp_last_sent_date: null })
          .eq('user_id', profile.user_id)
          .eq('gerente_whatsapp_last_sent_date', today);
        throw new Error(getWhatsAppSendError(result));
      }
      results.sent++;
    } catch (sendError) {
      results.errors++;
      results.details.push({ user_id: profile.user_id, error: sendError?.message || 'erro ao enviar' });
      console.error('[intelligence-notify] Falha para', profile.user_id, sendError);
    }
  }
  return json({ ok: true, date: today, hour, ...results });
}
