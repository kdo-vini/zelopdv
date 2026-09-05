import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { checkTransparentPixCharge, isAbacatePayConfigured } from '$lib/server/abacatePay';
import {
  findBillingPaymentForUser,
  reconcilePixCreation,
  serializeBillingPayment,
  syncPixPaymentWithRemote,
} from '$lib/server/billingPix';

export async function GET({ params, request }) {
  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
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

    const paymentId = params.paymentId;
    if (!paymentId) {
      return json({ error: 'paymentId é obrigatório.' }, { status: 400 });
    }

    let payment;
    try {
      payment = await findBillingPaymentForUser(paymentId, user.id);
    } catch (paymentError) {
      console.error('[billing/pix/status] payment lookup error:', paymentError);
      return json({ error: 'Erro ao carregar cobrança Pix.' }, { status: 500 });
    }

    if (!payment) {
      return json({ error: 'Cobrança Pix não encontrada.' }, { status: 404 });
    }

    let resolvedPayment = await reconcilePixCreation(payment);
    if (resolvedPayment.status === 'pending'
        && resolvedPayment.provider === 'abacatepay' && resolvedPayment.method === 'pix'
        && resolvedPayment.provider_payment_id && isAbacatePayConfigured()) {
      const remotePayment = await checkTransparentPixCharge(resolvedPayment.provider_payment_id);
      resolvedPayment = await syncPixPaymentWithRemote({
        payment: resolvedPayment, remotePayment, source: 'status',
      });
    }
    return json(serializeBillingPayment(resolvedPayment));
  } catch (error) {
    console.error('[billing/pix/status] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao consultar cobrança Pix.' }, { status: 500 });
  }
}
