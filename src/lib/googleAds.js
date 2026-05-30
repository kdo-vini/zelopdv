const ASSINATURA_CONVERSION_ID = 'AW-17382733965/qJWuCO3plLYcEI3x3eBA';
const INSCRICAO_CONVERSION_ID = 'AW-17382733965/08-lCMrio7YcEI3x3eBA';
const CONTATO_CONVERSION_ID = 'AW-17382733965/d9ixCNGpkLYcEI3x3eBA';
const ZELO_WHATSAPP_NUMBER = '5514991537503';

function hasGtag() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

function trackConversion(sendTo, params = {}) {
  if (!hasGtag()) return false;

  window.gtag('event', 'conversion', {
    send_to: sendTo,
    ...params,
  });

  return true;
}

export function waitForGtag({ attempts = 40, intervalMs = 150 } = {}) {
  if (hasGtag()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let remaining = attempts;
    const timer = window.setInterval(() => {
      if (hasGtag()) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }

      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}

export function trackGoogleAdsAssinatura(params = {}) {
  return trackConversion(ASSINATURA_CONVERSION_ID, params);
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
