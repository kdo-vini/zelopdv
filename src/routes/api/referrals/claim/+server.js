import { json } from '@sveltejs/kit';
import {
  claimReferralForUser,
  getUserFromBearerToken,
} from '$lib/server/referrals';

export async function POST({ request, cookies }) {
  try {
    const user = await getUserFromBearerToken(request);
    if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const referralCode =
      body.code ||
      body.referralCode ||
      cookies.get('zelo_referral_code') ||
      user.user_metadata?.referral_code ||
      '';
    const referralId =
      body.referralId ||
      body.referral_id ||
      cookies.get('zelo_referral_id') ||
      '';

    const result = await claimReferralForUser({
      referralCode,
      referralId,
      referredUserId: user.id,
      referredEmail: user.email,
      source: body.source || 'signup',
      wantedStatus: 'signed_up',
    });

    return json({ success: true, ...result });
  } catch (err) {
    console.error('[referrals/claim] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao registrar indicação.' }, { status: 500 });
  }
}
