const ASSINATURA_CONVERSION_ID = 'AW-17382733965/qJWuCO3plLYcEI3x3eBA';
const INSCRICAO_CONVERSION_ID = 'AW-17382733965/08-lCMrio7YcEI3x3eBA';
const CONTATO_CONVERSION_ID = 'AW-17382733965/d9ixCNGpkLYcEI3x3eBA';
const ZELO_WHATSAPP_NUMBER = '5514991537503';

const INSCRICAO_DEDUP_PREFIX = 'zelo_inscricao_tracked:';

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

/**
 * Evento GA4 (sem send_to: vai para todas as tags configuradas, incluindo G-).
 * Usado para alimentar o funil no GA4 e habilitar import de conversões no Google Ads.
 */
export function trackGa4Event(name, params = {}) {
  if (!hasGtag()) return false;
  window.gtag('event', name, params);
  return true;
}

// Enhanced Conversions exige o hash SHA-256 feito no navegador
async function sha256Hex(value) {
  try {
    if (!window?.crypto?.subtle) return null;
    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
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

/**
 * Conversão de inscrição (trial). Dispara em mais de um ponto do funil
 * (cadastro, wizard, assinatura) — o transaction_id garante dedup no Google
 * e o sessionStorage evita refire na mesma sessão.
 */
export async function trackGoogleAdsInscricao({ email = '', transactionId = '', value = 0, currency = 'BRL' } = {}) {
  if (!hasGtag()) {
    console.warn('[tracking] gtag indisponível — conversão de inscrição não enviada');
    return false;
  }

  let dedupKey = '';
  if (transactionId) {
    dedupKey = `${INSCRICAO_DEDUP_PREFIX}${transactionId}`;
    try {
      if (window.sessionStorage?.getItem(dedupKey)) return false;
    } catch {}
  }

  const params = { value, currency };
  if (transactionId) params.transaction_id = transactionId;

  if (email) {
    const hashed = await sha256Hex(email.trim().toLowerCase());
    if (hashed) params.user_data = { sha256_email_address: hashed };
  }

  const tracked = trackConversion(INSCRICAO_CONVERSION_ID, params);
  if (tracked && dedupKey) {
    try {
      window.sessionStorage?.setItem(dedupKey, '1');
    } catch {}
  }
  return tracked;
}

export function trackGoogleAdsContato() {
  return trackConversion(CONTATO_CONVERSION_ID);
}

export function isZeloContactWhatsAppHref(href = '') {
  return href.includes(`wa.me/${ZELO_WHATSAPP_NUMBER}`);
}
