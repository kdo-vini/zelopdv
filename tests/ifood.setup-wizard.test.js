import { describe, expect, it } from 'vitest';
import {
  IFOOD_MAPPING_SUGGESTION_COPY,
  IFOOD_NO_ACTIVE_ORDERS_WARNING,
  IFOOD_STATE_LABELS,
  availableIfoodActions,
  deriveIfoodWizardState,
  describeIfoodConnectionError,
  isValidPrintOwner,
  printOwnerLabel,
  shapeDiscoveredMerchants
} from '../src/lib/integrations/ifoodSetup.js';
import {
  canManageIfoodConnection,
  createIfoodConnectionService
} from '../src/lib/server/ifood/connectionService.js';

// ── Pure presentation machine (`ifoodSetup.js`) ──────────────────────────

function ownerAccess() {
  return { isSubUser: false };
}

describe('deriveIfoodWizardState — the six named states from the design doc', () => {
  it('no connection at all → Não conectado', () => {
    const derived = deriveIfoodWizardState({ connection: null });
    expect(derived.state).toBe('not_connected');
    expect(derived.label).toBe(IFOOD_STATE_LABELS.not_connected);
    expect(derived.merchantId).toBeNull();
  });

  it('a revoked connection is presented exactly like not connected (fresh start)', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'revoked', merchantId: 'm-1', printOwner: 'zelo' }
    });
    expect(derived.state).toBe('not_connected');
  });

  it('pending, not expired → Aguardando autorização no iFood, with URL/state to poll', () => {
    const derived = deriveIfoodWizardState({
      connection: {
        status: 'pending',
        merchantId: 'm-1',
        printOwner: 'zelo',
        authorization: {
          status: 'pending',
          state: 'abc123',
          authorizationUrl: 'https://portal.ifood.com.br/',
          expiresAt: '2026-09-17T12:00:00.000Z'
        }
      }
    });
    expect(derived.state).toBe('awaiting_authorization');
    expect(derived.expired).toBe(false);
    expect(derived.authorizationUrl).toBe('https://portal.ifood.com.br/');
    expect(derived.authorizationState).toBe('abc123');
  });

  it('pending, expired → still Aguardando, but flagged expired (offers restart only)', () => {
    const derived = deriveIfoodWizardState({
      connection: {
        status: 'pending',
        merchantId: 'm-1',
        printOwner: 'zelo',
        authorization: { status: 'expired', merchantId: 'm-1' }
      }
    });
    expect(derived.state).toBe('awaiting_authorization');
    expect(derived.expired).toBe(true);
    expect(availableIfoodActions(derived)).toEqual(['restart']);
  });

  it('active + no health snapshot yet → Ativo (does not wait on a second call to render)', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'active', merchantId: 'm-1', printOwner: 'zelo' }
    });
    expect(derived.state).toBe('active');
  });

  it('active + healthy → Ativo', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'active', merchantId: 'm-1', printOwner: 'external' },
      health: { healthy: true, reasons: [] }
    });
    expect(derived.state).toBe('active');
    expect(derived.printOwner).toBe('external');
  });

  it('active + unhealthy → Configuração necessária (never seen full health yet)', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'active', merchantId: 'm-1', printOwner: 'zelo' },
      health: { healthy: false, reasons: ['worker_heartbeat_missing', 'token_missing'] }
    });
    expect(derived.state).toBe('configuration_needed');
    expect(derived.reasons).toEqual(['worker_heartbeat_missing', 'token_missing']);
  });

  it('degraded status → Atenção necessária (was healthy, then regressed)', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'degraded', merchantId: 'm-1', printOwner: 'zelo' },
      health: { healthy: false, reasons: ['worker_heartbeat_stale'] }
    });
    expect(derived.state).toBe('attention');
    expect(derived.reasons).toEqual(['worker_heartbeat_stale']);
  });

  it('worker degradado e retomada: attention → active once health and status recover', () => {
    const degraded = deriveIfoodWizardState({
      connection: { status: 'degraded', merchantId: 'm-1', printOwner: 'zelo' },
      health: { healthy: false, reasons: ['worker_heartbeat_stale'] }
    });
    expect(degraded.state).toBe('attention');

    const recovered = deriveIfoodWizardState({
      connection: { status: 'active', merchantId: 'm-1', printOwner: 'zelo' },
      health: { healthy: true, reasons: [] }
    });
    expect(recovered.state).toBe('active');
  });

  it('paused → Pausado', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'paused', merchantId: 'm-1', printOwner: 'zelo' }
    });
    expect(derived.state).toBe('paused');
    expect(availableIfoodActions(derived)).toEqual(['resume', 'disconnect']);
  });

  it('an unmapped/unknown status fails closed to not_connected instead of guessing', () => {
    const derived = deriveIfoodWizardState({
      connection: { status: 'something-new-from-the-future', merchantId: 'm-1' }
    });
    expect(derived.state).toBe('not_connected');
  });
});

describe('refresh no meio da autorização — pure recompute has no memory to lose', () => {
  it('the exact same API snapshot, computed twice (simulating page reload), yields identical output', () => {
    const snapshot = {
      status: 'pending',
      merchantId: 'm-refresh',
      printOwner: 'zelo',
      authorization: {
        status: 'pending',
        state: 'state-xyz',
        authorizationUrl: 'https://portal.ifood.com.br/',
        expiresAt: '2026-09-17T13:00:00.000Z'
      }
    };
    const beforeRefresh = deriveIfoodWizardState({ connection: snapshot });
    // "Refresh" = a brand new call with the same server-returned object,
    // no wizard-local step index carried over.
    const afterRefresh = deriveIfoodWizardState({ connection: { ...snapshot } });
    expect(afterRefresh).toEqual(beforeRefresh);
    expect(afterRefresh.state).toBe('awaiting_authorization');
  });
});

describe('merchant único/múltiplo — conflict and takeover copy', () => {
  it('starting a second merchant while one is already live is a conflict, not a silent switch', () => {
    const message = describeIfoodConnectionError('connection_already_exists', { merchantId: 'loja-1', status: 'active' });
    expect(message).toContain('loja-1');
  });

  it('claiming a merchantId already owned by another tenant is reported distinctly', () => {
    const message = describeIfoodConnectionError('merchant_already_connected');
    expect(message).toMatch(/já está conectada em outra conta/i);
  });
});

describe('autorização pendente externa — copy and available actions', () => {
  it('offers "check" and "restart" while pending and not expired', () => {
    const derived = deriveIfoodWizardState({
      connection: {
        status: 'pending',
        merchantId: 'm-1',
        authorization: { status: 'pending', state: 's', authorizationUrl: 'https://portal.ifood.com.br/' }
      }
    });
    expect(availableIfoodActions(derived)).toEqual(['check_authorization', 'restart']);
  });

  it('never promises instant activation copy for an expired prompt', () => {
    const message = describeIfoodConnectionError('authorization_expired');
    expect(message).toMatch(/expirou/i);
    expect(message).not.toMatch(/instant/i);
  });
});

describe('impressão sugerida — print owner selection copy', () => {
  it('labels both print owners in Portuguese', () => {
    expect(printOwnerLabel('zelo')).toBe('Zelo PDV');
    expect(printOwnerLabel('external')).toMatch(/externo/i);
  });

  it('falls back to the Zelo label for an unexpected/missing value (matches the DB default)', () => {
    expect(printOwnerLabel(undefined)).toBe('Zelo PDV');
    expect(printOwnerLabel('anything-else')).toBe('Zelo PDV');
  });

  it('validates only the two accepted values', () => {
    expect(isValidPrintOwner('zelo')).toBe(true);
    expect(isValidPrintOwner('external')).toBe(true);
    expect(isValidPrintOwner('printer')).toBe(false);
    expect(isValidPrintOwner(undefined)).toBe(false);
  });

  it('offers set_print_owner as an available action once active/configuration_needed/attention', () => {
    expect(availableIfoodActions({ state: 'active' })).toContain('set_print_owner');
    expect(availableIfoodActions({ state: 'configuration_needed' })).toContain('set_print_owner');
    expect(availableIfoodActions({ state: 'attention' })).toContain('set_print_owner');
    expect(availableIfoodActions({ state: 'paused' })).not.toContain('set_print_owner');
    expect(availableIfoodActions({ state: 'not_connected' })).not.toContain('set_print_owner');
  });
});

describe('mapping opcional — informational copy only, never a blocking step', () => {
  it('exposes static PT-BR copy explaining mapping is automatic and non-blocking', () => {
    expect(IFOOD_MAPPING_SUGGESTION_COPY.title).toBeTruthy();
    expect(IFOOD_MAPPING_SUGGESTION_COPY.description).toMatch(/não bloqueia/i);
  });
});

describe('pedidos ativos bloqueando pause/disconnect', () => {
  it('translates the active_orders_present error with the exact count from the API', () => {
    const message = describeIfoodConnectionError('active_orders_present', { count: 3 });
    expect(message).toContain('3 pedidos em andamento');
  });

  it('uses singular phrasing for exactly one active order', () => {
    const message = describeIfoodConnectionError('active_orders_present', { count: 1 });
    expect(message).toContain('1 pedido em andamento');
    expect(message).not.toContain('1 pedidos');
  });

  it('exposes a generic pre-emptive warning independent of any specific count', () => {
    expect(IFOOD_NO_ACTIVE_ORDERS_WARNING).toMatch(/pedidos em andamento/i);
  });

  it('still offers pause/disconnect as candidate actions — the gate is enforced server-side, not hidden client-side', () => {
    const derived = deriveIfoodWizardState({ connection: { status: 'active', merchantId: 'm-1' } });
    expect(availableIfoodActions(derived)).toEqual(expect.arrayContaining(['pause', 'disconnect']));
  });
});

describe('describeIfoodConnectionError — fallback and known codes', () => {
  it('falls back to a generic retry message for an unknown code', () => {
    expect(describeIfoodConnectionError('totally_unknown_code')).toMatch(/tente novamente/i);
  });

  it('translates capability/eligibility/session failures distinctly', () => {
    expect(describeIfoodConnectionError('forbidden')).toMatch(/permissão/i);
    expect(describeIfoodConnectionError('subscription_required')).toMatch(/plano|teste/i);
    expect(describeIfoodConnectionError('unauthorized')).toMatch(/sessão/i);
  });
});

// ── Server-side support for the print-owner wizard step ─────────────────
// `updatePrintOwner` lives in connectionService.js (shared with Task 17's
// connection API) but is exercised here because it exists specifically to
// serve this wizard's "escolher responsável pela impressão" step.

function authResult(userId = 'user-1') {
  return { user: { id: userId } };
}

function activeSubscription() {
  return { status: 'active', plan_tier: 'pdv', current_period_end: null, manually_extended_until: null };
}

function createFakePrintOwnerRepository({ existing = null } = {}) {
  let connection = existing;
  return {
    async getConnection() {
      return connection ? { ...connection } : null;
    },
    async upsertConnection() {
      throw new Error('not used in these tests');
    },
    async countActiveOrders() {
      return 0;
    },
    async setPrintOwner({ printOwner }) {
      if (!connection) return { outcome: 'not_connected' };
      connection = { ...connection, printOwner };
      return { outcome: 'updated', connectionId: connection.connectionId, merchantId: connection.merchantId, printOwner };
    }
  };
}

function fakeAdapter() {
  return { async connectMerchant() { return { connected: false }; } };
}

describe('connectionService.updatePrintOwner', () => {
  it('rejects a sub-user without the iFood capability', async () => {
    const repository = createFakePrintOwnerRepository({
      existing: { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() }
    });
    const service = createIfoodConnectionService({ repository, adapter: fakeAdapter(), stateSecret: 's' });

    const response = await service.updatePrintOwner({
      authResult: authResult(),
      accessContext: { isSubUser: true, permissions: {} },
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { printOwner: 'external' }
    });
    expect(response.status).toBe(403);
    expect(canManageIfoodConnection({ isSubUser: true, permissions: {} })).toBe(false);
  });

  it('rejects an invalid printOwner value', async () => {
    const repository = createFakePrintOwnerRepository({
      existing: { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() }
    });
    const service = createIfoodConnectionService({ repository, adapter: fakeAdapter(), stateSecret: 's' });

    const response = await service.updatePrintOwner({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { printOwner: 'printer-in-the-cloud' }
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_print_owner');
  });

  it('returns not_connected when there is no connection yet', async () => {
    const repository = createFakePrintOwnerRepository({ existing: null });
    const service = createIfoodConnectionService({ repository, adapter: fakeAdapter(), stateSecret: 's' });

    const response = await service.updatePrintOwner({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { printOwner: 'external' }
    });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_connected');
  });

  it('updates printOwner for an owner on a live connection', async () => {
    const repository = createFakePrintOwnerRepository({
      existing: { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() }
    });
    const service = createIfoodConnectionService({ repository, adapter: fakeAdapter(), stateSecret: 's' });

    const response = await service.updatePrintOwner({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { printOwner: 'external' }
    });
    expect(response.status).toBe(200);
    expect(response.body.printOwner).toBe('external');
  });

  it('degrades gracefully (503) when the injected repository has no setPrintOwner (older repository)', async () => {
    const repository = {
      async getConnection() {
        return { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() };
      },
      async upsertConnection() { throw new Error('not used'); },
      async countActiveOrders() { return 0; }
    };
    const service = createIfoodConnectionService({ repository, adapter: fakeAdapter(), stateSecret: 's' });

    const response = await service.updatePrintOwner({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { printOwner: 'external' }
    });
    expect(response.status).toBe(503);
  });
});

// ── shapeDiscoveredMerchants — pure presentation for the "one click" picker ──

describe('shapeDiscoveredMerchants', () => {
  it('returns an empty list for a non-array input', () => {
    expect(shapeDiscoveredMerchants(undefined)).toEqual([]);
    expect(shapeDiscoveredMerchants(null)).toEqual([]);
  });

  it('drops entries without a usable merchantId', () => {
    const shaped = shapeDiscoveredMerchants([{ name: 'Sem id' }, { merchantId: '' }, { merchantId: '  ' }]);
    expect(shaped).toEqual([]);
  });

  it('labels each merchant by name, falling back to corporateName then merchantId', () => {
    const shaped = shapeDiscoveredMerchants([
      { merchantId: 'm-1', name: 'Loja do Zé' },
      { merchantId: 'm-2', corporateName: 'Zé Comércio LTDA' },
      { merchantId: 'm-3' }
    ]);
    expect(shaped).toEqual([
      { merchantId: 'm-1', label: 'Loja do Zé' },
      { merchantId: 'm-2', label: 'Zé Comércio LTDA' },
      { merchantId: 'm-3', label: 'm-3' }
    ]);
  });
});

// ── connectionService discovery + synchronous activation (Alavanca 2) ───────

function createFakeConnectionRepository({ existing = null, claimedMerchantIds = [] } = {}) {
  let connection = existing;
  const upserts = [];
  return {
    async getConnection() {
      return connection ? { ...connection } : null;
    },
    async upsertConnection({ merchantId, status }) {
      upserts.push({ merchantId, status });
      const outcome = connection ? 'updated' : 'created';
      connection = {
        connectionId: connection?.connectionId ?? 'c-new',
        merchantId,
        status,
        printOwner: connection?.printOwner ?? 'zelo',
        updatedAt: new Date().toISOString()
      };
      return { outcome, connectionId: connection.connectionId, merchantId, status };
    },
    async countActiveOrders() {
      return 0;
    },
    async listClaimedMerchantIds() {
      return claimedMerchantIds;
    },
    _upserts: upserts
  };
}

describe('connectionService.getStatus — discoverMerchants surfaces unclaimed authorized stores', () => {
  it('includes discoveredMerchants, filtering out already-claimed merchantIds, when not_connected', async () => {
    const repository = createFakeConnectionRepository({ claimedMerchantIds: ['m-claimed'] });
    const adapter = {
      async connectMerchant() { return { connected: false }; },
      async listMerchants() {
        return [
          { id: 'm-claimed', name: 'Já reivindicada' },
          { id: 'm-free', name: 'Loja livre' }
        ];
      }
    };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.getStatus({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1'
    });
    expect(response.status).toBe(200);
    expect(response.body.discoveredMerchants).toEqual([{ merchantId: 'm-free', name: 'Loja livre', corporateName: null }]);
  });

  it('never breaks the status read when the adapter has no listMerchants (older adapter)', async () => {
    const repository = createFakeConnectionRepository();
    const adapter = { async connectMerchant() { return { connected: false }; } };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.getStatus({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1'
    });
    expect(response.status).toBe(200);
    expect(response.body.discoveredMerchants).toEqual([]);
  });

  it('never breaks the status read when discovery throws (iFood outage)', async () => {
    const repository = createFakeConnectionRepository();
    const adapter = {
      async connectMerchant() { return { connected: false }; },
      async listMerchants() { throw new Error('iFood unavailable'); }
    };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.getStatus({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1'
    });
    expect(response.status).toBe(200);
    expect(response.body.discoveredMerchants).toEqual([]);
  });

  it('does not surface discoveredMerchants for an already-connected (non-revoked) merchant', async () => {
    const repository = createFakeConnectionRepository({
      existing: { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() }
    });
    const adapter = {
      async connectMerchant() { return { connected: false }; },
      async listMerchants() { return [{ id: 'm-free', name: 'Loja livre' }]; }
    };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.getStatus({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1'
    });
    expect(response.status).toBe(200);
    expect(response.body.discoveredMerchants).toBeUndefined();
  });
});

describe('connectionService.startConnection — synchronous activation shortcut', () => {
  it('activates immediately (status: active) when the provider already confirms the merchant', async () => {
    const repository = createFakeConnectionRepository();
    const adapter = { async connectMerchant() { return { connected: true }; } };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.startConnection({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { merchantId: 'm-picked' }
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('active');
    expect(repository._upserts).toEqual([{ merchantId: 'm-picked', status: 'active' }]);
  });

  it('falls back to pending when the provider has not confirmed yet', async () => {
    const repository = createFakeConnectionRepository();
    const adapter = { async connectMerchant() { return { connected: false }; } };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.startConnection({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { merchantId: 'm-picked' }
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
    expect(repository._upserts).toEqual([{ merchantId: 'm-picked', status: 'pending' }]);
  });

  it('falls back to pending when the provider check throws (provider unreachable)', async () => {
    const repository = createFakeConnectionRepository();
    const adapter = { async connectMerchant() { throw new Error('network'); } };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.startConnection({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { merchantId: 'm-picked' }
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
  });

  it('never re-checks the provider for a resubmission of the same already-active merchant', async () => {
    const repository = createFakeConnectionRepository({
      existing: { connectionId: 'c-1', merchantId: 'm-1', status: 'active', printOwner: 'zelo', updatedAt: new Date().toISOString() }
    });
    let calls = 0;
    const adapter = {
      async connectMerchant() {
        calls += 1;
        return { connected: true };
      }
    };
    const service = createIfoodConnectionService({ repository, adapter, stateSecret: 's' });

    const response = await service.startConnection({
      authResult: authResult(),
      accessContext: ownerAccess(),
      subscription: activeSubscription(),
      empresaId: 'empresa-1',
      body: { merchantId: 'm-1' }
    });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('active');
    expect(calls).toBe(0);
  });
});
