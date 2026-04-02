import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { createCustomer, findCustomerByCpfCnpj, findCustomerByEmail, createSubscription, listSubscriptionPayments, getPixQrCode, isConfigured } from '$lib/server/asaas';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!isConfigured()) return json({ error: 'Asaas não configurado. Verifique ASAAS_API_KEY.' }, { status: 500 });

    // Auth
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const userId = user.id;
    const email = user.email;

    // Get billing type from request body
    const body = await request.json();
    const billingType = body.billingType || 'PIX'; // Default to PIX

    if (!['PIX', 'CREDIT_CARD', 'BOLETO'].includes(billingType)) {
      return json({ error: 'Tipo de pagamento inválido. Use PIX, CREDIT_CARD ou BOLETO.' }, { status: 400 });
    }

    // Get customer profile for CPF/CNPJ
    const { data: perfil } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', userId)
      .maybeSingle();

    if (!perfil?.documento) {
      return json({ error: 'Complete o perfil da empresa (CPF/CNPJ) antes de assinar.', redirect: '/perfil?msg=complete' }, { status: 400 });
    }

    // Find or create Asaas customer
    const cpfCnpj = perfil.documento.replace(/\D/g, '');
    let customer = await findCustomerByCpfCnpj(cpfCnpj);
    if (!customer) {
      customer = await findCustomerByEmail(email);
    }
    if (!customer) {
      customer = await createCustomer(
        perfil.nome_exibicao || email,
        cpfCnpj,
        email,
        userId
      );
    }

    // Calculate first due date (30 days from now for trial)
    const firstDue = new Date();
    firstDue.setDate(firstDue.getDate() + 30);
    const nextDueDate = firstDue.toISOString().split('T')[0]; // YYYY-MM-DD

    // Create subscription in Asaas
    const subscription = await createSubscription({
      customerId: customer.id,
      billingType,
      value: 59.00,
      nextDueDate,
      externalReference: userId,
    });

    // Save to our database
    const now = new Date().toISOString();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    // Check if user already has a subscription record
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const subscriptionData = {
      user_id: userId,
      provider_customer_id: customer.id,
      provider_subscription_id: subscription.id,
      status: 'trialing',
      current_period_end: trialEnd.toISOString(),
      cancel_at_period_end: false,
      payment_provider: 'asaas',
      billing_type: billingType,
      updated_at: now,
    };

    if (existingSub) {
      await supabaseAdmin
        .from('subscriptions')
        .update(subscriptionData)
        .eq('id', existingSub.id);
    } else {
      subscriptionData.created_at = now;
      await supabaseAdmin
        .from('subscriptions')
        .insert(subscriptionData);
    }

    // For PIX payments, try to get the first payment's QR Code
    let pixData = null;
    if (billingType === 'PIX') {
      try {
        // Wait a moment for Asaas to create the first payment
        await new Promise(r => setTimeout(r, 1500));
        const payments = await listSubscriptionPayments(subscription.id);
        const firstPayment = payments?.data?.[0];
        if (firstPayment?.id) {
          pixData = await getPixQrCode(firstPayment.id);
          pixData.paymentId = firstPayment.id;
          pixData.invoiceUrl = firstPayment.invoiceUrl;
        }
      } catch (pixErr) {
        console.warn('[Asaas] Could not get PIX QR Code (trial starts in 30 days):', pixErr?.message);
      }
    }

    return json({
      success: true,
      subscriptionId: subscription.id,
      invoiceUrl: subscription.invoiceUrl || null,
      trialEnd: trialEnd.toISOString(),
      billingType,
      pix: pixData,
    });

  } catch (err) {
    console.error('[Asaas] create-subscription error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao criar assinatura' }, { status: 500 });
  }
}
