import { describe, expect, it } from 'vitest';
import {
  buildAndroidBrowserIntent,
  detectInAppBrowser,
  isAndroidUserAgent,
} from '../src/lib/inAppBrowser.js';

const IG_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,3; iOS 18_5; pt_BR; pt; scale=3.00; 1290x2796; 758123519)';
const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.143 Mobile Safari/537.36 Instagram 395.0.0.0.77 Android (34/14; 450dpi; 1080x2340; samsung; SM-A155M; a15; mt6789; pt_BR; 791234567)';
const FB_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.107;FBBV/123;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBLC/pt_BR]';
const GENERIC_WV = 'Mozilla/5.0 (Linux; Android 13; moto g54; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

describe('detectInAppBrowser', () => {
  it('identifica o navegador do Instagram no iOS e no Android', () => {
    expect(detectInAppBrowser(IG_IOS)).toBe('instagram');
    expect(detectInAppBrowser(IG_ANDROID)).toBe('instagram');
  });

  it('identifica Facebook e WebView genérico do Android', () => {
    expect(detectInAppBrowser(FB_IOS)).toBe('facebook');
    expect(detectInAppBrowser(GENERIC_WV)).toBe('webview');
  });

  it('não marca navegadores de verdade', () => {
    expect(detectInAppBrowser(CHROME_ANDROID)).toBeNull();
    expect(detectInAppBrowser(SAFARI_IOS)).toBeNull();
    expect(detectInAppBrowser('')).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });
});

describe('isAndroidUserAgent', () => {
  it('distingue Android de iOS', () => {
    expect(isAndroidUserAgent(IG_ANDROID)).toBe(true);
    expect(isAndroidUserAgent(IG_IOS)).toBe(false);
  });
});

describe('buildAndroidBrowserIntent', () => {
  it('reabre a mesma URL no Chrome com fallback para o navegador padrão', () => {
    const intent = buildAndroidBrowserIntent('https://www.zelopdv.com.br/cadastro?utm_source=ig&ref=abc');
    expect(intent).toBe(
      'intent://www.zelopdv.com.br/cadastro?utm_source=ig&ref=abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.zelopdv.com.br%2Fcadastro%3Futm_source%3Dig%26ref%3Dabc;end',
    );
  });
});
