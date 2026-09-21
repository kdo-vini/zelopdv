import { captureAcquisitionOrigin, getStoredAcquisitionOrigin } from '$lib/attribution/client';
import { capturePostHogEvent } from '$lib/posthogClient';
import { OPERATIONAL_PROOF_EVENTS } from '$lib/components/marketing/operationalProof';

/** UTM + click ids preservados no href do CTA (first-touch). */
const HREF_ATTR_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'ttclid',
  'msclkid',
  'origem',
];

/**
 * Dispara marketing_trial_clicked com placement estável.
 * @param {string} placement
 * @param {Record<string, unknown>} [extra]
 */
export function trackSignupCta(placement, extra = {}) {
  if (!placement) return;
  void capturePostHogEvent(OPERATIONAL_PROOF_EVENTS.trial, { placement, ...extra });
}

/**
 * Monta /cadastro preservando first-touch de zelo_acquisition (ou query atual).
 * Extra query (addon, plan, ref…) é anexada sem sobrescrever first-touch salvo.
 * @param {Record<string, string|number|boolean|null|undefined>} [extraParams]
 * @returns {string}
 */
export function getSignupHref(extraParams = {}) {
  if (typeof window === 'undefined') {
    return buildHref(null, extraParams);
  }

  // Idempotente: grava first-touch se ainda não houver; devolve o salvo.
  const stored = captureAcquisitionOrigin() || getStoredAcquisitionOrigin();
  return buildHref(stored, extraParams);
}

function buildHref(origin, extraParams = {}) {
  const params = new URLSearchParams();

  if (origin && typeof origin === 'object') {
    for (const key of HREF_ATTR_KEYS) {
      const value = origin[key];
      if (typeof value === 'string' && value.trim()) {
        params.set(key, value.trim().slice(0, 120));
      }
    }
  }

  for (const [key, raw] of Object.entries(extraParams || {})) {
    if (raw == null || raw === '') continue;
    if (params.has(key)) continue;
    params.set(key, String(raw).slice(0, 120));
  }

  const qs = params.toString();
  return qs ? `/cadastro?${qs}` : '/cadastro';
}
