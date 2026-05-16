import { recordReferralClick } from '$lib/server/referrals';
import { normalizeReferralCode } from '$lib/referrals';

export async function load({ params, cookies, url }) {
  const code = normalizeReferralCode(params.codigo || '');
  const existingReferralId = cookies.get('zelo_referral_id') || null;

  if (!code) {
    return { valid: false, code: '' };
  }

  try {
    const { referrer, referral } = await recordReferralClick({
      code,
      source: url.searchParams.get('utm_source') || 'referral_link',
      existingReferralId,
    });

    if (!referrer || !referral) {
      return { valid: false, code };
    }

    const secure = url.protocol === 'https:';
    const cookieOptions = {
      path: '/',
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 24 * 90,
    };

    cookies.set('zelo_referral_code', referrer.referral_code, cookieOptions);
    cookies.set('zelo_referral_id', referral.id, { ...cookieOptions, httpOnly: true });

    return {
      valid: true,
      code: referrer.referral_code,
      referralId: referral.id,
      referrerName: referrer.nome_exibicao || '',
    };
  } catch (err) {
    console.error('[indica] load error:', err?.message || err);
    return { valid: false, code };
  }
}
