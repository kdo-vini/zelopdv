const GTM_ID = 'GTM-TG5PPGLB';
const GA_MEASUREMENT_ID = 'G-6XMEDGM8H6';
const GOOGLE_ADS_ID = 'AW-17382733965';
const META_PIXEL_ID = '1612234413401838';

let analyticsLoadScheduled = false;

function appendScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
}

function prepareGoogleQueue() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('consent', 'default', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
  window.gtag('config', GA_MEASUREMENT_ID);
  window.gtag('config', GOOGLE_ADS_ID);
}

function prepareMetaQueue() {
  if (window.fbq) return;

  const fbq = function fbq() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };

  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
}

function loadAnalyticsScripts() {
  appendScript(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  appendScript(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);
  appendScript('https://connect.facebook.net/en_US/fbevents.js');
}

/**
 * Keeps tracking calls available immediately, but moves third-party
 * downloads out of the initial render path. Events stay queued until scripts
 * finish loading.
 */
export function initMarketingAnalytics() {
  if (typeof window === 'undefined' || analyticsLoadScheduled) return;

  analyticsLoadScheduled = true;
  prepareGoogleQueue();
  prepareMetaQueue();

  const schedule = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback, { timeout: 4000 })
    : (callback) => window.setTimeout(callback, 2500);

  schedule(loadAnalyticsScripts);
}
