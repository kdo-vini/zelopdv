import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMockIfoodAdapter } from '../../src/lib/server/ifood/adapters/mockIfoodAdapter.js';
import { createIfoodIntegration } from '../../src/lib/server/ifood/createIfoodIntegration.js';
import { createIfoodCommandService } from '../../src/lib/server/ifood/commandService.js';
import { decideEventTransition } from '../../src/lib/server/ifood/eventPolicy.js';
import {
  COMMISSION_UNAVAILABLE_LABEL,
  channelHasCommissionData,
  filterVendasByChannel,
  getChannelVisual,
  summarizeSalesByChannel
} from '../../src/lib/finance/salesChannel.js';
import { computeDailyMetrics } from '../../src/lib/server/intelligence/metrics.js';
import { deriveIfoodWizardState } from '../../src/lib/integrations/ifoodSetup.js';

const load = (rel) => JSON.parse(readFileSync(resolve(rel), 'utf8'));
const placed = load('tests/fixtures/ifood/events/placed.json');
const concluded = load('tests/fixtures/ifood/events/concluded.json');
const cancelled = load('tests/fixtures/ifood/events/cancelled.json');
const immediate = load('tests/fixtures/ifood/orders/immediate-ifood-delivery.json');
const scheduled = load('tests/fixtures/ifood/orders/scheduled.json');

const EMPRESA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function memoryRepository() {
  const events = [];
  const orders = new Map();
  const commands = [];
  return {
    events,
    orders,
    commands,
    async appendEvent(event) {
      if (events.some((e) => e.id === event.id)) return { duplicate: true, inserted: false };
      events.push(event);
      return { inserted: true };
    },
    async getOrderState(orderId) {
      return orders.get(orderId) ?? null;
    },
    async quarantineEvent() {},
    async project(event) {
      const transition = decideEventTransition(orders.get(event.orderId), event);
      if (transition.decision === 'apply') {
        orders.set(event.orderId, {
          externalStatus: transition.externalStatus,
          internalStatus: transition.internalStatus,
          lastEventAt: event.createdAt,
          orderId: event.orderId
        });
      }
      return transition;
    }
  };
}

test.describe('iFood MVP E2E (mock adapter, no real iFood)', () => {
  test('wizard connection states cover the self-service lifecycle', async () => {
    const notConnected = deriveIfoodWizardState({
      connection: { status: 'not_connected' }
    });
    expect(notConnected.state).toBe('not_connected');

    const pending = deriveIfoodWizardState({
      connection: {
        status: 'pending',
        authorization: { status: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString() }
      }
    });
    expect(pending.state).toBe('awaiting_authorization');

    const active = deriveIfoodWizardState({
      connection: { status: 'active', printOwner: 'zelo' },
      health: { healthy: true }
    });
    expect(active.state).toBe('active');

    const adapter = createMockIfoodAdapter({
      merchants: [{ id: placed.merchantId, name: 'Pilot' }]
    });
    const connected = await adapter.connectMerchant({ merchantId: placed.merchantId });
    expect(connected.connected).toBe(true);
  });

  test('immediate and scheduled orders advance through operational intents', async () => {
    expect(immediate.orderTiming).toBe('IMMEDIATE');
    expect(scheduled.orderTiming).toBe('SCHEDULED');

    const repo = memoryRepository();
    const integration = createIfoodIntegration({
      adapter: createMockIfoodAdapter({
        orders: { [immediate.id]: immediate, [scheduled.id]: scheduled }
      }),
      repository: repo
    });

    const received = await integration.receiveEvent({ ...placed, order: immediate });
    expect(received.accepted).toBe(true);
    expect(received.duplicate).toBe(false);
    await repo.project(placed);

    const commandService = createIfoodCommandService({
      repository: {
        enqueueCommand: async ({ intent }) => {
          repo.commands.push(intent);
          return { outcome: 'queued', commandId: `cmd-${intent}`, status: 'queued' };
        }
      },
      accessResolver: async () => ({ isSubUser: false, permissions: {} })
    });

    const intents = ['confirm', 'start_preparation', 'ready_to_pickup', 'dispatch'];
    for (const intent of intents) {
      const result = await commandService.enqueueCommand({
        authResult: { user: { id: USER_ID } },
        empresaId: EMPRESA,
        orderId: ORDER_UUID,
        body: { intent, expectedRevision: 1 }
      });
      expect(result.status).toBe(202);
    }
    expect(repo.commands).toEqual(intents);

    const cancel = await commandService.enqueueCommand({
      authResult: { user: { id: USER_ID } },
      empresaId: EMPRESA,
      orderId: ORDER_UUID,
      body: { intent: 'cancel', expectedRevision: 2, cancellationCode: '501', reason: 'teste' }
    });
    expect(cancel.status).toBe(202);

    await repo.project(concluded);
    expect(repo.orders.get(concluded.orderId)?.externalStatus).toBe('CONCLUDED');
  });

  test('CONCLUDED sale + channel report + Zelinho metrics agree without PII', async () => {
    const vendas = [
      { id: 1, valor_total: 40, canal_origem: 'ifood', created_at: '2026-09-15T19:00:00.000Z', forma_pagamento: 'online' },
      { id: 2, valor_total: 20, canal_origem: 'pdv', created_at: '2026-09-15T19:10:00.000Z', forma_pagamento: 'dinheiro' }
    ];
    const porCanal = summarizeSalesByChannel(vendas);
    const ifoodRow = porCanal.find((row) => row.canal === 'ifood');
    expect(ifoodRow.qtd).toBe(1);
    expect(ifoodRow.bruto).toBe(40);
    expect(ifoodRow.comissao).toBeNull();
    expect(filterVendasByChannel(vendas, 'ifood')).toHaveLength(1);
    expect(getChannelVisual('ifood').label).toBe('iFood');
    expect(channelHasCommissionData('ifood')).toBe(false);
    expect(COMMISSION_UNAVAILABLE_LABEL).toBe('Indisponível');

    const metrics = computeDailyMetrics({
      vendas,
      itens: [],
      pagamentos: [],
      taxas: [],
      saldoFiadoTotal: 0
    });
    expect(metrics.por_canal.ifood.qtd_vendas).toBe(1);
    expect(metrics.por_canal.pdv.qtd_vendas).toBe(1);
    expect(JSON.stringify(metrics)).not.toMatch(/Cliente Teste|customer-fixture|Rua|telefone/i);

    const afterConclude = decideEventTransition(
      { externalStatus: 'CONCLUDED', lastEventAt: concluded.createdAt },
      cancelled
    );
    expect(['apply', 'quarantine']).toContain(afterConclude.decision);
  });
});
