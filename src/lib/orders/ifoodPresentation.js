// Pure presentation rules for iFood orders in the operational queues.
//
// Everything here works on the queue view model produced by
// `mapCanonicalOrder` (src/lib/onlineOrders.js) plus the sanitized sync state
// returned by `GET /api/integrations/ifood/orders/sync-state`. No HTTP, no
// Supabase, no provider contract: the browser never talks to iFood.

export const IFOOD_SOURCE = 'ifood';

// Minutes an iFood order may wait in review before the operator is warned.
// iFood cancels unconfirmed orders on its side, so the clock escalates at 4,
// 6 and 8 minutes (plan, Task 11).
export const IFOOD_REVIEW_SLA_MINUTES = Object.freeze({ attention: 4, warning: 6, critical: 8 });

const SOURCE_LABELS = Object.freeze({
  ifood: 'iFood',
  zelomenu: 'ZeloMenu',
  zelochat: 'ZeloChat',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  mesa: 'Mesa',
  legacy_zelochat: 'ZeloChat',
  legacy_pedido: 'Pedido'
});

const LIVE_COMMAND_STATUSES = new Set(['queued', 'sending', 'accepted_http', 'failed_retryable']);

const INTENT_LABELS = Object.freeze({
  confirm: 'Confirmar pedido',
  start_preparation: 'Iniciar preparo',
  ready_to_pickup: 'Marcar como pronto',
  dispatch: 'Saiu para entrega',
  verify_delivery_code: 'Confirmar entrega',
  cancel: 'Cancelar pedido'
});

const INTENT_PERMISSIONS = Object.freeze({
  confirm: 'pedidos.acessar',
  dispatch: 'pedidos.acessar',
  verify_delivery_code: 'pedidos.acessar',
  start_preparation: 'pedidos.cozinha',
  ready_to_pickup: 'pedidos.cozinha',
  cancel: 'pedidos.cancelar'
});

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nowMs(now) {
  return toMs(now) ?? Date.now();
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isIfoodOrder(order) {
  return order?.source === IFOOD_SOURCE;
}

/** Channel badge: iFood also renders a circular logo next to this text pill. */
export function orderSourceBadge(order) {
  const source = text(order?.source) || 'zelomenu';
  const ifood = order?.ifood || {};
  return {
    source,
    label: SOURCE_LABELS[source] || source,
    reference: source === IFOOD_SOURCE ? text(ifood.displayId) : null
  };
}

function ifoodBlock(order) {
  return order?.ifood && typeof order.ifood === 'object' ? order.ifood : {};
}

/** Pickup/delivery codes the operator must say or check at hand-off. */
export function ifoodHandoffCodes(order) {
  if (!isIfoodOrder(order)) return [];
  const ifood = ifoodBlock(order);
  const codes = [];
  const pickupCode = text(ifood.pickupCode);
  const deliveryCode = text(ifood.deliveryCode);
  if (pickupCode) codes.push({ kind: 'pickup', label: 'Código de coleta', value: pickupCode });
  if (deliveryCode) codes.push({ kind: 'delivery', label: 'Código de entrega', value: deliveryCode });
  return codes;
}

/**
 * Scheduled iFood orders must not reach the kitchen before
 * `preparationStartAt`. Immediate orders are always kitchen-ready.
 */
export function ifoodScheduleState(order, now = Date.now()) {
  const ifood = ifoodBlock(order);
  const scheduled = isIfoodOrder(order) && ifood.scheduled === true;
  const preparationStartMs = toMs(ifood.preparationStartAt);
  const current = nowMs(now);
  return {
    scheduled,
    preparationStartAt: preparationStartMs === null ? null : new Date(preparationStartMs).toISOString(),
    windowStart: text(ifood.scheduleStart),
    windowEnd: text(ifood.scheduleEnd),
    readyForKitchen: !scheduled || preparationStartMs === null || current >= preparationStartMs
  };
}

/** Orders the kitchen may show now; future scheduled iFood orders wait. */
export function kitchenVisibleOrders(orders, now = Date.now()) {
  return (Array.isArray(orders) ? orders : []).filter((order) => ifoodScheduleState(order, now).readyForKitchen);
}

/** Scheduled iFood orders still waiting for their preparation start. */
export function upcomingScheduledOrders(orders, now = Date.now()) {
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => {
      const state = ifoodScheduleState(order, now);
      return state.scheduled && !state.readyForKitchen;
    })
    .sort((left, right) => (toMs(left?.ifood?.preparationStartAt) ?? 0) - (toMs(right?.ifood?.preparationStartAt) ?? 0));
}

/**
 * Review clock for an iFood order awaiting confirmation. Only
 * `pending_review` escalates; every other status is `none`.
 */
export function ifoodReviewClock(order, now = Date.now()) {
  const createdMs = toMs(order?.criado_em ?? order?.created_at);
  const elapsedMinutes = createdMs === null ? 0 : Math.max(0, Math.floor((nowMs(now) - createdMs) / 60000));
  if (!isIfoodOrder(order) || order?.status !== 'pending_review') {
    return { elapsedMinutes, severity: 'none', persistent: false };
  }
  const { attention, warning, critical } = IFOOD_REVIEW_SLA_MINUTES;
  let severity = 'normal';
  if (elapsedMinutes >= critical) severity = 'critical';
  else if (elapsedMinutes >= warning) severity = 'warning';
  else if (elapsedMinutes >= attention) severity = 'attention';
  // A new iFood order keeps a visual alert until someone acts on it.
  return { elapsedMinutes, severity, persistent: true };
}

function fulfillmentOf(order) {
  return order?.fulfillment && typeof order.fulfillment === 'object' ? order.fulfillment : {};
}

function deliveredBy(order) {
  const fulfillment = fulfillmentOf(order);
  return String(fulfillment.deliveredBy || '').trim().toUpperCase();
}

function isDelivery(order) {
  const fulfillment = fulfillmentOf(order);
  return fulfillment.type === 'delivery' || fulfillment.mode === 'delivery';
}

/**
 * The next provider action for an iFood order. Mirrors the enqueue matrix of
 * `enqueue_ifood_order_command_v1` exactly, so the UI never offers an action
 * the server would reject as `invalid_transition`.
 */
export function ifoodPrimaryIntent(order) {
  if (!isIfoodOrder(order)) return null;
  switch (order.status) {
    case 'pending_review':
      return 'confirm';
    case 'accepted':
      return 'start_preparation';
    case 'preparing':
      if (isDelivery(order) && deliveredBy(order) === 'MERCHANT') return 'dispatch';
      if (deliveredBy(order) !== 'IFOOD') return 'ready_to_pickup';
      return null;
    case 'ready':
      return isDelivery(order) && deliveredBy(order) === 'MERCHANT' ? 'dispatch' : null;
    case 'out_for_delivery':
      return isDelivery(order) && deliveredBy(order) === 'MERCHANT' ? 'verify_delivery_code' : null;
    default:
      return null;
  }
}

export function ifoodCanCancel(order) {
  return isIfoodOrder(order) && !['delivered', 'rejected', 'cancelled'].includes(order.status);
}

export function ifoodIntentLabel(intent) {
  return INTENT_LABELS[intent] || null;
}

export function ifoodIntentPermission(intent) {
  return INTENT_PERMISSIONS[intent] || null;
}

/** Why an iFood order has no primary action, in operator language. */
export function ifoodWaitingLabel(order) {
  if (!isIfoodOrder(order)) return null;
  if (order.status === 'preparing' && deliveredBy(order) === 'IFOOD') return 'Aguardando entregador do iFood';
  if (order.status === 'ready' && !isDelivery(order)) return 'Aguardando retirada do cliente';
  if (order.status === 'ready' && deliveredBy(order) === 'IFOOD') return 'Aguardando entregador do iFood';
  if (order.status === 'out_for_delivery') return 'Em rota de entrega';
  return null;
}

/**
 * Decides how the queue advances an order. iFood orders always go through
 * the asynchronous command API; every other channel keeps the existing
 * `transition_zelo_order` / `close_zelo_order` flow untouched.
 */
export function resolveQueueAdvance(order) {
  if (isIfoodOrder(order)) {
    const intent = ifoodPrimaryIntent(order);
    return intent ? { kind: 'ifood_command', intent } : { kind: 'none' };
  }
  const actionByStatus = {
    pending_review: 'accept',
    accepted: 'start_preparing',
    preparing: 'mark_ready',
    ready: isDelivery(order) ? 'dispatch' : 'close',
    out_for_delivery: 'close'
  };
  const action = actionByStatus[order?.status];
  if (!action) return { kind: 'none' };
  return action === 'close' ? { kind: 'close' } : { kind: 'transition', action };
}

/** How the kitchen board advances an order (start preparing / mark ready). */
export function resolveKitchenAdvance(order, step) {
  if (isIfoodOrder(order)) {
    if (step === 'start' && order.status === 'accepted') return { kind: 'ifood_command', intent: 'start_preparation' };
    if (step === 'ready' && order.status === 'preparing') {
      const intent = ifoodPrimaryIntent(order);
      return intent === 'ready_to_pickup' ? { kind: 'ifood_command', intent } : { kind: 'none' };
    }
    return { kind: 'none' };
  }
  if (step === 'start' && order?.status === 'accepted') return { kind: 'transition', action: 'start_preparing' };
  if (step === 'ready' && order?.status === 'preparing') return { kind: 'transition', action: 'mark_ready' };
  return { kind: 'none' };
}

// Canonical statuses in which each command's effect has already happened.
const INTENT_SATISFIED_BY_STATUS = Object.freeze({
  confirm: new Set(['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered']),
  start_preparation: new Set(['preparing', 'ready', 'out_for_delivery', 'delivered']),
  ready_to_pickup: new Set(['ready', 'out_for_delivery', 'delivered']),
  dispatch: new Set(['out_for_delivery', 'delivered']),
  verify_delivery_code: new Set(['delivered']),
  cancel: new Set(['cancelled'])
});

/**
 * Operator-facing copy for a terminal/expired command. Never surfaces raw
 * provider codes like `IFOOD_HTTP_412` — those stay in syncState for support.
 */
export function ifoodCommandFailureCopy(command, actionLabel = 'ação') {
  const intent = command?.intent;
  const errorCode = text(command?.errorCode);
  const expired = command?.status === 'expired';
  const portal = 'Portal do Parceiro iFood';

  if (expired) {
    return {
      label: 'Confirmação demorou demais',
      detail: `O iFood não respondeu a tempo para ${actionLabel}. Tente de novo ou use o ${portal}.`
    };
  }

  if (
    errorCode === 'IFOOD_DELIVERY_CODE_INVALID'
    || (intent === 'verify_delivery_code' && errorCode === 'IFOOD_ACTION_NOT_ACCEPTED')
  ) {
    return {
      label: 'Código de entrega não aceito',
      detail: `Confira o código de 4 dígitos no app do cliente e tente de novo. Se continuar falhando, use o ${portal}.`
    };
  }

  if (errorCode === 'IFOOD_HTTP_412') {
    // 412 = precondition failed (pedido ainda não elegível), not API latency.
    if (intent === 'verify_delivery_code') {
      return {
        label: 'Confirmação bloqueada no iFood',
        detail: `O iFood recusou a confirmação neste estado do pedido — não é demora de conexão. Finalize neste pedido no ${portal}.`
      };
    }
    return {
      label: 'Ação bloqueada no iFood',
      detail: `O iFood recusou: ${actionLabel} — o pedido ainda não está elegível por aqui. Finalize no ${portal}.`
    };
  }

  if (errorCode === 'IFOOD_HTTP_400' || errorCode === 'IFOOD_HTTP_422') {
    if (intent === 'verify_delivery_code') {
      return {
        label: 'Código de entrega recusado',
        detail: `O iFood recusou este código. Confira os 4 dígitos com o cliente e tente de novo, ou conclua no ${portal}.`
      };
    }
    return {
      label: 'Pedido rejeitou a ação',
      detail: `O iFood não aceitou: ${actionLabel}. Atualize a fila e tente de novo, ou use o ${portal}.`
    };
  }

  if (errorCode === 'IFOOD_HTTP_403') {
    return {
      label: 'Sem permissão nesta ação do iFood',
      detail: `Não foi possível concluir ${actionLabel} por aqui. Use o ${portal}.`
    };
  }

  if (errorCode === 'IFOOD_HTTP_404') {
    return {
      label: 'Pedido não encontrado no iFood',
      detail: `Atualize a fila. Se o pedido ainda existir no iFood, finalize no ${portal}.`
    };
  }

  if (errorCode === 'IFOOD_HTTP_401' || errorCode === 'IFOOD_HTTP_UNAUTHORIZED') {
    return {
      label: 'Conexão com o iFood precisa renovar',
      detail: `Aguarde a reconexão automática e tente ${actionLabel} de novo, ou use o ${portal}.`
    };
  }

  // Legacy bucket from before status-specific codes were recorded.
  if (errorCode === 'IFOOD_HTTP_CLIENT' && intent === 'verify_delivery_code') {
    return {
      label: 'Não foi possível confirmar a entrega',
      detail: `Tente de novo com o código do cliente. Se falhar outra vez, conclua no ${portal}.`
    };
  }

  return {
    label: 'O iFood não confirmou',
    detail: `Tente ${actionLabel} de novo ou use o ${portal}.`
  };
}

/**
 * True when the order already reflects the command's effect, e.g. an operator
 * confirmed through the iFood Partner Portal after Zelo's command failed.
 */
export function ifoodCommandSatisfied(command, order) {
  return Boolean(order?.status && INTENT_SATISFIED_BY_STATUS[command?.intent]?.has(order.status));
}

/**
 * Sync state is shown next to the commercial status, never merged into it:
 * the order only moves when iFood confirms by event. A failed command whose
 * effect the order already shows is hidden instead of alarming forever.
 */
export function ifoodSyncPresentation(syncState, order = null) {
  if (!syncState || typeof syncState !== 'object') return null;
  const connectionStatus = text(syncState.connectionStatus);
  if (connectionStatus && connectionStatus !== 'active') {
    return {
      tone: 'error',
      label: 'Conexão com o iFood indisponível',
      detail: 'Use o Portal do Parceiro iFood para operar este pedido até a conexão voltar.',
      pending: false,
      contingency: true
    };
  }

  const command = syncState.command && typeof syncState.command === 'object' ? syncState.command : null;
  if (!command || ifoodCommandSatisfied(command, order)) return null;
  const actionLabel = (ifoodIntentLabel(command.intent) || 'Ação').toLowerCase();

  switch (command.status) {
    case 'queued':
    case 'sending':
      return { tone: 'info', label: 'Enviando ao iFood', detail: `Solicitação: ${actionLabel}.`, pending: true, contingency: false };
    case 'accepted_http':
      return { tone: 'info', label: 'Aguardando confirmação do iFood', detail: `O iFood recebeu: ${actionLabel}.`, pending: true, contingency: false };
    case 'failed_retryable':
      return { tone: 'warning', label: 'Tentando novamente', detail: `Ainda não foi possível enviar: ${actionLabel}.`, pending: true, contingency: false };
    case 'failed_terminal':
    case 'expired': {
      const copy = ifoodCommandFailureCopy(command, actionLabel);
      return {
        tone: 'error',
        label: copy.label,
        detail: copy.detail,
        pending: false,
        contingency: true
      };
    }
    default:
      return null;
  }
}

/** True while a command for this order is still in flight. */
export function ifoodHasPendingCommand(syncState) {
  return LIVE_COMMAND_STATUSES.has(syncState?.command?.status);
}

/** Items not yet linked to a Zelo product (mapping is a later task). */
export function ifoodUnmappedItemCount(order) {
  if (!isIfoodOrder(order)) return 0;
  const items = Array.isArray(order?.itens) ? order.itens : (order?.pedido_itens || []);
  return items.filter((item) => item?.id_produto === null || item?.id_produto === undefined).length;
}
