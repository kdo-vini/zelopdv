import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  isValidBrazilianTaxId,
  normalizeBrazilianPhone,
  normalizeBrazilianTaxId,
} from '$lib/masks';
import { calculateValue, PLANS, sanitizeAddons } from '$lib/pricing';
import { createTransparentPixCharge, checkTransparentPixCharge, listTransparentPixCharges, isAbacatePayConfigured } from '$lib/server/abacatePay';

export function serializeBillingPayment(row) {
  return {
    paymentId: row.id,
    status: row.status,
    creationState: row.creation_state || 'ready',
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
    .select('*')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findBillingPaymentByProviderId(providerPaymentId) {
  const { data, error } = await supabaseAdmin
    .from('billing_payments')
    .select('*')
    .eq('provider', 'abacatepay')
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findPixReservationFromWebhook(remote) {
  let query = supabaseAdmin.from('billing_payments').select('*')
    .eq('provider', 'abacatepay').eq('method', 'pix');
  if (remote?.externalId) query = query.eq('external_reference', remote.externalId);
  else if (remote?.metadata?.paymentId && remote?.metadata?.userId) {
    query = query.eq('id', remote.metadata.paymentId).eq('user_id', remote.metadata.userId);
  } else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const recovered = await reconcilePixCreation(data);
  if (recovered.provider_payment_id !== remote.id) throw pixCreationError(data, 'PIX_RECONCILIATION_CONFLICT');
  return recovered;
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
  if (!remotePayment?.status || (remotePayment.id && payment.provider_payment_id && remotePayment.id !== payment.provider_payment_id)) {
    throw new Error('Resposta de consulta Pix inválida.');
  }

  if (mappedStatus === 'paid') {
    const { data: settledPayment, error: settleError } = await supabaseAdmin
      .rpc('settle_pix_payment', {
        p_payment_id: payment.id,
        p_provider_status: providerStatus,
        p_mapped_status: mappedStatus,
        p_amount_paid_cents: remotePayment?.paidAmount ?? remotePayment?.amount ?? payment.amount_paid_cents ?? null,
        p_expires_at: remotePayment?.expiresAt || payment.expires_at || null,
        p_paid_at: remotePayment?.updatedAt || nowIso,
        p_external_reference: remotePayment?.externalId || null,
      })
      .single();

    if (settleError) throw settleError;
    if (!settledPayment) throw new Error('RPC settle_pix_payment não retornou o pagamento.');

    return {
      ...payment,
      ...settledPayment,
    };
  }

  // A pending GET can finish after a paid webhook. Never regress that result.
  const staleUnpaidStatus = ['pending', 'expired', 'cancelled'].includes(mappedStatus)
    || (mappedStatus === 'failed' && source !== 'webhook');
  if (staleUnpaidStatus && (payment.status === 'paid' || payment.paid_at)) return payment;
  const { data: updated, error } = await supabaseAdmin
    .from('billing_payments')
    .update(updates)
    .eq('id', payment.id)
    .eq('status', payment.status)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error('Pagamento mudou durante a consulta. Consulte novamente.');
  return updated;
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
  return {
    // Mensagem 1: texto explicativo (fácil de ler)
    message1:
      `Ola ${primeiroNome}! Aqui esta o PIX para renovar sua assinatura ${planName} do ZeloPDV, ` +
      `no valor de R$ ${formatBrlFromCents(amountCents)}. ` +
      `Copie o codigo da proxima mensagem e pague no app do seu banco (PIX Copia e Cola). ` +
      `Assim que o pagamento for confirmado, sua assinatura e renovada automaticamente.\n\n` +
      `Qualquer duvida e so chamar. — Equipe ZeloPDV`,
    // Mensagem 2: apenas o código (fácil de copiar)
    message2: brCode,
  };
}

export function serializePixCharge(row) {
  return {
    paymentId: row.id,
    status: row.status,
    creationState: row.creation_state || 'ready',
    amountCents: row.amount_expected_cents,
    brCode: row.br_code,
    qrCodeBase64: row.qr_code_base64,
    expiresAt: row.expires_at,
    providerPaymentId: row.provider_payment_id,
    planTier: row.plan_tier,
    addons: {
      mesas: !!row.has_mesas_addon,
      acessos: !!row.has_acessos_addon,
      menu: !!row.has_zelo_menu,
    },
  };
}

export function pendingPaymentMatchesSelection(payment, planTier, addons, amountCents) {
  return payment?.plan_tier === planTier
    && !!payment?.has_mesas_addon === !!addons.mesas
    && !!payment?.has_acessos_addon === !!addons.acessos
    && !!payment?.has_zelo_menu === !!addons.menu
    && Number(payment?.amount_expected_cents) === Number(amountCents);
}

export function pixCreationError(payment, code = 'PIX_OUTCOME_UNKNOWN') {
  const message = code === 'PIX_SELECTION_CONFLICT'
    ? 'Já existe um Pix pendente para outra seleção. Aguarde a confirmação ou expiração antes de gerar outro.'
    : 'A cobrança Pix está sendo conferida. Tente consultar novamente em instantes; não gere outra cobrança.';
  return Object.assign(new Error(message), { code, status: 409, paymentId: payment.id, retrySafe: false });
}

async function completeCreation(payment, outcome, remote = null) {
  const { data, error } = await supabaseAdmin.rpc('complete_pix_creation', {
    p_payment_id: payment.id, p_user_id: payment.user_id, p_outcome: outcome, p_remote: remote,
  }).single();
  if (error) throw error;
  if (!data) throw new Error('Reserva Pix não retornada pelo banco.');
  return data;
}

export async function reconcilePixCreation(payment) {
  if (!payment || !['dispatching', 'unknown'].includes(payment.creation_state)) return payment;
  const matches = payment.provider_payment_id
    ? [await checkTransparentPixCharge(payment.provider_payment_id)]
    : await listTransparentPixCharges(payment.external_reference);
  if (matches.length === 0) return payment; // Eventual consistency is not proof of absence.
  if (matches.length !== 1) throw pixCreationError(payment, 'PIX_RECONCILIATION_CONFLICT');
  const remote = matches[0];
  const metadata = remote?.metadata || {};
  const matchesReference = remote?.externalId === payment.external_reference;
  const matchesMetadata = metadata.paymentId === payment.id && metadata.userId === payment.user_id;
  if (!remote?.id || (!matchesReference && !matchesMetadata)
      || Number(remote.amount) !== Number(payment.amount_expected_cents)) {
    throw pixCreationError(payment, 'PIX_RECONCILIATION_CONFLICT');
  }
  const attached = await completeCreation(payment, 'ready', remote);
  return syncPixPaymentWithRemote({ payment: attached, remotePayment: remote, source: 'creation_recovery' });
}

export async function createOrReusePixCharge({
  userId, email, planTier, addons, name, taxId, phone, source, metadataExtra = {},
}) {
  if (!isAbacatePayConfigured()) throw new Error('AbacatePay não configurado.');
  const safeAddons = sanitizeAddons(planTier, addons);
  const amountCents = Math.round(calculateValue(planTier, safeAddons) * 100);
  const reserve = async () => {
    const { data, error } = await supabaseAdmin.rpc('reserve_pix_payment', {
      p_user_id: userId, p_plan_tier: planTier, p_amount_cents: amountCents,
      p_mesas: !!safeAddons.mesas, p_acessos: !!safeAddons.acessos, p_menu: !!safeAddons.menu,
      p_metadata: { ...metadataExtra, source, email },
    });
    if (error) throw error; // No outbound POST without a confirmed durable reservation.
    if (!data?.payment?.id) throw new Error('Falha ao reservar cobrança Pix.');
    return data;
  };
  let reservation = await reserve();
  let payment = reservation.payment;
  if (reservation.action === 'blocked') {
    payment = await reconcilePixCreation(payment);
    if (['dispatching', 'unknown'].includes(payment.creation_state)) throw pixCreationError(payment);
    if (payment.status === 'paid') return { reused: true, row: payment };
    reservation = await reserve();
    payment = reservation.payment;
  } else if (reservation.action === 'check') {
    const remote = await checkTransparentPixCharge(payment.provider_payment_id);
    payment = await syncPixPaymentWithRemote({ payment, remotePayment: remote, source: 'creation_check' });
    // A late settlement is returned to the caller, never silently renewed again.
    if (payment.status === 'paid') return { reused: true, row: payment };
    reservation = await reserve();
    payment = reservation.payment;
  }
  if (reservation.action === 'reuse') return { reused: true, row: payment };
  if (reservation.action !== 'create') {
    throw pixCreationError(payment, reservation.action === 'selection_conflict' ? 'PIX_SELECTION_CONFLICT' : 'PIX_OUTCOME_UNKNOWN');
  }
  let remote;
  try {
    remote = await createTransparentPixCharge({
      amount: payment.amount_expected_cents, expiresIn: PIX_EXPIRATION_SECONDS,
      description: buildPixDescription(payment.plan_tier), externalId: payment.external_reference,
      metadata: payment.metadata, customer: { name, email, taxId, cellphone: phone },
    });
    if (!remote?.id || !remote.brCode || !remote.status || !Number.isFinite(Date.parse(remote.expiresAt))
        || !Number.isInteger(remote.amount) || remote.amount !== payment.amount_expected_cents) {
      throw new Error('Resposta incompleta do provedor Pix.');
    }
    const row = await completeCreation(payment, 'ready', remote);
    // Only confirmed payment status can activate/renew a subscription.
    if (remote.status.toUpperCase() === 'PAID') {
      return { reused: false, row: await syncPixPaymentWithRemote({ payment: row, remotePayment: remote, source: 'creation' }) };
    }
    return { reused: false, row };
  } catch (error) {
    const outcome = error.dispatchStarted === false ? 'not_sent' : 'unknown';
    try { await completeCreation(payment, outcome); }
    catch { console.warn('[billing/pix] Reserva preservada para reconciliação.'); }
    if (outcome === 'not_sent') throw error;
    throw pixCreationError(payment);
  }
}
