// Navegadores embutidos de app (Instagram, Facebook, TikTok...). O Google
// bloqueia OAuth dentro deles (`disallowed_useragent`), e ~90% do tráfego mobile
// da home chega pelo navegador do Instagram via anúncio. Quem toca em
// "Continuar com Google" ali cai numa tela de erro do Google e desiste.

const IN_APP_PATTERNS = [
  ['instagram', /Instagram/i],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS/],
  ['tiktok', /musical_ly|BytedanceWebview|TikTok/i],
  ['linkedin', /LinkedInApp/i],
  // WebView genérico do Android (`; wv)`): o Google também recusa.
  ['webview', /;\s?wv\)/],
];

/** Nome do app hospedeiro, ou null quando é um navegador de verdade. */
export function detectInAppBrowser(userAgent = '') {
  const ua = String(userAgent || '');
  for (const [name, pattern] of IN_APP_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

export function isAndroidUserAgent(userAgent = '') {
  return /Android/i.test(String(userAgent || ''));
}

/**
 * Link `intent://` que tira o visitante do WebView e abre a mesma URL no
 * Chrome; sem Chrome instalado, o Android segue o fallback no navegador padrão.
 */
export function buildAndroidBrowserIntent(href) {
  const url = new URL(href);
  const target = `${url.host}${url.pathname}${url.search}`;
  return `intent://${target}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

export const IN_APP_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  webview: 'aplicativo',
};
