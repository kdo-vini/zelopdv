import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';
import { supabase } from '$lib/supabaseClient';

const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

export async function POST({ request }) {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!WEBHOOK_SECRET) {
        console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
        return json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('[Webhook] Event received:', event.type);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await handleCheckoutCompleted(session);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await handleSubscriptionUpdate(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                await handleInvoicePaymentSucceeded(invoice);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                await handleInvoicePaymentFailed(invoice);
                break;
            }

            default:
                console.log('[Webhook] Unhandled event type:', event.type);
        }

        return json({ received: true });
    } catch (err) {
        console.error('[Webhook] Error processing event:', err);
        return json({ error: 'Webhook handler failed' }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session) {
    console.log('[Webhook] Checkout completed:', session.id);

    const customerId = session.customer;
    const subscriptionId = session.subscription;
    let userId = session.metadata?.user_id;

    // If no user_id in metadata (Payment Link), try to find by customer email
    if (!userId) {
        console.log('[Webhook] No user_id in metadata, looking up by customer email');

        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = customer.email || session.customer_details?.email;

        if (customerEmail) {
            const { data: users } = await supabase
                .from('auth.users')
                .select('id')
                .eq('email', customerEmail)
                .limit(1);

            if (users && users.length > 0) {
                userId = users[0].id;
                console.log('[Webhook] Found user by email:', customerEmail);
            }
        }
    }

    if (!userId) {
        console.error('[Webhook] Could not identify user - no metadata and no matching email');
        return;
    }

    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const subscriptionData = {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
    };

    // Only add timestamps if they exist
    if (subscription.current_period_start) {
        subscriptionData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
    }

    if (subscription.current_period_end) {
        subscriptionData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
    }

    // Create or update subscription in database
    const { error } = await supabase
        .from('subscriptions')
        .upsert(subscriptionData, {
            onConflict: 'user_id'
        });

    if (error) {
        console.error('[Webhook] Error upserting subscription:', error);
        throw error;
    }

    console.log('[Webhook] Subscription created/updated for user:', userId);
}

async function handleSubscriptionUpdate(subscription) {
    console.log('[Webhook] Subscription updated:', subscription.id);

    const updateData = {
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
    };

    // Only add timestamps if they exist (not null)
    if (subscription.current_period_start) {
        updateData.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
    }

    if (subscription.current_period_end) {
        updateData.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
    }

    const { error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', subscription.id);

    if (error) {
        console.error('[Webhook] Error updating subscription:', error);
        throw error;
    }

    console.log('[Webhook] Subscription updated in database');
}

async function handleSubscriptionDeleted(subscription) {
    console.log('[Webhook] Subscription deleted:', subscription.id);

    const { error } = await supabase
        .from('subscriptions')
        .update({
            status: 'canceled',
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', subscription.id);

    if (error) {
        console.error('[Webhook] Error deleting subscription:', error);
        throw error;
    }

    console.log('[Webhook] Subscription marked as canceled');
}

async function handleInvoicePaymentSucceeded(invoice) {
    console.log('[Webhook] Invoice payment succeeded:', invoice.id);

    if (!invoice.subscription) return;

    // Refresh subscription data
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdate(subscription);
}

async function handleInvoicePaymentFailed(invoice) {
    console.log('[Webhook] Invoice payment failed:', invoice.id);

    if (!invoice.subscription) return;

    const { error } = await supabase
        .from('subscriptions')
        .update({
            status: 'past_due',
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', invoice.subscription);

    if (error) {
        console.error('[Webhook] Error updating subscription to past_due:', error);
    }
}
