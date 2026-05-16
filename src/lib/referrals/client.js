import { normalizeReferralCode } from '$lib/referrals';

const STORAGE_CODE_KEY = 'zelo_referral_code';
const STORAGE_ID_KEY = 'zelo_referral_id';

export function persistReferralAttributionFromUrl() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const code = normalizeReferralCode(params.get('ref') || params.get('referral_code') || '');
  const id = params.get('referral_id') || '';

  if (code) localStorage.setItem(STORAGE_CODE_KEY, code);
  if (id) localStorage.setItem(STORAGE_ID_KEY, id);

  return getStoredReferralAttribution();
}

export function persistReferralAttribution({ code, referralId } = {}) {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeReferralCode(code || '');
  if (normalized) localStorage.setItem(STORAGE_CODE_KEY, normalized);
  if (referralId) localStorage.setItem(STORAGE_ID_KEY, referralId);
  return getStoredReferralAttribution();
}

export function getStoredReferralAttribution() {
  if (typeof window === 'undefined') return { code: '', referralId: '' };
  return {
    code: normalizeReferralCode(localStorage.getItem(STORAGE_CODE_KEY) || ''),
    referralId: localStorage.getItem(STORAGE_ID_KEY) || '',
  };
}

export async function claimStoredReferral(session, source = 'client') {
  const token = session?.access_token;
  if (!token) return false;

  const attribution = getStoredReferralAttribution();
  try {
    const res = await fetch('/api/referrals/claim', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...attribution, source }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
