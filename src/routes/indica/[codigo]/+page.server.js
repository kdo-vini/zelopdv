import { buildRateLimitKey, enforceRateLimit, getRequestIp } from '$lib/server/rateLimit';
import { normalizeReferralCode } from '$lib/referrals';
import { getReferrerByCode, recordReferralClick } from '$lib/server/referrals';

export async function load({ params, cookies, url, request, getClientAddress }) {
  const code = normalizeReferralCode(params.codigo || '');
  const existingReferralId = cookies.get('zelo_referral_id') || null;

  if (!code) {
    return { valid: false, code: '' };
  }

  try {
    const ip = getRequestIp({ request, getClientAddress });
    const rateLimit = enforceRateLimit({
      key: buildRateLimitKey('referral', 'click', 'ip', ip, 'code', code),
      logKey: `referral:click:ip:${ip}:code:${code}`,
      route: '/indica/[codigo]',
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    if (!rateLimit.ok) {
      const referrer = await getReferrerByCode(code);
      if (!referrer) return { valid: false, code };

      const secure = url.protocol === 'https:';
      cookies.set('zelo_referral_code', referrer.referral_code, {
        path: '/',
        sameSite: 'lax',
        secure,
        maxAge: 60 * 60 * 24 * 90,
      });

      return {
        valid: true,
        code: referrer.referral_code,
        referralId: existingReferralId,
        referrerName: referrer.nome_exibicao || '',
      };
    }

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
