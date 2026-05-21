import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { checkTransparentPixCharge, isAbacatePayConfigured } from '$lib/server/abacatePay';
import {
  findBillingPaymentForUser,
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

    let resolvedPayment = { ...payment };
    const now = new Date();

    if (resolvedPayment.status === 'pending') {
      if (resolvedPayment.expires_at) {
        const expiresAt = new Date(resolvedPayment.expires_at);
        if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= now) {
          try {
            const { error: updateError } = await supabaseAdmin
              .from('billing_payments')
              .update({
                status: 'expired',
                provider_status: 'EXPIRED',
                updated_at: now.toISOString(),
              })
              .eq('id', resolvedPayment.id)
              .eq('status', 'pending');

            if (updateError) throw updateError;
            resolvedPayment = {
              ...resolvedPayment,
              status: 'expired',
              provider_status: 'EXPIRED',
            };
          } catch (updateError) {
            console.error('[billing/pix/status] payment expiration error:', updateError);
            return json({ error: 'Erro ao atualizar cobrança Pix.' }, { status: 500 });
          }
        }
      }

      if (resolvedPayment.status === 'pending' && resolvedPayment.provider === 'abacatepay' && resolvedPayment.method === 'pix' && resolvedPayment.provider_payment_id && isAbacatePayConfigured()) {
        const remotePayment = await checkTransparentPixCharge(resolvedPayment.provider_payment_id);
        try {
          resolvedPayment = await syncPixPaymentWithRemote({
            payment: resolvedPayment,
            remotePayment,
            source: 'status',
          });
        } catch (updateError) {
          console.error('[billing/pix/status] payment sync error:', updateError);
          return json({ error: 'Erro ao atualizar cobrança Pix.' }, { status: 500 });
        }
      }
    }

    return json(serializeBillingPayment(resolvedPayment));
  } catch (error) {
    console.error('[billing/pix/status] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao consultar cobrança Pix.' }, { status: 500 });
  }
}
