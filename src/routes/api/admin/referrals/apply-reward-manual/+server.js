import { json } from '@sveltejs/kit';
import {
  getUserFromBearerToken,
  markReferralRewardAppliedManually,
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
    const reward = await markReferralRewardAppliedManually(
      body.rewardId,
      user.id,
      body.notes || '',
    );

    return json({ success: true, reward }, { headers: cors });
  } catch (err) {
    console.error('[admin/referrals/apply-reward-manual] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao aplicar recompensa.' }, { status: 500, headers: cors });
  }
}
