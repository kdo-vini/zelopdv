const ASSINATURA_CONVERSION_ID = 'AW-17382733965/qJWuCO3plLYcEI3x3eBA';

function hasGtag() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function trackGoogleAdsAssinatura() {
  if (!hasGtag()) return false;

  window.gtag('event', 'conversion', {
    send_to: ASSINATURA_CONVERSION_ID,
  });

  return true;
}
