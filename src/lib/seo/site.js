// Fonte única de fatos de SEO/GEO (generative-engine optimization) sobre o
// produto e a empresa. Isomorphic — sem imports de $env, pode rodar no
// servidor (rotas prerenderizadas) e no cliente (JSON-LD em páginas).
//
// Preços, dias de trial e listas de planos/add-ons NÃO são duplicados aqui —
// sempre derivados de $lib/pricing (PLANS/ADDONS/TRIAL_DAYS), que é a fonte
// canônica (ver CLAUDE.md).

// Import relativo (não $lib) de propósito: este módulo é importado por
// scripts/*.mjs via node puro (ex.: scripts/generate-blog-images.mjs, através
// de src/lib/blog/images.js), que não resolve o alias $lib do Vite.
import { ADDONS, PLANS, TRIAL_DAYS } from '../pricing.js';

export const SITE_URL = 'https://zelopdv.com.br';
export const SITE_NAME = 'Zelo PDV';

// Default de compartilhamento social (Open Graph / Twitter Card) usado pelo
// componente SocialMeta.svelte quando uma rota não define título/descrição/
// imagem próprios. src/app.html não tem mais essas tags por padrão — cada
// rota pública deve renderizar <SocialMeta> (ou seu próprio og:* manual) para
// não duplicar as tags no <head>.
export const DEFAULT_SOCIAL = {
  title: 'Zelo PDV — Sistema de Gestão para Pequenos Negócios',
  description: `Frente de caixa ágil, controle de fiado e gestão financeira em um só lugar. Teste grátis por ${TRIAL_DAYS} dias, sem cartão.`,
  image: '/og-image.png',
  imageWidth: 1200,
  imageHeight: 630
};

// Dados da empresa por trás do Zelo PDV. Hoje vivem hardcoded em
// MarketingFooter.svelte e src/routes/+page.svelte — este módulo é a fonte
// única e os dois locais devem consumir daqui.
export const ORGANIZATION = {
  brand: 'Téchne Sistemas',
  legalName: 'Techne Sistemas Tecnologia Da Informacao Ltda',
  cnpj: '65.679.798/0001-95',
  url: SITE_URL,
  parentUrl: 'https://techneia.com.br',
  logo: `${SITE_URL}/favicon.png`,
  instagram: 'https://instagram.com/techne.ia',
  whatsappPhone: '+55-14-99153-7503'
};

/**
 * Monta uma URL absoluta a partir de um path relativo ('/vs-saipos', '#mesas', etc).
 * @param {string} [path]
 * @returns {string}
 */
export function absoluteUrl(path = '') {
  if (!path) return SITE_URL;
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith('/') || path.startsWith('#') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

/**
 * Formata um valor numérico como moeda brasileira (R$ 59,00).
 * @param {number} value
 * @returns {string}
 */
export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);
}

// priceValidUntil computado (não literal): fim do próximo ano civil a partir
// da data de build, para não deixar uma data fixa esquecida no código.
function computePriceValidUntil() {
  const now = new Date();
  const year = now.getUTCFullYear() + 1;
  return `${year}-12-31`;
}

export const PRICE_VALID_UNTIL = computePriceValidUntil();

/**
 * @typedef {{ '@type': 'Offer', name: string, price: string, priceCurrency: string, description?: string, priceValidUntil: string, url: string, category: string }} SchemaOffer
 */

/**
 * Monta a lista de Offers (um por plano + um por add-on) a partir do
 * catálogo canônico em pricing.js.
 * @returns {SchemaOffer[]}
 */
function buildOffers() {
  const planOffers = Object.values(PLANS).map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    price: plan.price.toFixed(2),
    priceCurrency: 'BRL',
    description: plan.tagline,
    priceValidUntil: PRICE_VALID_UNTIL,
    url: SITE_URL,
    category: 'plan'
  }));

  const addonOffers = Object.values(ADDONS).map((addon) => ({
    '@type': 'Offer',
    name: addon.name,
    price: addon.price.toFixed(2),
    priceCurrency: 'BRL',
    description: addon.tagline,
    priceValidUntil: PRICE_VALID_UNTIL,
    url: `${SITE_URL}/extensoes`,
    category: 'addon'
  }));

  return [...planOffers, ...addonOffers];
}

/**
 * Organization JSON-LD, derivado de ORGANIZATION.
 * @returns {object}
 */
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORGANIZATION.brand,
    legalName: ORGANIZATION.legalName,
    url: SITE_URL,
    logo: ORGANIZATION.logo,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: ORGANIZATION.whatsappPhone,
      availableLanguage: 'Portuguese',
      contactOption: 'TollFree'
    },
    sameAs: [ORGANIZATION.instagram],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'BR'
    }
  };
}

/**
 * SoftwareApplication JSON-LD com offers derivadas de PLANS/ADDONS.
 * @param {{ description?: string, extra?: object }} [options]
 * @returns {object}
 */
export function buildSoftwareApplicationSchema({ description, extra } = {}) {
  const offers = buildOffers();
  const prices = offers.map((offer) => Number(offer.price));
  const lowPrice = Math.min(...prices).toFixed(2);
  const highPrice = Math.max(...prices).toFixed(2);

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web Browser',
    description:
      description ||
      'Sistema de gestão e frente de caixa para pequenos negócios de alimentação.',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice,
      highPrice,
      priceCurrency: 'BRL',
      offerCount: offers.length,
      offers
    },
    ...(extra || {})
  };
}

/**
 * FAQPage JSON-LD genérico a partir de uma lista { question, answer }[].
 * @param {{ question: string, answer: string }[]} items
 * @returns {object}
 */
export function buildFaqSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (items || []).map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}

export { TRIAL_DAYS };
