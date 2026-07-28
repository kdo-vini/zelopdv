import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { isAbacatePayConfigured } from '$lib/server/abacatePay';
import { sendWhatsAppTextDetailed } from '$lib/server/whatsapp';
import {
  createOrReusePixCharge,
  serializePixCharge,
  validatePixCustomerProfile,
  buildRenewalPixWhatsAppMessage,
} from '$lib/server/billingPix';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500, headers: cors });
    }
    if (!isAbacatePayConfigured()) {
      return json({ error: 'AbacatePay não configurado.' }, { status: 500, headers: cors });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: admin } = await supabaseAdmin
      .from('super_admins')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!admin) return json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers: cors });

    const body = await request.json().catch(() => ({}));
    const targetUserId = body.userId;

    if (!targetUserId) {
      return json({ error: 'userId obrigatório.' }, { status: 400, headers: cors });
    }

    // Load profile (needed in both normal and resend flows)
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (perfilError) {
      return json({ error: 'Erro ao carregar perfil da empresa.' }, { status: 500, headers: cors });
    }

    const profileValidation = validatePixCustomerProfile(perfil);
    if (!profileValidation.ok) {
      return json({ error: profileValidation.message }, { status: 400, headers: cors });
    }

    // --- Resend-only flow: skip charge creation, just resend WhatsApp ---
    if (body.resendOnly) {
      const { data: latestPayment } = await supabaseAdmin
        .from('billing_payments')
        .select('id, br_code, amount_expected_cents, plan_tier, provider, method, status')
        .eq('user_id', targetUserId)
        .eq('provider', 'abacatepay')
        .eq('method', 'pix')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestPayment?.br_code) {
        return json({ error: 'Nenhum PIX pendente encontrado para reenvio.' }, { status: 400, headers: cors });
      }

      let whatsappSent = false;
      let whatsappError = null;
      try {
        const { message1, message2 } = buildRenewalPixWhatsAppMessage({
          nome: profileValidation.name,
          planName: 'ZeloPDV',
          amountCents: latestPayment.amount_expected_cents,
          brCode: latestPayment.br_code,
        });
        const result1 = await sendWhatsAppTextDetailed(profileValidation.phone, message1);
        if (result1.ok) {
          const result2 = await sendWhatsAppTextDetailed(profileValidation.phone, message2);
          whatsappSent = result2.ok;
          if (!result2.ok) {
            whatsappError = result2.error || 'Falha ao enviar código PIX';
          }
        } else {
          whatsappSent = false;
          whatsappError = result1.error || 'Falha ao enviar WhatsApp';
        }
      } catch (waErr) {
        whatsappError = waErr?.message || 'Erro ao disparar WhatsApp';
      }

      return json({
        success: true,
        reused: false,
        whatsappSent,
        ...(whatsappError ? { whatsappError } : {}),
        payment: serializePixCharge(latestPayment),
      }, { headers: cors });
    }

    // --- Normal flow: create/reuse charge + send WhatsApp ---
    // Load subscription to derive current plan
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, plan_tier, has_mesas_addon, has_acessos_addon, has_zelo_menu, payment_provider')
      .eq('user_id', targetUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return json({ error: 'Usuário não possui assinatura.' }, { status: 400, headers: cors });
    }

    const planTier = body.planTier || subscription.plan_tier;
    const addons = {
      mesas: body.addons?.mesas ?? !!subscription.has_mesas_addon,
      acessos: body.addons?.acessos ?? !!subscription.has_acessos_addon,
      menu: body.addons?.menu ?? !!subscription.has_zelo_menu,
    };

    const { reused, row: paymentRow } = await createOrReusePixCharge({
      userId: targetUserId,
      email: body.email || `${targetUserId}@zelopdv.com.br`,
      planTier,
      addons,
      name: profileValidation.name,
      taxId: profileValidation.taxId,
      phone: profileValidation.phone,
      source: 'admin_renewal_pix',
      metadataExtra: { adminId: admin.id },
    });

    // Send WhatsApp with PIX details (fire-and-forget, 2 messages)
    let whatsappSent = false;
    let whatsappError = null;
    if (paymentRow.br_code) {
      try {
        const planName = subscription.plan_tier || planTier;
        const { message1, message2 } = buildRenewalPixWhatsAppMessage({
          nome: profileValidation.name,
          planName: planName.charAt(0).toUpperCase() + planName.slice(1),
          amountCents: paymentRow.amount_expected_cents,
          brCode: paymentRow.br_code,
        });
        const result1 = await sendWhatsAppTextDetailed(profileValidation.phone, message1);
        if (result1.ok) {
          const result2 = await sendWhatsAppTextDetailed(profileValidation.phone, message2);
          whatsappSent = result2.ok;
          if (!result2.ok) {
            whatsappError = result2.error || 'Falha ao enviar código PIX';
          }
        } else {
          whatsappSent = false;
          whatsappError = result1.error || 'Falha ao enviar WhatsApp';
        }
      } catch (waErr) {
        whatsappError = waErr?.message || 'Erro ao disparar WhatsApp';
        console.error('[admin/pix/create] WhatsApp send error:', whatsappError);
      }
    }

    return json({
      success: true,
      reused,
      whatsappSent,
      ...(whatsappError ? { whatsappError } : {}),
      payment: serializePixCharge(paymentRow),
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/billing/pix/create] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao gerar PIX de renovação.' }, { status: 500, headers: cors });
  }
}
