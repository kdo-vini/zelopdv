import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { createTransparentPixCharge, isAbacatePayConfigured } from '$lib/server/abacatePay';
import {
  isValidBrazilianTaxId,
  normalizeBrazilianPhone,
  normalizeBrazilianTaxId,
} from '$lib/masks';
import {
  calculateValue,
  isValidPlanTier,
  isAddonAllowed,
  PLANS,
  sanitizeAddons,
} from '$lib/pricing';

const PIX_EXPIRATION_SECONDS = 60 * 60;

function buildPixDescription(planTier) {
  const base = `Assinatura ${PLANS[planTier]?.name || 'Zelo'}`;
  return base.slice(0, 37);
}

function serializePendingPayment(row) {
  return {
    paymentId: row.id,
    status: row.status,
    amountCents: row.amount_expected_cents,
    brCode: row.br_code,
    qrCodeBase64: row.qr_code_base64,
    expiresAt: row.expires_at,
    providerPaymentId: row.provider_payment_id,
    planTier: row.plan_tier,
    addons: {
      mesas: !!row.has_mesas_addon,
      pedidos: !!row.has_pedidos_addon,
      acessos: !!row.has_acessos_addon,
    },
  };
}

function pendingPaymentMatchesSelection(payment, planTier, addons, amountCents) {
  return payment?.plan_tier === planTier
    && !!payment?.has_mesas_addon === !!addons.mesas
    && !!payment?.has_pedidos_addon === !!addons.pedidos
    && !!payment?.has_acessos_addon === !!addons.acessos
    && Number(payment?.amount_expected_cents) === Number(amountCents);
}

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    }
    if (!isAbacatePayConfigured()) {
      return json({ error: 'AbacatePay não configurado.' }, { status: 500 });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const accessContext = await getServerAccessContext(user.id);
    if (accessContext.isSubUser) {
      return json({ error: 'Subusuários não podem gerenciar billing.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const planTier = body.planTier || 'pdv';
    const requestedAddons = body.addons || {};

    if (!isValidPlanTier(planTier)) {
      return json({ error: `Plano inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400 });
    }

    for (const addonId of ['mesas', 'pedidos', 'acessos']) {
      if (requestedAddons[addonId] && !isAddonAllowed(planTier, addonId)) {
        return json({ error: `Plano ${planTier} não suporta o add-on ${addonId}.` }, { status: 400 });
      }
    }

    const addons = sanitizeAddons(planTier, requestedAddons);

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', user.id)
      .maybeSingle();

    if (perfilError) {
      return json({ error: 'Erro ao carregar perfil da empresa.' }, { status: 500 });
    }

    if (!perfil?.nome_exibicao || !perfil?.documento || !perfil?.contato) {
      return json({
        error: 'Complete nome da empresa, CPF/CNPJ e telefone antes de gerar um Pix.',
        redirect: '/perfil?msg=complete',
      }, { status: 400 });
    }

    const normalizedTaxId = normalizeBrazilianTaxId(perfil.documento);
    const normalizedPhone = normalizeBrazilianPhone(perfil.contato);

    if (!normalizedTaxId || !isValidBrazilianTaxId(normalizedTaxId)) {
      return json({
        error: 'CPF/CNPJ inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
        redirect: '/perfil?msg=complete',
      }, { status: 400 });
    }

    if (!normalizedPhone) {
      return json({
        error: 'Telefone inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
        redirect: '/perfil?msg=complete',
      }, { status: 400 });
    }

    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, current_period_end, manually_extended_until, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, payment_provider')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestPendingPayment } = await supabaseAdmin
      .from('billing_payments')
      .select('id, status, amount_expected_cents, br_code, qr_code_base64, expires_at, provider_payment_id, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon')
      .eq('user_id', user.id)
      .eq('provider', 'abacatepay')
      .eq('method', 'pix')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const amountCents = Math.round(calculateValue(planTier, addons) * 100);
    const now = new Date();
    if (latestPendingPayment?.expires_at) {
      const expiresAt = new Date(latestPendingPayment.expires_at);
      if (expiresAt > now) {
        if (pendingPaymentMatchesSelection(latestPendingPayment, planTier, addons, amountCents)) {
          return json({
            reused: true,
            ...serializePendingPayment(latestPendingPayment),
          });
        }

        await supabaseAdmin
          .from('billing_payments')
          .update({
            status: 'cancelled',
            provider_status: 'REPLACED',
            updated_at: now.toISOString(),
          })
          .eq('id', latestPendingPayment.id);
      }

      if (expiresAt <= now) {
        await supabaseAdmin
          .from('billing_payments')
          .update({
            status: 'expired',
            provider_status: 'EXPIRED',
            updated_at: now.toISOString(),
          })
          .eq('id', latestPendingPayment.id);
      }
    }

    const externalReference = `pix_${user.id}_${Date.now()}`;
    const kind = existingSub ? 'subscription_renewal' : 'subscription_start';
    const metadata = {
      source: 'zelo_saas_pix',
      userId: user.id,
      email: user.email,
      planTier,
      addons,
      kind,
      billingCycle: 'monthly',
    };

    const remotePayment = await createTransparentPixCharge({
      amount: amountCents,
      expiresIn: PIX_EXPIRATION_SECONDS,
      description: buildPixDescription(planTier),
      externalId: externalReference,
      metadata,
      customer: {
        name: perfil.nome_exibicao,
        email: user.email,
        taxId: normalizedTaxId,
        cellphone: normalizedPhone,
      },
    });

    const nowIso = new Date().toISOString();
    const insertPayload = {
      user_id: user.id,
      subscription_id: existingSub?.id || null,
      provider: 'abacatepay',
      method: 'pix',
      kind,
      status: 'pending',
      plan_tier: planTier,
      has_mesas_addon: !!addons.mesas,
      has_pedidos_addon: !!addons.pedidos,
      has_acessos_addon: !!addons.acessos,
      amount_expected_cents: amountCents,
      amount_paid_cents: null,
      currency: 'BRL',
      external_reference: externalReference,
      provider_payment_id: remotePayment?.id || null,
      provider_checkout_id: remotePayment?.id || null,
      provider_customer_id: null,
      provider_subscription_id: null,
      provider_status: remotePayment?.status || 'PENDING',
      br_code: remotePayment?.brCode || null,
      qr_code_base64: remotePayment?.brCodeBase64 || null,
      expires_at: remotePayment?.expiresAt || null,
      paid_at: null,
      metadata,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: insertedPayment, error: insertError } = await supabaseAdmin
      .from('billing_payments')
      .insert(insertPayload)
      .select('id, status, amount_expected_cents, br_code, qr_code_base64, expires_at, provider_payment_id, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon')
      .single();

    if (insertError || !insertedPayment) {
      console.error('[billing/pix/create] DB insert error:', insertError);
      return json({ error: 'Falha ao salvar cobrança Pix.' }, { status: 500 });
    }

    return json(serializePendingPayment(insertedPayment));
  } catch (error) {
    console.error('[billing/pix/create] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao gerar cobrança Pix.' }, { status: 500 });
  }
}
