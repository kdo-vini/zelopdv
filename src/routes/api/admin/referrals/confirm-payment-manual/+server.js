import { json } from '@sveltejs/kit';
import {
  confirmReferralPaymentManually,
  getUserFromBearerToken,
} from '$lib/server/referrals';
import { buildCorsHeaders, optionsResponse } from '../_cors.js';

export function OPTIONS({ request }) {
  return optionsResponse(request);
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403 });
  }

  try {
    const user = await getUserFromBearerToken(request);
    if (!user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const body = await request.json().catch(() => ({}));
    const result = await confirmReferralPaymentManually(
      body.referralId,
      user.id,
      body.notes || '',
      {
        rewardType: body.rewardType || 'credit',
        amountCents: Number(body.amountCents || 3000),
        addonKey: body.addonKey || null,
      },
    );

    return json({ success: true, ...result }, { headers: cors });
  } catch (err) {
    console.error('[admin/referrals/confirm-payment-manual] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao aprovar indicação.' }, { status: 500, headers: cors });
  }
}
