const ASSINATURA_CONVERSION_ID = 'AW-17382733965/qJWuCO3plLYcEI3x3eBA';
const INSCRICAO_CONVERSION_ID = 'AW-17382733965/08-lCMrio7YcEI3x3eBA';
const CONTATO_CONVERSION_ID = 'AW-17382733965/d9ixCNGpkLYcEI3x3eBA';
const ZELO_WHATSAPP_NUMBER = '5514991537503';

function hasGtag() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

function trackConversion(sendTo) {
  if (!hasGtag()) return false;

  window.gtag('event', 'conversion', {
    send_to: sendTo,
  });

  return true;
}

export function trackGoogleAdsAssinatura() {
  return trackConversion(ASSINATURA_CONVERSION_ID);
}

export function trackGoogleAdsInscricao() {
  return trackConversion(INSCRICAO_CONVERSION_ID);
}

export function trackGoogleAdsContato() {
  return trackConversion(CONTATO_CONVERSION_ID);
}

export function isZeloContactWhatsAppHref(href = '') {
  return href.includes(`wa.me/${ZELO_WHATSAPP_NUMBER}`);
}
