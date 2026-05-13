// Espelho de src/lib/pricing.js do app principal. Manter sincronizado.
// Quando preço mudar, mudar nos DOIS arquivos.

export const PLANS = {
  pdv: {
    id: 'pdv',
    name: 'ZeloPDV',
    price: 59.00,
    includesPdv: true,
    includesChat: false,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    stripePriceId: 'price_1SO4yvLUJWyE4PkYwoYAYc6h',
  },
  chat: {
    id: 'chat',
    name: 'ZeloChat',
    price: 97.00,
    includesPdv: false,
    includesChat: true,
    allowsMesas: false,
    allowsPedidos: false,
    allowsAcessos: false,
    stripePriceId: 'price_1TR0xGLUJWyE4PkYcBy0cOoD',
  },
  bundle: {
    id: 'bundle',
    name: 'Pacote Gestão + Atendimento',
    price: 147.00,
    includesPdv: true,
    includesChat: true,
    allowsMesas: true,
    allowsPedidos: true,
    allowsAcessos: true,
    stripePriceId: 'price_1TR0xGLUJWyE4PkYY0DMOWLI',
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
  },
  acessos: {
    id: 'acessos',
    name: 'Controle de Acessos',
    price: 30.00,
    requiresFlag: 'allowsAcessos',
    stripePriceId: 'price_1TWMi0LUJWyE4PkYQl4rBlQs',
  },
};

export const VALID_PLAN_TIERS = Object.keys(PLANS);
export const VALID_ADDONS = Object.keys(ADDONS);

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
  const tier = sub.plan_tier || 'pdv';
  return calculateValue(tier, {
    mesas: !!sub.has_mesas_addon,
    pedidos: !!sub.has_pedidos_addon,
    acessos: !!sub.has_acessos_addon,
  });
}

export function planLabel(tier) {
  return PLANS[tier]?.name || tier || 'PDV';
}
