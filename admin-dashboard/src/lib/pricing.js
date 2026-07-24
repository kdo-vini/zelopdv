// Espelho de src/lib/pricing.js do app principal. Manter sincronizado.
// Quando preço mudar, mudar nos DOIS arquivos.
//
// ATENÇÃO — subscriptionValue()/calculateValue() usam o preço ATUAL do plano
// pra estimar o valor de CADA assinatura, não o valor realmente cobrado dela
// no Stripe. Clientes grandfathered num price antigo (ex.: Casa dos Salgados,
// bundle real R$147) aparecem no MRR pelo preço de tabela atual (R$198), não
// pelo que ela paga de fato. É uma estimativa, não o valor faturado real.

export const PLANS = {
  pdv: {
    id: 'pdv',
    name: 'ZeloPDV',
    price: 59.00,
    includesPdv: true,
    includesChat: false,
    includesMenu: false,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    allowsMenu: true,
    stripePriceId: 'price_1SO4yvLUJWyE4PkYwoYAYc6h',
  },
  chat: {
    id: 'chat',
    name: 'ZeloChat',
    price: 149.00, // v2 — R$149 a partir de 2026-07-22 (inclui ZeloMenu)
    includesPdv: false,
    includesChat: true,
    includesMenu: true,
    allowsMesas: false,
    allowsPedidos: false,
    allowsAcessos: false,
    allowsMenu: false,
    stripePriceId: 'price_1TlbH2LUJWyE4PkYSqFSXXVY',
  },
  bundle: {
    id: 'bundle',
    name: 'Pacote Gestão + Atendimento',
    price: 198.00, // v2 — R$198 a partir de 2026-07-22
    includesPdv: true,
    includesChat: true,
    includesMenu: true,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    allowsMenu: false,
    stripePriceId: 'price_1TlbH2LUJWyE4PkYlS4IxMhs',
  },
};

export const ADDONS = {
  mesas: {
    id: 'mesas',
    name: 'Módulo Mesas',
    price: 30.00,
    requiresFlag: 'allowsMesas',
    stripePriceId: 'price_1TR0xHLUJWyE4PkYlvTgAub7',
  },
  pedidos: {
    id: 'pedidos',
    name: 'Pedidos + Cozinha',
    price: 30.00,
    requiresFlag: 'allowsPedidos',
    stripePriceId: 'price_1TTjDcLUJWyE4PkYbHDHq9gw',
    deprecated: true,
  },
  acessos: {
    id: 'acessos',
    name: 'Controle de Acessos',
    price: 30.00,
    requiresFlag: 'allowsAcessos',
    stripePriceId: 'price_1TWMi0LUJWyE4PkYQl4rBlQs',
  },
  menu: {
    id: 'menu',
    name: 'ZeloMenu',
    price: 40.00,
    requiresFlag: 'allowsMenu',
    stripePriceId: 'price_1TlbH4LUJWyE4PkYX0kdJhAw',
  },
};

export const VALID_PLAN_TIERS = Object.keys(PLANS);
// Pedidos permanece no catalogo apenas para compatibilidade com a flag legada;
// nao e mais um item cobrado desde que passou a fazer parte do ZeloMenu.
export const VALID_ADDONS = Object.values(ADDONS)
  .filter((addon) => !addon.deprecated)
  .map((addon) => addon.id);

export function isAddonAllowed(planTier, addonId) {
  const plan = PLANS[planTier];
  const addon = ADDONS[addonId];
  if (!plan || !addon) return false;
  return plan[addon.requiresFlag] === true;
}

export function calculateValue(planTier, addons = {}) {
  const plan = PLANS[planTier];
  if (!plan) return 0;
  let total = plan.price;
  for (const addonId of VALID_ADDONS) {
    if (addons[addonId] && isAddonAllowed(planTier, addonId)) {
      total += ADDONS[addonId].price;
    }
  }
  return Math.round(total * 100) / 100;
}

export function subscriptionValue(sub) {
  if (!sub) return 0;
  // Preferir o valor REAL cobrado (gravado pelo webhook Stripe/fluxo Pix).
  // Sem isso, cliente grandfathered num price antigo aparece pelo preço de
  // tabela atual, não pelo que ele de fato paga.
  if (sub.monthly_value_cents != null) {
    return Math.round(Number(sub.monthly_value_cents)) / 100;
  }
  const tier = sub.plan_tier || 'pdv';
  return calculateValue(tier, {
    mesas: !!sub.has_mesas_addon,
    acessos: !!sub.has_acessos_addon,
    menu: !!sub.has_zelo_menu,
  });
}

export function planLabel(tier) {
  return PLANS[tier]?.name || tier || 'PDV';
}
