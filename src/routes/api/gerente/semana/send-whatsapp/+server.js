/**
 * POST /api/gerente/semana/send-whatsapp
 *
 * Dispara o resumo semanal para o WhatsApp do dono via ZeloChat
 * (número do ZeloPDV / Zelinho), sem abrir wa.me no cliente.
 */
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { getLink, maskPhone } from '$lib/server/gerente/phoneLinks';
import { sendWhatsAppTextDetailed, isWhatsAppConfigured, getWhatsAppSendError } from '$lib/server/whatsapp';
import { normalizeBrazilianPhone } from '$lib/masks';
import { buildWeekReport, buildWeekWhatsAppText, normalizeWeekStart } from '$lib/gerente/weekReport.js';

export async function POST({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) return json({ error: 'Configuração do servidor ausente.' }, { status: 500 });
  if (!isWhatsAppConfigured()) {
    return json({ error: 'Envio por WhatsApp indisponível no momento.', code: 'WHATSAPP_UNAVAILABLE' }, { status: 503 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const weekStart = normalizeWeekStart(body?.semana);

  const link = await getLink(supabaseAdmin, auth.ownerUserId);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('empresa_perfil')
    .select('nome_exibicao, razao_social, contato')
    .eq('user_id', auth.ownerUserId)
    .maybeSingle();
  if (profileError) return json({ error: 'Não foi possível carregar o perfil.' }, { status: 500 });

  const phone = link?.phone_normalized || normalizeBrazilianPhone(profile?.contato);
  if (!phone) {
    return json({
      error: 'Conecte o WhatsApp do Zelinho nas Preferências ou informe o telefone da empresa.',
      code: 'NEED_PHONE',
    }, { status: 400 });
  }

  const [{ data: snapshots, error: snapshotsError }, { data: signals, error: signalsError }] = await Promise.all([
    supabaseAdmin
      .from('business_daily_snapshots')
      .select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics')
      .eq('user_id', auth.ownerUserId)
      .order('snapshot_date', { ascending: false })
      .limit(70),
    supabaseAdmin
      .from('business_signals')
      .select('id, signal_date, type, severity, narrative')
      .eq('user_id', auth.ownerUserId)
      .order('signal_date', { ascending: false })
      .limit(200),
  ]);
  if (snapshotsError || signalsError) {
    return json({ error: 'Não foi possível montar o resumo semanal.' }, { status: 500 });
  }

  const report = buildWeekReport(snapshots || [], signals || [], weekStart);
  const businessName = profile?.nome_exibicao || profile?.razao_social || 'seu negócio';
  const message = buildWeekWhatsAppText(report, { businessName });
  const result = await sendWhatsAppTextDetailed(phone, message);
  if (!result.ok) {
    return json({ error: getWhatsAppSendError(result) || 'Não foi possível enviar o resumo.' }, { status: 502 });
  }

  return json({
    ok: true,
    week_start: report.weekStart,
    phone_masked: maskPhone(phone),
  });
}
