import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { env } from '$env/dynamic/private';

const WEBHOOK_TOKEN = env.ASAAS_WEBHOOK_TOKEN;

export async function POST({ request }) {
  try {
    // 1) Validate webhook token
    const accessToken = request.headers.get('asaas-access-token');
    if (!WEBHOOK_TOKEN) {
      console.error('[Asaas Webhook] ASAAS_WEBHOOK_TOKEN not configured');
      return json({ error: 'Webhook not configured' }, { status: 500 });
    }
    if (accessToken !== WEBHOOK_TOKEN) {
      console.warn('[Asaas Webhook] Invalid access token received');
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error('[Asaas Webhook] supabaseAdmin is null');
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    // 2) Parse event
    const event = await request.json();
    const eventType = event.event;
    const payment = event.payment;

    console.log(`[Asaas Webhook] Event: ${eventType}, Payment: ${payment?.id || 'N/A'}`);

    if (!payment) {
      console.log('[Asaas Webhook] No payment data in event, skipping');
      return json({ received: true });
    }

    const subscriptionId = payment.subscription;

    // Events without subscription ID are one-off payments — skip
    if (!subscriptionId) {
      console.log('[Asaas Webhook] Payment without subscription, skipping');
      return json({ received: true });
    }

    // 3) Find subscription in our DB
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status')
      .eq('provider_subscription_id', subscriptionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingSub) {
      console.warn(`[Asaas Webhook] No subscription found for provider_subscription_id: ${subscriptionId}`);
      return json({ received: true });
    }

    // 4) Handle event types
    const now = new Date().toISOString();

    switch (eventType) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        // Payment confirmed — activate subscription and extend period
        const dueDate = payment.dueDate ? new Date(payment.dueDate) : new Date();
        // Set current_period_end to 30 days after the due date
        const periodEnd = new Date(dueDate);
        periodEnd.setDate(periodEnd.getDate() + 30);

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_end: periodEnd.toISOString(),
            updated_at: now,
          })
          .eq('id', existingSub.id);

        if (error) console.error('[Asaas Webhook] Error updating to active:', error);
        else console.log(`[Asaas Webhook] ✅ Subscription ${existingSub.id} activated until ${periodEnd.toISOString()}`);
        break;
      }

      case 'PAYMENT_OVERDUE': {
        // Payment overdue — mark as past_due
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: now,
          })
          .eq('id', existingSub.id);

        if (error) console.error('[Asaas Webhook] Error updating to past_due:', error);
        else console.log(`[Asaas Webhook] ⚠️ Subscription ${existingSub.id} marked as past_due`);
        break;
      }

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED': {
        // Payment deleted/refunded — mark as canceled
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: true,
            updated_at: now,
          })
          .eq('id', existingSub.id);

        if (error) console.error('[Asaas Webhook] Error updating to canceled:', error);
        else console.log(`[Asaas Webhook] ❌ Subscription ${existingSub.id} canceled`);
        break;
      }

      case 'PAYMENT_CREATED':
      case 'PAYMENT_UPDATED':
      case 'PAYMENT_AWAITING_RISK_ANALYSIS':
        // Log only — no DB change needed
        console.log(`[Asaas Webhook] ℹ️ ${eventType} for subscription ${existingSub.id}`);
        break;

      default:
        console.log(`[Asaas Webhook] Unhandled event type: ${eventType}`);
    }

    return json({ received: true });
  } catch (err) {
    console.error('[Asaas Webhook] Unexpected error:', err?.message || err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
