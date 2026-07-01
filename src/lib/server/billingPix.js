import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  isValidBrazilianTaxId,
  normalizeBrazilianPhone,
  normalizeBrazilianTaxId,
} from '$lib/masks';
import { PLANS } from '$lib/pricing';

const BILLING_CYCLE_MONTHS = 1;

export function serializeBillingPayment(row) {
  return {
    paymentId: row.id,
    status: row.status,
    providerStatus: row.provider_status || null,
    amountCents: row.amount_expected_cents,
    brCode: row.br_code,
    qrCodeBase64: row.qr_code_base64,
    expiresAt: row.expires_at,
    paidAt: row.paid_at || null,
    providerPaymentId: row.provider_payment_id,
    planTier: row.plan_tier,
    addons: {
      mesas: !!row.has_mesas_addon,
      pedidos: !!row.has_pedidos_addon,
      acessos: !!row.has_acessos_addon,
      menu: !!row.has_zelo_menu,
    },
  };
}

export function mapAbacatePaymentStatus(providerStatus) {
  switch ((providerStatus || '').toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
    default:
      return 'pending';
  }
}

function getRenewalBaseDate(subscription) {
  const candidates = [new Date()];

  if (subscription?.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    if (!Number.isNaN(periodEnd.getTime())) candidates.push(periodEnd);
  }

  if (subscription?.manually_extended_until) {
    const extendedUntil = new Date(subscription.manually_extended_until);
    if (!Number.isNaN(extendedUntil.getTime())) candidates.push(extendedUntil);
  }

  return candidates.reduce((latest, current) => (current > latest ? current : latest));
}

function addMonths(baseDate, months) {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function activateSubscriptionFromPayment({ payment, userId, nowIso }) {
  const { data: existingSub, error: existingSubError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, current_period_end, manually_extended_until')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSubError) throw existingSubError;

  const baseDate = getRenewalBaseDate(existingSub);
  const nextPeriodEnd = addMonths(baseDate, BILLING_CYCLE_MONTHS).toISOString();
  const subscriptionPayload = {
    user_id: userId,
    status: 'active',
    current_period_end: nextPeriodEnd,
    cancel_at_period_end: false,
    payment_provider: 'abacatepay',
    billing_type: 'PIX',
    plan_tier: payment.plan_tier || 'pdv',
    has_mesas_addon: !!payment.has_mesas_addon,
    has_pedidos_addon: !!payment.has_pedidos_addon,
    has_acessos_addon: !!payment.has_acessos_addon,
    has_zelo_menu: !!payment.has_zelo_menu,
    updated_at: nowIso,
  };

  let subscriptionId = existingSub?.id || null;

  if (existingSub) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update(subscriptionPayload)
      .eq('id', existingSub.id);

    if (error) throw error;
  } else {
    const { data: insertedSub, error } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        ...subscriptionPayload,
        created_at: nowIso,
      })
      .select('id')
      .single();

    if (error || !insertedSub) throw error || new Error('Falha ao criar assinatura local.');
    subscriptionId = insertedSub.id;
  }

  return { subscriptionId, nextPeriodEnd };
}

export function verifyAbacateWebhookSignature(rawBody, signatureFromHeader) {
  const publicKey = env.ABACATEPAY_PUBLIC_KEY || process.env.ABACATEPAY_PUBLIC_KEY;
  if (!rawBody || !signatureFromHeader || !publicKey) {
    throw new Error('ABACATEPAY_PUBLIC_KEY não configurada. Recusando webhook.');
  }

  const expectedSig = crypto
    .createHmac('sha256', publicKey)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSig);
  const receivedBuffer = Buffer.from(signatureFromHeader);

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function markWebhookEventProcessed({ provider, eventId, eventType }) {
  if (!eventId) return true;

  const { data, error } = await supabaseAdmin
    .from('webhook_events_processed')
    .insert({ provider, event_id: eventId, event_type: eventType })
    .select('event_id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return false;
    throw error;
  }

  return !!data;
}

export async function findBillingPaymentForUser(paymentId, userId) {
  const { data, error } = await supabaseAdmin
    .from('billing_payments')
    .select('id, user_id, subscription_id, provider, method, status, amount_expected_cents, amount_paid_cents, currency, external_reference, br_code, qr_code_base64, expires_at, paid_at, provider_payment_id, provider_status, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, has_zelo_menu, metadata')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findBillingPaymentByProviderId(providerPaymentId) {
  const { data, error } = await supabaseAdmin
    .from('billing_payments')
    .select('id, user_id, subscription_id, provider, method, status, amount_expected_cents, amount_paid_cents, currency, external_reference, br_code, qr_code_base64, expires_at, paid_at, provider_payment_id, provider_status, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, has_zelo_menu, metadata')
    .eq('provider', 'abacatepay')
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function syncPixPaymentWithRemote({ payment, remotePayment, source = 'unknown' }) {
  if (!payment) {
    throw new Error('payment é obrigatório.');
  }

  const nowIso = new Date().toISOString();
  const providerStatus = remotePayment?.status || payment.provider_status || 'PENDING';
  const mappedStatus = mapAbacatePaymentStatus(providerStatus);
  const updates = {
    provider_status: providerStatus,
    expires_at: remotePayment?.expiresAt || payment.expires_at,
    updated_at: nowIso,
  };

  if (mappedStatus !== payment.status) {
    updates.status = mappedStatus;
  }

  if (remotePayment?.paidAmount != null) {
    updates.amount_paid_cents = remotePayment.paidAmount;
  }

  if (remotePayment?.externalId && payment.external_reference && remotePayment.externalId !== payment.external_reference) {
    throw new Error(`External reference divergente no ${source}.`);
  }

  if (mappedStatus === 'paid') {
    const paidAmount = remotePayment?.paidAmount ?? payment.amount_paid_cents ?? payment.amount_expected_cents;
    if (paidAmount < payment.amount_expected_cents) {
      updates.status = 'failed';
      updates.provider_status = 'PAID_AMOUNT_MISMATCH';
    } else if (!payment.paid_at) {
      const { subscriptionId } = await activateSubscriptionFromPayment({
        payment,
        userId: payment.user_id,
        nowIso,
      });
      updates.paid_at = remotePayment?.updatedAt || nowIso;
      updates.subscription_id = subscriptionId;
    }
  }

  const { error } = await supabaseAdmin
    .from('billing_payments')
    .update(updates)
    .eq('id', payment.id);

  if (error) throw error;

  return {
    ...payment,
    ...updates,
  };
}

export const PIX_EXPIRATION_SECONDS = 60 * 60;

export function buildPixDescription(planTier) {
  const base = `Assinatura ${PLANS[planTier]?.name || 'Zelo'}`;
  return base.slice(0, 37);
}

export function validatePixCustomerProfile(perfil) {
  if (!perfil?.nome_exibicao || !perfil?.documento || !perfil?.contato) {
    return {
      ok: false,
      code: 'missing_fields',
      message: 'Complete nome da empresa, CPF/CNPJ e telefone antes de gerar um Pix.',
    };
  }
  const taxId = normalizeBrazilianTaxId(perfil.documento);
  if (!taxId || !isValidBrazilianTaxId(taxId)) {
    return {
      ok: false,
      code: 'invalid_tax_id',
      message: 'CPF/CNPJ inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
    };
  }
  const phone = normalizeBrazilianPhone(perfil.contato);
  if (!phone) {
    return {
      ok: false,
      code: 'invalid_phone',
      message: 'Telefone inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
    };
  }
  return { ok: true, name: perfil.nome_exibicao, taxId, phone };
}

function formatBrlFromCents(amountCents) {
  return (Number(amountCents || 0) / 100).toFixed(2).replace('.', ',');
}

export function buildRenewalPixWhatsAppMessage({ nome, planName, amountCents, brCode }) {
  const primeiroNome = (nome || 'tudo bem').split(' ')[0];
  return (
    `Ola ${primeiroNome}! Aqui esta o PIX para renovar sua assinatura ${planName} do ZeloPDV, ` +
    `no valor de R$ ${formatBrlFromCents(amountCents)}. ` +
    `Copie o codigo abaixo e pague no app do seu banco (PIX Copia e Cola). ` +
    `Assim que o pagamento for confirmado, sua assinatura e renovada automaticamente.\n\n` +
    `${brCode}\n\n` +
    `Qualquer duvida e so chamar. — Equipe ZeloPDV`
  );
}
