// Catálogo único de planos e add-ons. Isomorphic — pode importar no frontend e backend.
// Quando mudar preço, mudar AQUI. Webhook não toca em valores; toggle-addon e create-subscription leem daqui.
//
// stripePriceId: ID do price recorrente no Stripe LIVE. Não muda. Lookup_key é o
// canonical alternative ('zelo_pdv_monthly_v1' etc) — útil pra apontar pra v2 no futuro.

// Duração do teste grátis, em dias. Fonte única: start-trial (trial local sem cartão),
// create-subscription (trial_period_days do Stripe) e a UI de progresso leem daqui.
// 2026-07-27: reduzido de 30 para 14. Mudar aqui exige revisar a cadência de onboarding
// em emailTemplates.js (EMAIL_DAYS) e no cron de onboarding (WHATSAPP_DAYS), que precisam
// caber dentro da janela — disparo agendado depois do fim do trial nunca acontece.
export const TRIAL_DAYS = 14;

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
    allowsAcessos: true,
    allowsMenu: true, // ZeloMenu como addon do ZeloPDV (R$99 = pdv + menu, D-013)
    stripePriceId: 'price_1SO4yvLUJWyE4PkYwoYAYc6h',
    stripeLookupKey: 'zelo_pdv_monthly_v1',
  },
  chat: {
    id: 'chat',
    name: 'ZeloChat',
    tagline: 'Atendimento WhatsApp com IA + cardápio online',
    // R$149 a partir de 2026-07-21 (inclui ZeloMenu, D-014/D-104). Valor EXIBIDO,
    // cobrado no PIX (calculateValue) e no Stripe (2026-07-22: price v2 nunca teve
    // assinante, então o valor foi editado in-place no Stripe pra 149 — mesmo
    // price_id, sem migração de subscription necessária).
    price: 149.00,
    includesPdv: false,
    includesChat: true,
    includesMenu: true, // ZeloChat inclui ZeloMenu obrigatoriamente (D-014)
    allowsMesas: false,
    allowsMenu: false, // já incluso — não é addon comprável
    stripePriceId: 'price_1TlbH2LUJWyE4PkYSqFSXXVY', // v2 — agora R$149 no Stripe
    stripeLookupKey: 'zelo_chat_monthly_v2',
    // Price IDs antigos continuam mapeando p/ 'chat' no webhook de assinantes legados.
    legacyPriceIds: ['price_1TR0xGLUJWyE4PkYcBy0cOoD'], // v1 R$97
  },
  bundle: {
    id: 'bundle',
    name: 'Pacote Gestão + Atendimento',
    tagline: 'ZeloPDV (gestão completa) + ZeloChat (atendimento com IA) + ZeloMenu',
    // R$198 a partir de 2026-07-21 (D-104). Valor EXIBIDO, cobrado no PIX e no
    // Stripe (2026-07-22: price v2 sem assinante, editado in-place pra 198 —
    // mesmo price_id). O price v1 R$147 (legacyPriceIds) NÃO foi tocado —
    // é o da Casa dos Salgados, grandfathered.
    price: 198.00,
    includesPdv: true,
    includesChat: true,
    includesMenu: true,
    allowsMesas: true,
    allowsAcessos: true,
    allowsMenu: false, // já incluso
    bundleSavings: 10.00, // pdv 59 + chat 149 = 208 → bundle 198
    stripePriceId: 'price_1TlbH2LUJWyE4PkYlS4IxMhs', // v2 — agora R$198 no Stripe
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
export const VALID_ADDONS = Object.keys(ADDONS);

// Reverse lookups: stripe price_id → plan_tier or addon_id. Webhook usa pra mapear items recebidos.
//
// 2026-07-28: o add-on "Pedidos + Cozinha" (`price_1TTjDcLUJWyE4PkYbHDHq9gw`) foi
// aposentado e saiu deste catálogo — a capacidade vive no ZeloMenu. Se um webhook
// ainda chegar com esse price, `parseStripeSubscriptionItems` ignora o item (não
// vira plan nem addon) e `computeStripeMonthlyValueCents` continua somando o
// `unit_amount` real, então o MRR persistido não é afetado.
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

// Soma unit_amount x quantity de todos os itens de uma Stripe subscription
// (plano + add-ons) — valor REAL cobrado, pra gravar em
// subscriptions.monthly_value_cents (MRR exato, não estimado por plan_tier).
// Retorna null se os itens não vierem com price expandido (sem unit_amount) —
// nesse caso o chamador não deve sobrescrever o valor já gravado.
export function computeStripeMonthlyValueCents(items) {
  let total = 0;
  let sawAny = false;
  for (const item of items || []) {
    const unitAmount = item?.price?.unit_amount;
    if (typeof unitAmount !== 'number') continue;
    total += unitAmount * (item?.quantity || 1);
    sawAny = true;
  }
  return sawAny ? total : null;
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
