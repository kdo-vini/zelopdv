// Fonte única do número de WhatsApp do Zelo e do helper de link wa.me.
// googleAds.js, SupportChat.svelte, MarketingFooter.svelte e o estado de
// chegada do OnboardingWizard importam daqui em vez de duplicar o número
// (2026-09-15) — antes o mesmo número '5514991537503' estava hardcoded em
// três lugares diferentes.
export const ZELO_WHATSAPP_NUMBER = '5514991537503';

/**
 * Monta um link wa.me para o número do Zelo. Sem texto, devolve o link puro
 * (comportamento idêntico ao usado hoje no rodapé). Com texto, codifica via
 * encodeURIComponent, como o link do SupportChat já fazia manualmente.
 */
export function buildZeloWhatsAppHref(text = '') {
  const base = `https://wa.me/${ZELO_WHATSAPP_NUMBER}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
