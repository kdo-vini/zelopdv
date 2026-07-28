// Atribuição de aquisição — first touch.
//
// Responde "de onde veio esse cliente". O sistema de indicação (`$lib/referrals/client`)
// já cobre o canal de indicação ponta a ponta; este módulo cobre todo o resto:
// anúncio, orgânico, comparativo, link de contato, boca a boca com link.
//
// First touch e não last touch: quem chega por um anúncio, some por uma semana e
// volta direto pelo domínio foi trazido pelo anúncio. Só grava se ainda não houver
// nada salvo.
//
// Minimização: guardamos host + caminho do referrer, nunca a query string dele —
// ela pode conter termo de busca ou token de outro site. Nada aqui identifica a
// pessoa por si só; a ligação com o usuário acontece só no cadastro.

const STORAGE_KEY = 'zelo_acquisition';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_ID_KEYS = ['gclid', 'fbclid', 'ttclid', 'msclkid'];

/** Referrer reduzido a host + caminho. Retorna '' para acesso direto ou mesmo domínio. */
function safeReferrer() {
  const raw = document.referrer || '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.hostname === window.location.hostname) return '';
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return '';
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Grava a origem da primeira visita, se ainda não houver uma.
 * Idempotente: chamar em toda navegação é seguro.
 * @returns {object|null} a origem armazenada (a antiga, se já existia)
 */
export function captureAcquisitionOrigin() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const existing = readStored();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const origem = {};

  for (const key of [...UTM_KEYS, ...CLICK_ID_KEYS, 'origem']) {
    const value = (params.get(key) || '').trim().slice(0, 120);
    if (value) origem[key] = value;
  }

  const referrer = safeReferrer();
  if (referrer) origem.referrer = referrer.slice(0, 200);

  origem.landing = window.location.pathname.slice(0, 200);
  origem.captured_at = new Date().toISOString();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(origem));
  } catch {
    return origem; // modo privado / storage cheio: segue sem persistir
  }

  return origem;
}

/** Origem salva, ou null. */
export function getStoredAcquisitionOrigin() {
  if (typeof window === 'undefined') return null;
  return readStored();
}

/**
 * Rótulo curto do canal, derivado da origem. É o que responde
 * "de onde veio essa venda" numa linha, sem precisar ler o jsonb inteiro.
 */
export function acquisitionChannel(origem) {
  if (!origem || typeof origem !== 'object') return 'desconhecido';
  if (origem.gclid) return 'google_ads';
  if (origem.fbclid) return 'meta_ads';
  if (origem.utm_source) return String(origem.utm_source).toLowerCase();
  if (origem.origem) return String(origem.origem).toLowerCase();

  const referrer = String(origem.referrer || '');
  if (!referrer) return 'direto';
  if (/google\./.test(referrer)) return 'google_organico';
  if (/(facebook|instagram)\./.test(referrer)) return 'meta_organico';
  if (/(whatsapp|wa\.me)/.test(referrer)) return 'whatsapp';
  return referrer.split('/')[0];
}
