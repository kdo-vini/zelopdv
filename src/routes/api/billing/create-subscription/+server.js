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

    if (!['PIX', 'CREDIT_CARD'].includes(billingType)) {
      return json({ error: 'Tipo de pagamento inválido. Use PIX ou CREDIT_CARD.' }, { status: 400 });
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

    // 1. Check if user already has a subscription record (ever)
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    // 2. Trial eligibility: No previous record = 30 days trial
    const isFirstTime = !existingSub;
    const trialDays = isFirstTime ? 30 : 0;

    // Calcular datas
    const now = new Date();
    const firstDue = new Date();
    firstDue.setDate(firstDue.getDate() + trialDays);
    const nextDueDate = firstDue.toISOString().split('T')[0];

    // Expiry date for our local DB
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + (isFirstTime ? 30 : 0));

    // Create subscription in Asaas
    const subscription = await createSubscription({
      customerId: customer.id,
      billingType,
      value: 59.00,
      nextDueDate,
      externalReference: userId,
    });

    const nowIso = new Date().toISOString();
    const subscriptionData = {
      user_id: userId,
      provider_customer_id: customer.id,
      provider_subscription_id: subscription.id,
      status: isFirstTime ? 'trialing' : 'incomplete',
      current_period_end: trialEnd.toISOString(),
      cancel_at_period_end: false,
      payment_provider: 'asaas',
      billing_type: billingType,
      updated_at: nowIso,
    };

    if (existingSub) {
      await supabaseAdmin
        .from('subscriptions')
        .update(subscriptionData)
        .eq('id', existingSub.id);
    } else {
      subscriptionData.created_at = nowIso;
      await supabaseAdmin
        .from('subscriptions')
        .insert(subscriptionData);
    }

    // For PIX payments, get QR Code. For Credit Card/Boleto, get invoiceUrl from the first payment.
    let pixData = null;
    let invoiceUrl = null;
    
    if (!isFirstTime) {
      try {
        // Wait a moment for Asaas to create the first payment
        await new Promise(r => setTimeout(r, 1500));
        const payments = await listSubscriptionPayments(subscription.id);
        const firstPayment = payments?.data?.[0];
        if (firstPayment?.id) {
          invoiceUrl = firstPayment.invoiceUrl;
          if (billingType === 'PIX') {
            pixData = await getPixQrCode(firstPayment.id);
            pixData.paymentId = firstPayment.id;
            pixData.invoiceUrl = invoiceUrl;
          }
        }
      } catch (paymentErr) {
        console.warn('[Asaas] Could not get payment data:', paymentErr?.message);
      }
    }


    return json({
      success: true,
      subscriptionId: subscription.id,
      invoiceUrl: invoiceUrl,
      trialEnd: trialEnd.toISOString(),
      billingType,
      pix: pixData,
    });


  } catch (err) {
    console.error('[Asaas] create-subscription error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao criar assinatura' }, { status: 500 });
  }
}
