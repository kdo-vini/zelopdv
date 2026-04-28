// Catálogo único de planos e add-ons. Isomorphic — pode importar no frontend e backend.
// Quando mudar preço, mudar AQUI. Webhook não toca em valores; toggle-addon e create-subscription leem daqui.
//
// stripePriceId: ID do price recorrente no Stripe LIVE. Não muda. Lookup_key é o
// canonical alternative ('zelo_pdv_monthly_v1' etc) — útil pra apontar pra v2 no futuro.

export const PLANS = {
  pdv: {
    id: 'pdv',
    name: 'ZeloPDV',
    tagline: 'PDV simples + estoque + financeiro',
    price: 59.00,
    includesPdv: true,
    includesChat: false,
    allowsMesas: true,
    stripePriceId: 'price_1SO4yvLUJWyE4PkYwoYAYc6h',
    stripeLookupKey: 'zelo_pdv_monthly_v1',
  },
  chat: {
    id: 'chat',
    name: 'ZeloChat',
    tagline: 'Atendimento WhatsApp com IA',
    price: 97.00,
    includesPdv: false,
    includesChat: true,
    allowsMesas: false,
    stripePriceId: 'price_1TR0xGLUJWyE4PkYcBy0cOoD',
    stripeLookupKey: 'zelo_chat_monthly_v1',
  },
  bundle: {
    id: 'bundle',
    name: 'Pacote Gestão + Atendimento',
    tagline: 'ZeloPDV (gestão completa) + ZeloChat (atendimento com IA)',
    price: 147.00,
    includesPdv: true,
    includesChat: true,
    allowsMesas: true,
    bundleSavings: 9.00,
    stripePriceId: 'price_1TR0xGLUJWyE4PkYY0DMOWLI',
    stripeLookupKey: 'zelo_bundle_monthly_v1',
  },
};

export const ADDONS = {
  mesas: {
    id: 'mesas',
    name: 'Módulo Mesas',
    tagline: 'Mesas, comandas e divisão de conta',
    price: 30.00,
    requiresFlag: 'allowsMesas',
    stripePriceId: 'price_1TR0xHLUJWyE4PkYlvTgAub7',
    stripeLookupKey: 'zelo_addon_mesas_monthly_v1',
  },
};

export const VALID_PLAN_TIERS = Object.keys(PLANS);
export const VALID_ADDONS = Object.keys(ADDONS);

// Reverse lookups: stripe price_id → plan_tier or addon_id. Webhook usa pra mapear items recebidos.
export const STRIPE_PRICE_TO_PLAN = Object.fromEntries(
  Object.values(PLANS).map((p) => [p.stripePriceId, p.id]),
);
export const STRIPE_PRICE_TO_ADDON = Object.fromEntries(
  Object.values(ADDONS).map((a) => [a.stripePriceId, a.id]),
);

export function getPlan(tier) {
  return PLANS[tier] || null;
}

export function isValidPlanTier(tier) {
  return VALID_PLAN_TIERS.includes(tier);
}

export function isAddonAllowed(planTier, addonId) {
  const plan = PLANS[planTier];
  const addon = ADDONS[addonId];
  if (!plan || !addon) return false;
  return plan[addon.requiresFlag] === true;
}

export function calculateValue(planTier, addons = {}) {
  const plan = PLANS[planTier];
  if (!plan) throw new Error(`Plano inválido: ${planTier}`);

  let total = plan.price;
  for (const addonId of VALID_ADDONS) {
    if (addons[addonId] && isAddonAllowed(planTier, addonId)) {
      total += ADDONS[addonId].price;
    }
  }
  return Math.round(total * 100) / 100;
}

export function sanitizeAddons(planTier, addons = {}) {
  const out = {};
  for (const addonId of VALID_ADDONS) {
    if (addons[addonId] && isAddonAllowed(planTier, addonId)) {
      out[addonId] = true;
    } else {
      out[addonId] = false;
    }
  }
  return out;
}

// Constrói a lista de line_items pro Stripe Checkout / subscription.update
// addons: { mesas: boolean, ... }
export function buildStripeLineItems(planTier, addons = {}) {
  const plan = PLANS[planTier];
  if (!plan) throw new Error(`Plano inválido: ${planTier}`);
  const items = [{ price: plan.stripePriceId, quantity: 1 }];
  for (const addonId of VALID_ADDONS) {
    if (addons[addonId] && isAddonAllowed(planTier, addonId)) {
      items.push({ price: ADDONS[addonId].stripePriceId, quantity: 1 });
    }
  }
  return items;
}

// Inverso: dado os items de uma Stripe subscription, retorna { planTier, addons }
export function parseStripeSubscriptionItems(items) {
  let planTier = null;
  const addons = {};
  for (const item of items || []) {
    const priceId = item?.price?.id || item?.price;
    if (STRIPE_PRICE_TO_PLAN[priceId]) {
      planTier = STRIPE_PRICE_TO_PLAN[priceId];
    } else if (STRIPE_PRICE_TO_ADDON[priceId]) {
      addons[STRIPE_PRICE_TO_ADDON[priceId]] = true;
    }
  }
  return { planTier, addons };
}
