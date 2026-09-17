// Pure presentation state machine for the self-service iFood setup wizard
// (`Perfil > Integrações`). No `fetch`, no Supabase, no SvelteKit — every
// function here only reads the shape already returned by
// `src/lib/server/ifood/connectionService.js` (via
// `GET/POST /api/integrations/ifood/connection`,
// `GET/POST /api/integrations/ifood/authorization` and
// `GET /api/integrations/ifood/health`) and derives what the UI should show.
//
// Deliberately stateless: the wizard step is always recomputed from the
// latest API response, never from a locally-remembered "step index". A
// browser refresh mid-authorization must land on the exact same screen —
// this is what makes that true, since there is nothing else to lose.

export const IFOOD_WIZARD_STATES = Object.freeze([
  'not_connected',
  'awaiting_authorization',
  'configuration_needed',
  'active',
  'attention',
  'paused'
]);

export const IFOOD_STATE_LABELS = Object.freeze({
  not_connected: 'Não conectado',
  awaiting_authorization: 'Aguardando autorização no iFood',
  configuration_needed: 'Configuração necessária',
  active: 'Ativo',
  attention: 'Atenção necessária',
  paused: 'Pausado'
});

export const IFOOD_PRINT_OWNER_LABELS = Object.freeze({
  zelo: 'Zelo PDV',
  external: 'Gestor de Pedidos / sistema externo'
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * `connection` is the sanitized snapshot from
 * `GET /api/integrations/ifood/connection`:
 * `{ status, merchantId, printOwner, authorization }`, where `authorization`
 * is itself the object `GET/POST /api/integrations/ifood/authorization`
 * returns (`{ status: 'pending'|'expired'|..., state?, authorizationUrl?,
 * expiresAt? }`).
 *
 * `health` is the sanitized snapshot from
 * `GET /api/integrations/ifood/health` (`{ healthy, reasons }`) — optional;
 * omitting it treats an `active` connection as healthy so the card can
 * render immediately after the status call, before the health call resolves.
 */
export function deriveIfoodWizardState({ connection, health } = {}) {
  const status = connection?.status ?? 'not_connected';
  const merchantId = connection?.merchantId ?? null;
  const printOwner = connection?.printOwner ?? null;

  if (!connection || status === 'not_connected' || status === 'revoked') {
    return {
      state: 'not_connected',
      label: IFOOD_STATE_LABELS.not_connected,
      merchantId: null,
      printOwner: null,
      reasons: []
    };
  }

  if (status === 'pending') {
    const authorization = connection.authorization ?? null;
    const expired = authorization?.status === 'expired';
    return {
      state: 'awaiting_authorization',
      label: IFOOD_STATE_LABELS.awaiting_authorization,
      merchantId,
      printOwner,
      expired,
      authorizationUrl: authorization?.authorizationUrl ?? null,
      authorizationState: authorization?.state ?? null,
      expiresAt: authorization?.expiresAt ?? null,
      reasons: []
    };
  }

  if (status === 'paused') {
    return {
      state: 'paused',
      label: IFOOD_STATE_LABELS.paused,
      merchantId,
      printOwner,
      reasons: []
    };
  }

  if (status === 'degraded') {
    return {
      state: 'attention',
      label: IFOOD_STATE_LABELS.attention,
      merchantId,
      printOwner,
      reasons: Array.isArray(health?.reasons) ? health.reasons : []
    };
  }

  if (status === 'active') {
    // No health snapshot yet (still loading) is treated as healthy so the
    // card renders "Ativo" immediately; a later health response can still
    // downgrade the same connection object to "Configuração necessária"
    // without a full status refetch.
    const healthy = health ? health.healthy !== false : true;
    if (!healthy) {
      return {
        state: 'configuration_needed',
        label: IFOOD_STATE_LABELS.configuration_needed,
        merchantId,
        printOwner,
        reasons: Array.isArray(health?.reasons) ? health.reasons : []
      };
    }
    return {
      state: 'active',
      label: IFOOD_STATE_LABELS.active,
      merchantId,
      printOwner,
      reasons: []
    };
  }

  // Unknown/unmapped status: fail closed to "not connected" rather than
  // guessing an operational state the backend never promised.
  return {
    state: 'not_connected',
    label: IFOOD_STATE_LABELS.not_connected,
    merchantId: null,
    printOwner: null,
    reasons: []
  };
}

/**
 * Which actions make sense to offer for a derived wizard state. Pure
 * capability list — the caller still owns permission/eligibility gating
 * (already enforced server-side by `connectionService.js`).
 */
export function availableIfoodActions(derived) {
  switch (derived?.state) {
    case 'not_connected':
      return ['connect'];
    case 'awaiting_authorization':
      return derived.expired ? ['restart'] : ['check_authorization', 'restart'];
    case 'configuration_needed':
    case 'active':
      return ['set_print_owner', 'pause', 'disconnect'];
    case 'attention':
      return ['set_print_owner', 'pause', 'disconnect'];
    case 'paused':
      return ['resume', 'disconnect'];
    default:
      return [];
  }
}

const CONNECTION_ERROR_MESSAGES = Object.freeze({
  invalid_merchant_id: 'Informe o identificador da loja no iFood (Merchant ID) para continuar.',
  connection_already_exists: 'Já existe uma loja conectada. Desconecte-a antes de conectar outra.',
  merchant_already_connected: 'Essa loja do iFood já está conectada em outra conta ZeloPDV.',
  connection_not_pending: 'Essa autorização já foi concluída ou não está mais em andamento. Atualize a página.',
  authorization_expired: 'O prazo para concluir a autorização expirou. Reinicie a conexão.',
  invalid_state: 'Não foi possível confirmar a autorização. Reinicie a conexão e tente novamente.',
  active_orders_present: 'Existem pedidos em andamento neste merchant. Finalize-os antes de pausar ou desconectar.',
  invalid_action: 'Ação inválida.',
  invalid_print_owner: 'Escolha quem imprime: Zelo PDV ou o sistema externo.',
  connection_revoked: 'Esta conexão já foi desconectada. Conecte novamente para reativar.',
  not_connected: 'Nenhuma loja conectada ainda.',
  subscription_required: 'Seu plano ou período de teste precisa estar ativo para usar a integração com o iFood.',
  forbidden: 'Você não tem permissão para gerenciar a integração com o iFood. Fale com o titular da conta.',
  unauthorized: 'Sessão expirada. Faça login novamente.',
  unavailable: 'Não foi possível falar com o iFood agora. Tente novamente em instantes.'
});

/** Maps an API error code (any of the connection/authorization endpoints) to PT-BR copy. */
export function describeIfoodConnectionError(code, body = {}) {
  if (code === 'active_orders_present' && Number.isInteger(body?.count)) {
    const count = body.count;
    const noun = count === 1 ? 'pedido em andamento' : 'pedidos em andamento';
    return `Existem ${count} ${noun} neste merchant. Finalize-os antes de pausar ou desconectar.`;
  }
  if (code === 'connection_already_exists' && isNonEmptyString(body?.merchantId)) {
    return `Já existe a loja "${body.merchantId}" conectada. Desconecte-a antes de conectar outra.`;
  }
  return CONNECTION_ERROR_MESSAGES[code] ?? 'Não foi possível concluir a ação. Tente novamente.';
}

export const IFOOD_MAPPING_SUGGESTION_COPY = Object.freeze({
  title: 'Vínculo de produtos é automático',
  description:
    'Não é preciso configurar um catálogo. Conforme os pedidos do iFood chegarem, o ZeloPDV sugere o produto já cadastrado com o mesmo código ou nome — você só confirma o vínculo uma vez por item. Um produto sem vínculo não bloqueia o pedido; ele só não movimenta estoque.'
});

/** Pure copy for the "no active orders" gate, shown before a pause/disconnect attempt. */
export const IFOOD_NO_ACTIVE_ORDERS_WARNING =
  'Pausar ou desconectar só é permitido quando não há pedidos em andamento neste merchant.';

export function isValidPrintOwner(value) {
  return value === 'zelo' || value === 'external';
}

export function printOwnerLabel(value) {
  return IFOOD_PRINT_OWNER_LABELS[value] ?? IFOOD_PRINT_OWNER_LABELS.zelo;
}
