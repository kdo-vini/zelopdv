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
    includesMenu: false,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    allowsMenu: true, // ZeloMenu como addon do ZeloPDV (R$99 = pdv + menu, D-013)
    stripePriceId: 'price_1SO4yvLUJWyE4PkYwoYAYc6h',
    stripeLookupKey: 'zelo_pdv_monthly_v1',
  },
  chat: {
    id: 'chat',
    name: 'ZeloChat',
    tagline: 'Atendimento WhatsApp com IA + cardápio online',
    // R$149 a partir de 2026-07-21 (inclui ZeloMenu, D-014/D-104). Este é o valor
    // EXIBIDO e o cobrado no PIX (calculateValue). ATENÇÃO: o stripePriceId abaixo
    // ainda aponta para o price v2 R$147 — o cartão cobra 147 até criar o price
    // R$149 no Stripe e trocar aqui. Descasamento temporário conhecido.
    price: 149.00,
    includesPdv: false,
    includesChat: true,
    includesMenu: true, // ZeloChat inclui ZeloMenu obrigatoriamente (D-014)
    allowsMesas: false,
    allowsPedidos: false,
    allowsMenu: false, // já incluso — não é addon comprável
    stripePriceId: 'price_1TlbH2LUJWyE4PkYSqFSXXVY', // v2 R$147 — atualizar p/ price R$149 quando a conta Stripe permitir
    stripeLookupKey: 'zelo_chat_monthly_v2',
    // Price IDs antigos continuam mapeando p/ 'chat' no webhook de assinantes legados.
    legacyPriceIds: ['price_1TR0xGLUJWyE4PkYcBy0cOoD'], // v1 R$97
  },
  bundle: {
    id: 'bundle',
    name: 'Pacote Gestão + Atendimento',
    tagline: 'ZeloPDV (gestão completa) + ZeloChat (atendimento com IA) + ZeloMenu',
    // R$198 a partir de 2026-07-21 (D-104). Valor EXIBIDO e cobrado no PIX.
    // ATENÇÃO: stripePriceId ainda é o v2 R$197 — cartão cobra 197 até trocar.
    price: 198.00,
    includesPdv: true,
    includesChat: true,
    includesMenu: true,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    allowsMenu: false, // já incluso
    bundleSavings: 10.00, // pdv 59 + chat 149 = 208 → bundle 198
    stripePriceId: 'price_1TlbH2LUJWyE4PkYlS4IxMhs', // v2 R$197 — atualizar p/ price R$198 quando a conta Stripe permitir
    stripeLookupKey: 'zelo_bundle_monthly_v2',
    legacyPriceIds: ['price_1TR0xGLUJWyE4PkYY0DMOWLI'], // v1 R$147
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
  pedidos: {
    id: 'pedidos',
    name: 'Pedidos + Cozinha (legado)',
    tagline: 'Entitlement legado migrado para ZeloMenu',
    price: 30.00,
    requiresFlag: 'allowsPedidos',
    stripePriceId: 'price_1TTjDcLUJWyE4PkYbHDHq9gw',
    stripeLookupKey: 'zelo_addon_pedidos_monthly_v1',
    deprecated: true,
  },
  acessos: {
    id: 'acessos',
    name: 'Controle de Acessos',
    tagline: 'Subusuários com cargos e permissões',
    price: 30.00,
    requiresFlag: 'allowsAcessos',
    stripePriceId: 'price_1TWMi0LUJWyE4PkYQl4rBlQs',
    stripeLookupKey: 'zelo_addon_acessos_monthly_v1',
  },
  menu: {
    id: 'menu',
    name: 'ZeloMenu',
    tagline: 'Cardápio online integrado ao seu PDV',
    price: 40.00, // pdv (59) + menu (40) = R$99 (D-013)
    requiresFlag: 'allowsMenu',
    setsEntitlement: 'has_zelo_menu', // webhook liga has_zelo_menu quando este addon está presente
    stripePriceId: 'price_1TlbH4LUJWyE4PkYX0kdJhAw',
    stripeLookupKey: 'zelo_addon_menu_monthly_v1',
  },
};

export const VALID_PLAN_TIERS = Object.keys(PLANS);
// Pedidos/Cozinha is now included in ZeloMenu. Keep its legacy Stripe mapping
// above so existing subscriptions remain recognized, but never sell it again.
export const VALID_ADDONS = Object.values(ADDONS)
  .filter((addon) => !addon.deprecated)
  .map((addon) => addon.id);

// Reverse lookups: stripe price_id → plan_tier or addon_id. Webhook usa pra mapear items recebidos.
// IMPORTANTE: inclui legacyPriceIds para que assinantes em price IDs antigos (v1)
// continuem mapeando pro plano certo depois da virada de preço (D-104). Remover um
// price antigo daqui quebraria o webhook de quem ainda está nele.
export const STRIPE_PRICE_TO_PLAN = Object.fromEntries(
  Object.values(PLANS).flatMap((p) => [
    [p.stripePriceId, p.id],
    ...(p.legacyPriceIds || []).map((legacyId) => [legacyId, p.id]),
  ]),
);
export const STRIPE_PRICE_TO_ADDON = Object.fromEntries(
  Object.values(ADDONS).flatMap((a) => [
    [a.stripePriceId, a.id],
    ...(a.legacyPriceIds || []).map((legacyId) => [legacyId, a.id]),
  ]),
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
  if (!plan || !addon || addon.deprecated) return false;
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
// addons: { mesas: boolean, pedidos: boolean, ... }
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
