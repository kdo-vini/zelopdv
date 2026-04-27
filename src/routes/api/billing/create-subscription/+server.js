import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import {
  createCustomer,
  findCustomerByCpfCnpj,
  findCustomerByEmail,
  createSubscription,
  removeSubscription,
  listSubscriptionPayments,
  getPixQrCode,
  isConfigured,
} from '$lib/server/asaas';
import { enviarBoasVindas } from '$lib/server/whatsapp';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { emailDay0 } from '$lib/server/emailTemplates';

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

    // Fire-and-forget: track last activity
    supabaseAdmin
      .from('empresa_perfil')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .then(({ error }) => { if (error) console.warn('[create-subscription] last_seen_at:', error.message); })
      .catch((e) => console.warn('[create-subscription] last_seen_at catch:', e.message));

    // Get billing type and add-ons from request body
    const body = await request.json();
    const billingType = body.billingType || 'PIX';
    const addons = body.addons || {};
    const hasMesasAddon = !!addons.mesas;

    if (!['PIX', 'CREDIT_CARD'].includes(billingType)) {
      return json({ error: 'Tipo de pagamento inválido. Use PIX ou CREDIT_CARD.' }, { status: 400 });
    }

    // Plan pricing: base R$59 + R$30 per active add-on
    const BASE_VALUE = 59.00;
    const MESAS_ADDON_VALUE = 30.00;
    const subscriptionValue = BASE_VALUE + (hasMesasAddon ? MESAS_ADDON_VALUE : 0);

    // Get customer profile for CPF/CNPJ
    const { data: perfil } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', userId)
      .maybeSingle();

    if (!perfil?.documento) {
      return json({ error: 'Complete o perfil da empresa (CPF/CNPJ) antes de assinar.', redirect: '/perfil?msg=complete' }, { status: 400 });
    }

    // Check existing subscription
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, status, current_period_end, billing_type')
      .eq('user_id', userId)
      .maybeSingle();

    const isFirstTime = !existingSub;

    // Check if user is currently in an active trial — must not reset it
    const isActiveTrial = existingSub?.status === 'trialing'
      && existingSub?.current_period_end
      && new Date(existingSub.current_period_end) > new Date();

    // Guard: prevent duplicate Asaas subscriptions for active/trialing users with same billing type
    const isActiveSubscription = existingSub?.provider_subscription_id
      && (existingSub.status === 'active' || existingSub.status === 'trialing')
      && new Date(existingSub.current_period_end) > new Date();

    if (isActiveSubscription && existingSub.billing_type === billingType) {
      // Already has an active subscription with the same billing type — return existing data
      return json({
        success: true,
        subscriptionId: existingSub.provider_subscription_id,
        trialEnd: existingSub.current_period_end,
        billingType,
        pix: null,
        invoiceUrl: null,
      });
    }

    // If billing type is changing for an active subscription, cancel the old one in Asaas first
    if (isActiveSubscription && existingSub.billing_type !== billingType && existingSub.provider_subscription_id) {
      try {
        await removeSubscription(existingSub.provider_subscription_id);
      } catch (e) {
        console.warn('[create-subscription] Could not cancel old Asaas subscription:', e.message);
      }
    }

    // Find or create Asaas customer
    const cpfCnpj = perfil.documento.replace(/\D/g, '');
    let customer = await findCustomerByCpfCnpj(cpfCnpj);
    if (!customer) customer = await findCustomerByEmail(email);
    if (!customer) {
      customer = await createCustomer(
        perfil.nome_exibicao || email,
        cpfCnpj,
        email,
        userId
      );
    }

    const trialDays = isFirstTime ? 30 : 0;
    const firstDue = new Date();
    firstDue.setDate(firstDue.getDate() + trialDays);
    const nextDueDate = firstDue.toISOString().split('T')[0];

    // If voluntarily subscribing (!isFirstTime), trial ends now and we transition to incomplete until paid
    const trialEnd = isFirstTime
      ? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })()
      : new Date();

    // Create subscription in Asaas
    const subscription = await createSubscription({
      customerId: customer.id,
      billingType,
      value: subscriptionValue,
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
      has_mesas_addon: hasMesasAddon,
      updated_at: nowIso,
    };

    // Write to DB — on failure, rollback the Asaas subscription
    let dbResult;
    if (existingSub) {
      dbResult = await supabaseAdmin
        .from('subscriptions')
        .update(subscriptionData)
        .eq('id', existingSub.id);
    } else {
      subscriptionData.created_at = nowIso;
      dbResult = await supabaseAdmin
        .from('subscriptions')
        .insert(subscriptionData);
    }

    if (dbResult.error) {
      // Rollback: cancel the subscription we just created in Asaas
      try { await removeSubscription(subscription.id); } catch {}
      console.error('[create-subscription] DB write failed, rolled back Asaas subscription:', dbResult.error);
      return json({ error: 'Erro ao salvar assinatura. Tente novamente.' }, { status: 500 });
    }

    // Fire-and-forget: WhatsApp onboarding on first account creation
    if (isFirstTime && perfil?.contato) {
      enviarBoasVindas(perfil.contato, perfil.nome_exibicao || '')
        .then((sent) => {
          if (sent) {
            // Mark as sent so cron skips onboarding resend
            supabaseAdmin
              .from('subscriptions')
              .update({ whatsapp_onboarding_sent_at: new Date().toISOString() })
              .eq('user_id', userId)
              .then(() => {})
              .catch(() => {});
          }
        })
        .catch((e) => console.warn('[WhatsApp] onboarding fire-and-forget error:', e?.message));
    }

    // Fire-and-forget: Day-0 welcome email on first account creation
    if (isFirstTime && isEmailConfigured()) {
      const { subject, html } = emailDay0(perfil?.nome_exibicao || '');
      sendEmail({ to: email, subject, html })
        .then((sent) => {
          if (sent) {
            supabaseAdmin
              .from('email_onboarding_logs')
              .insert({ user_id: userId, email_day: 0, recipient_email: email })
              .then(() => {})
              .catch(() => {});
          }
        })
        .catch((e) => console.warn('[Email] day-0 fire-and-forget error:', e?.message));
    }

    // For non-first-time users: fetch the first payment with retry (Asaas generates it because nextDueDate is today)
    let pixData = null;
    let invoiceUrl = null;

    if (!isFirstTime) {
      try {
        let firstPayment = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          // For CREDIT_CARD, check immediately on first attempt; PIX needs time to generate QR
          if (attempt > 0 || billingType !== 'CREDIT_CARD') {
            await new Promise(r => setTimeout(r, 1000 * attempt || 1000));
          }
          const payments = await listSubscriptionPayments(subscription.id);
          if (payments?.data?.[0]) {
            firstPayment = payments.data[0];
            break;
          }
        }

        if (firstPayment?.id) {
          invoiceUrl = firstPayment.invoiceUrl;
          if (billingType === 'PIX') {
            pixData = await getPixQrCode(firstPayment.id);
            pixData.paymentId = firstPayment.id;
            pixData.invoiceUrl = invoiceUrl;
          }
        }
      } catch (paymentErr) {
        console.warn('[create-subscription] Could not get payment data:', paymentErr?.message);
      }
    }

    return json({
      success: true,
      subscriptionId: subscription.id,
      invoiceUrl,
      trialEnd: trialEnd.toISOString(),
      billingType,
      pix: pixData,
    });

  } catch (err) {
    console.error('[create-subscription] error:', err?.message || err);
    // Distinguish Asaas API validation errors (user-readable) from internal errors
    const isAsaasError = err?.message && !err.message.includes('Supabase') && !err.message.includes('DB');
    return json({ error: err?.message || 'Falha ao criar assinatura' }, { status: isAsaasError ? 400 : 500 });
  }
}
