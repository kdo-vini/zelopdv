import { describe, expect, it } from 'vitest';
import {
  IFOOD_REVIEW_SLA_MINUTES,
  ifoodCanCancel,
  ifoodHandoffCodes,
  ifoodHasPendingCommand,
  ifoodPrimaryIntent,
  ifoodReviewClock,
  ifoodScheduleState,
  ifoodSyncPresentation,
  ifoodUnmappedItemCount,
  ifoodWaitingLabel,
  orderSourceBadge,
  upcomingScheduledOrders
} from '../src/lib/orders/ifoodPresentation.js';

function order(overrides = {}) {
  return {
    id: 'order-1',
    source: 'ifood',
    status: 'pending_review',
    criado_em: '2026-09-16T12:00:00.000Z',
    fulfillment: { type: 'delivery', mode: 'delivery', deliveredBy: 'MERCHANT' },
    ifood: { displayId: '7421', scheduled: false, preparationStartAt: '2026-09-16T12:00:00.000Z', pickupCode: null, deliveryCode: '4321' },
    itens: [{ id: 'a', id_produto: null }, { id: 'b', id_produto: 12 }],
    ...overrides
  };
}

const at = (minutes) => new Date(Date.parse('2026-09-16T12:00:00.000Z') + minutes * 60000).toISOString();

describe('orderSourceBadge', () => {
  it('shows a channel label and the iFood display reference', () => {
    expect(orderSourceBadge(order())).toEqual({ source: 'ifood', label: 'iFood', reference: '7421' });
    expect(orderSourceBadge({ source: 'zelomenu' })).toEqual({ source: 'zelomenu', label: 'ZeloMenu', reference: null });
    expect(orderSourceBadge({})).toMatchObject({ label: 'ZeloMenu' });
  });
});

describe('ifoodReviewClock', () => {
  it('escalates at 4, 6 and 8 minutes while the order awaits confirmation', () => {
    expect(IFOOD_REVIEW_SLA_MINUTES).toEqual({ attention: 4, warning: 6, critical: 8 });
    expect(ifoodReviewClock(order(), at(3))).toEqual({ elapsedMinutes: 3, severity: 'normal', persistent: true });
    expect(ifoodReviewClock(order(), at(4)).severity).toBe('attention');
    expect(ifoodReviewClock(order(), at(6)).severity).toBe('warning');
    expect(ifoodReviewClock(order(), at(8)).severity).toBe('critical');
    expect(ifoodReviewClock(order(), at(30)).severity).toBe('critical');
  });

  it('does not alert after confirmation or for other channels', () => {
    expect(ifoodReviewClock(order({ status: 'accepted' }), at(10))).toMatchObject({ severity: 'none', persistent: false });
    expect(ifoodReviewClock(order({ source: 'zelomenu' }), at(10))).toMatchObject({ severity: 'none', persistent: false });
  });
});

describe('ifoodScheduleState and upcoming schedule', () => {
  it('keeps a scheduled order out of the kitchen until preparationStartAt', () => {
    const scheduled = order({ ifood: { scheduled: true, preparationStartAt: at(90), scheduleStart: at(120), scheduleEnd: at(150) } });
    expect(ifoodScheduleState(scheduled, at(60))).toEqual({
      scheduled: true,
      preparationStartAt: at(90),
      windowStart: at(120),
      windowEnd: at(150),
      readyForKitchen: false
    });
    expect(ifoodScheduleState(scheduled, at(90)).readyForKitchen).toBe(true);
    expect(ifoodScheduleState(order(), at(0)).readyForKitchen).toBe(true);
  });

  it('lists upcoming scheduled iFood orders by preparation start', () => {
    const later = order({ id: 'later', ifood: { scheduled: true, preparationStartAt: at(200) } });
    const sooner = order({ id: 'sooner', ifood: { scheduled: true, preparationStartAt: at(100) } });
    const due = order({ id: 'due', ifood: { scheduled: true, preparationStartAt: at(10) } });
    expect(upcomingScheduledOrders([later, order(), sooner, due], at(50)).map((o) => o.id)).toEqual(['sooner', 'later']);
  });
});

describe('ifoodPrimaryIntent and waiting labels', () => {
  it('mirrors the server enqueue matrix per status and fulfillment', () => {
    expect(ifoodPrimaryIntent(order())).toBe('confirm');
    expect(ifoodPrimaryIntent(order({ status: 'accepted' }))).toBe('start_preparation');
    expect(ifoodPrimaryIntent(order({ status: 'preparing' }))).toBe('dispatch');
    expect(ifoodPrimaryIntent(order({ status: 'ready' }))).toBe('dispatch');
    expect(ifoodPrimaryIntent(order({ status: 'preparing', fulfillment: { type: 'takeout', mode: 'retirada' } }))).toBe('ready_to_pickup');
    expect(ifoodPrimaryIntent(order({ status: 'preparing', fulfillment: { type: 'delivery', deliveredBy: 'IFOOD' } }))).toBeNull();
    expect(ifoodPrimaryIntent(order({ status: 'ready', fulfillment: { type: 'takeout' } }))).toBeNull();
    expect(ifoodPrimaryIntent(order({ status: 'out_for_delivery' }))).toBe('verify_delivery_code');
    expect(ifoodPrimaryIntent(order({ source: 'zelomenu' }))).toBeNull();
  });

  it('explains why there is no action', () => {
    expect(ifoodWaitingLabel(order({ status: 'preparing', fulfillment: { type: 'delivery', deliveredBy: 'IFOOD' } }))).toBe('Aguardando entregador do iFood');
    expect(ifoodWaitingLabel(order({ status: 'ready', fulfillment: { type: 'takeout' } }))).toBe('Aguardando retirada do cliente');
    expect(ifoodWaitingLabel(order({ status: 'out_for_delivery' }))).toBe('Em rota de entrega');
    expect(ifoodWaitingLabel(order())).toBeNull();
  });

  it('allows cancelling only non-terminal iFood orders', () => {
    expect(ifoodCanCancel(order())).toBe(true);
    expect(ifoodCanCancel(order({ status: 'delivered' }))).toBe(false);
    expect(ifoodCanCancel(order({ status: 'cancelled' }))).toBe(false);
    expect(ifoodCanCancel(order({ source: 'manual' }))).toBe(false);
  });
});

describe('ifoodSyncPresentation', () => {
  it('keeps sync state separate from the commercial status', () => {
    expect(ifoodSyncPresentation(null)).toBeNull();
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: null })).toBeNull();
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: { intent: 'confirm', status: 'queued' } }))
      .toMatchObject({ tone: 'info', label: 'Enviando ao iFood', pending: true });
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: { intent: 'confirm', status: 'accepted_http' } }))
      .toMatchObject({ label: 'Aguardando confirmação do iFood', pending: true });
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: { intent: 'dispatch', status: 'failed_retryable' } }))
      .toMatchObject({ tone: 'warning', pending: true });
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: { intent: 'confirm', status: 'confirmed_event' } })).toBeNull();
  });

  it('points to the Partner Portal contingency on failure or unavailable connection', () => {
    expect(ifoodSyncPresentation({ connectionStatus: 'active', command: { intent: 'cancel', status: 'expired' } }))
      .toMatchObject({ tone: 'error', contingency: true, pending: false });
    expect(ifoodSyncPresentation({ connectionStatus: 'degraded', command: { intent: 'confirm', status: 'queued' } }))
      .toMatchObject({ tone: 'error', label: 'Conexão com o iFood indisponível', contingency: true });
  });

  it('hides a failed command whose effect the order already shows (resolved in the Partner Portal)', () => {
    const failedConfirm = { connectionStatus: 'active', command: { intent: 'confirm', status: 'failed_terminal' } };
    expect(ifoodSyncPresentation(failedConfirm, order({ status: 'accepted' }))).toBeNull();
    expect(ifoodSyncPresentation(failedConfirm, order({ status: 'pending_review' }))).toMatchObject({ tone: 'error' });
    const expiredCancel = { connectionStatus: 'active', command: { intent: 'cancel', status: 'expired' } };
    expect(ifoodSyncPresentation(expiredCancel, order({ status: 'cancelled' }))).toBeNull();
    // Connection problems are never hidden by the order status.
    expect(ifoodSyncPresentation({ connectionStatus: 'paused', command: failedConfirm.command }, order({ status: 'accepted' })))
      .toMatchObject({ contingency: true });
  });

  it('detects an in-flight command', () => {
    expect(ifoodHasPendingCommand({ command: { status: 'sending' } })).toBe(true);
    expect(ifoodHasPendingCommand({ command: { status: 'failed_terminal' } })).toBe(false);
    expect(ifoodHasPendingCommand(null)).toBe(false);
  });
});

describe('codes and unmapped items', () => {
  it('lists hand-off codes only for iFood orders', () => {
    expect(ifoodHandoffCodes(order())).toEqual([{ kind: 'delivery', label: 'Código de entrega', value: '4321' }]);
    expect(ifoodHandoffCodes(order({ source: 'zelomenu' }))).toEqual([]);
  });

  it('counts items still without a Zelo product link', () => {
    expect(ifoodUnmappedItemCount(order())).toBe(1);
    expect(ifoodUnmappedItemCount(order({ source: 'zelomenu' }))).toBe(0);
  });
});
