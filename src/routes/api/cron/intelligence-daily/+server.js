/**
 * GET /api/cron/intelligence-daily
 *
 * Zelo Intelligence Engine — cron diário de processamento de métricas e sinais.
 * Executa para todas as empresas com intelligence_enabled_at preenchido.
 *
 * Schedule: 4 3 * * * (03:04 BRT = 06:04 UTC) — defined in vercel.json
 *
 * Required env vars:
 *   CRON_SECRET — shared secret for endpoint protection
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INTELLIGENCE_ENGINE_ENABLED — kill switch global; qualquer valor != 'true' desliga o engine
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { safeEqualString } from '$lib/server/safeEqual';
import { runDaily } from '$lib/server/intelligence/engine.js';

export const config = {
  maxDuration: 300,
};

const TARGET_OFFSET_DAYS = 1; // D-1: processa o dia anterior

export async function GET({ request, fetch }) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || !safeEqualString(authHeader, `Bearer ${cronSecret}`)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Kill switch global: permite desligar o engine em incidente sem deploy
  // e sem zerar a flag por empresa. Default OFF (rollout controlado).
  if ((env.INTELLIGENCE_ENGINE_ENABLED || '').toLowerCase() !== 'true') {
    console.log('[intelligence-cron] INTELLIGENCE_ENGINE_ENABLED != true — pulando execução.');
    return json({ ok: true, skipped: true, reason: 'engine disabled via INTELLIGENCE_ENGINE_ENABLED' });
  }

  if (!supabaseAdmin) {
    return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  // ── Data alvo (D-1 em America/Sao_Paulo) ──────────────────────────────
  const now = new Date();
  const spFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayLocal = spFormatter.format(now);

  const [y, m, d] = todayLocal.split('-').map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d - TARGET_OFFSET_DAYS, 12, 0, 0));
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  console.log(`[intelligence-cron] Iniciando para data-alvo ${targetDateStr}`);

  try {
    const result = await runDaily(supabaseAdmin, targetDateStr);
    let digest = null;
    try {
      const notifyResponse = await fetch(new URL('/api/cron/intelligence-notify', request.url), {
        headers: { authorization: authHeader, 'x-intelligence-daily': '1' },
      });
      digest = await notifyResponse.json();
    } catch (notifyError) {
      console.error('[intelligence-cron] Erro ao enviar digest:', notifyError.message);
    }
    return json({
      ok: true,
      target_date: targetDateStr,
      ...result,
      digest,
    });
  } catch (err) {
    console.error('[intelligence-cron] Erro fatal:', err.message);
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}
