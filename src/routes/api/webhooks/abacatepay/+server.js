import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  findBillingPaymentByProviderId,
  syncPixPaymentWithRemote,
  verifyAbacateWebhookSignature,
} from '$lib/server/billingPix';

function getTransparentPayload(payload) {
  return payload?.data?.transparent || payload?.data || null;
}

function getProviderStatusForEvent(eventType, transparent) {
  if (eventType === 'transparent.refunded') return 'REFUNDED';
  if (eventType === 'transparent.disputed') return 'FAILED';
  if (eventType === 'transparent.lost') return 'EXPIRED';
  return transparent?.status || 'PENDING';
}

async function createWebhookEvent({ eventId, eventType, payload, signature }) {
  const { data, error } = await supabaseAdmin
    .from('billing_webhook_events')
    .insert({
      provider: 'abacatepay',
      event_id: eventId,
      event_type: eventType,
      status: 'received',
      raw_payload: payload,
      signature,
    })
    .select('id, event_id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }

  return data;
}

async function updateWebhookEvent(eventId, payload) {
  const { error } = await supabaseAdmin
    .from('billing_webhook_events')
    .update(payload)
    .eq('provider', 'abacatepay')
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function POST({ request, url }) {
  const webhookSecretConfig = env.ABACATEPAY_WEBHOOK_SECRET || process.env.ABACATEPAY_WEBHOOK_SECRET;

  if (!supabaseAdmin) {
    return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
  }

  if (!webhookSecretConfig) {
    console.error('[abacatepay-webhook] ABACATEPAY_WEBHOOK_SECRET não configurado');
    return json({ error: 'Webhook não configurado.' }, { status: 500 });
  }

  const webhookSecret = url.searchParams.get('webhookSecret');
  if (!webhookSecret || webhookSecret !== webhookSecretConfig) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature');
  if (!verifyAbacateWebhookSignature(rawBody, signature)) {
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = payload?.event || 'unknown';
  const transparent = getTransparentPayload(payload);
  const providerPaymentId = transparent?.id || null;
  const eventId = payload?.id || `${eventType}:${providerPaymentId || 'unknown'}`;

  try {
    const createdEvent = await createWebhookEvent({
      eventId,
      eventType,
      payload,
      signature,
    });

    if (!createdEvent) {
      return json({ received: true, idempotent: true });
    }

    if (!providerPaymentId) {
      await updateWebhookEvent(eventId, {
        status: 'ignored',
        error_message: 'provider_payment_id ausente no payload',
        processed_at: new Date().toISOString(),
      });
      return json({ received: true, ignored: true });
    }

    const payment = await findBillingPaymentByProviderId(providerPaymentId);
    if (!payment) {
      await updateWebhookEvent(eventId, {
        status: 'ignored',
        error_message: `Pagamento ${providerPaymentId} não encontrado`,
        processed_at: new Date().toISOString(),
      });
      return json({ received: true, ignored: true });
    }

    let nextPayment = payment;

    switch (eventType) {
      case 'transparent.completed':
      case 'transparent.refunded':
      case 'transparent.disputed':
      case 'transparent.lost': {
        nextPayment = await syncPixPaymentWithRemote({
          payment,
          remotePayment: {
            id: providerPaymentId,
            externalId: transparent?.externalId || null,
            amount: transparent?.amount ?? null,
            paidAmount: transparent?.paidAmount ?? transparent?.amount ?? null,
            status: getProviderStatusForEvent(eventType, transparent),
            expiresAt: transparent?.expiresAt || payment.expires_at,
            updatedAt: transparent?.updatedAt || new Date().toISOString(),
          },
          source: 'webhook',
        });
        break;
      }

      default:
        await updateWebhookEvent(eventId, {
          status: 'ignored',
          payment_id: payment.id,
          error_message: `Evento não tratado: ${eventType}`,
          processed_at: new Date().toISOString(),
        });
        return json({ received: true, ignored: true });
    }

    await updateWebhookEvent(eventId, {
      status: 'processed',
      payment_id: nextPayment.id,
      processed_at: new Date().toISOString(),
      error_message: null,
    });

    return json({ received: true });
  } catch (error) {
    console.error('[abacatepay-webhook] error:', error?.message || error);
    try {
      await updateWebhookEvent(eventId, {
        status: 'failed',
        error_message: error?.message || 'Erro ao processar webhook',
        processed_at: new Date().toISOString(),
      });
    } catch (updateError) {
      console.error('[abacatepay-webhook] failed to persist webhook error:', updateError?.message || updateError);
    }
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
