// Seleção de plano + add-ons do wizard de assinatura, como funções puras.
//
// Por que isto existe fora do `+page.svelte`: a tela guardava a seleção em três
// booleans (`mesasAddonOn`, `acessosAddonOn`, `menuAddonOn`) e um bloco reativo
// desligava o add-on quando o plano escolhido não o permitia. Esse desligamento
// era DESTRUTIVO e de mão única — trocar `pdv` (com ZeloMenu) por `bundle` e
// voltar pra `pdv` deixava o ZeloMenu desmarcado sem aviso, e o pacote de R$99
// virava R$59 no resumo e no checkout.
//
// Aqui a intenção do usuário (`desired`) fica separada do que é cobrável no
// plano atual (`addons`). O que o plano não permite é SUPRIMIDO, nunca apagado,
// e volta sozinho quando o plano volta a permitir.

import { ADDONS, PLANS, VALID_ADDONS, calculateValue, isAddonAllowed } from '../pricing.js';

/** Capacidades que o cliente enxerga como "tenho isso ativo". */
export const ENTITLEMENTS = Object.freeze(['pdv', 'chat', 'menu', 'mesas', 'acessos']);

const ENTITLEMENT_LABELS = Object.freeze({
  pdv: 'ZeloPDV',
  chat: 'ZeloChat',
  menu: ADDONS.menu.name,
  mesas: ADDONS.mesas.name,
  acessos: ADDONS.acessos.name,
});

export function entitlementLabel(id) {
  return ENTITLEMENT_LABELS[id] || id;
}

function emptyAddons() {
  return VALID_ADDONS.reduce((acc, id) => ({ ...acc, [id]: false }), {});
}

/**
 * Normaliza a intenção do usuário para um plano.
 *
 * @param {{ planTier: string, desired?: Record<string, boolean> }} input
 * @returns {{ addons: Record<string, boolean>, suppressed: string[] }}
 *   `addons` é o que entra no preço e nos line items; `suppressed` são os
 *   add-ons que o usuário quer mas o plano atual não vende (porque já inclui,
 *   ou porque é incompatível) — usados só para explicar a tela.
 */
export function resolveSelection({ planTier, desired = {} }) {
  if (!PLANS[planTier]) return { addons: emptyAddons(), suppressed: [] };

  const addons = emptyAddons();
  const suppressed = [];
  for (const id of VALID_ADDONS) {
    if (!desired[id]) continue;
    if (isAddonAllowed(planTier, id)) addons[id] = true;
    else suppressed.push(id);
  }
  return { addons, suppressed };
}

/** Preço mensal do plano com a intenção atual aplicada. */
export function selectionPrice({ planTier, desired = {} }) {
  if (!PLANS[planTier]) return 0;
  return calculateValue(planTier, resolveSelection({ planTier, desired }).addons);
}

/**
 * Capacidades efetivas de um pacote. Espelha `subscriptionIncludesMenu` de
 * guards.js: chat/bundle incluem ZeloMenu por política de produto (D-014),
 * então `menu: false` num bundle NÃO significa perda de cardápio.
 *
 * @param {string} planTier
 * @param {Record<string, boolean>} addons
 */
export function resolveEntitlements(planTier, addons = {}) {
  const plan = PLANS[planTier];
  if (!plan) return ENTITLEMENTS.reduce((acc, id) => ({ ...acc, [id]: false }), {});

  return {
    pdv: !!plan.includesPdv,
    chat: !!plan.includesChat,
    menu: !!plan.includesMenu || (!!plan.allowsMenu && !!addons.menu),
    mesas: !!plan.allowsMesas && !!addons.mesas,
    acessos: !!plan.allowsAcessos && !!addons.acessos,
  };
}

/** Capacidades da linha persistida em `subscriptions`. */
export function entitlementsFromSubscription(subscription) {
  if (!subscription) return resolveEntitlements(null);
  return resolveEntitlements(subscription.plan_tier || 'pdv', {
    mesas: !!subscription.has_mesas_addon,
    acessos: !!subscription.has_acessos_addon,
    menu: !!subscription.has_zelo_menu,
  });
}

/**
 * O que o cliente tem hoje e perde se pagar a seleção atual.
 * @returns {string[]} ids em ordem estável
 */
export function lostEntitlements(before, after) {
  return ENTITLEMENTS.filter((id) => !!before?.[id] && !after?.[id]);
}
