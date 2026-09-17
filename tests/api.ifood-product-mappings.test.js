import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canConfirmIfoodProductMapping,
  canSuggestIfoodProductMapping,
  createIfoodProductMappingService
} from '../src/lib/server/ifood/productMappingService.js';

const EMPRESA_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'auth-fixture';

function makeRequest({ token = TOKEN, body = {}, invalidJson = false, url } = {}) {
  return {
    headers: {
      get: (name) => name.toLowerCase() === 'authorization' && token
        ? `Bearer ${token}`
        : null,
    },
    json: vi.fn(async () => {
      if (invalidJson) throw new Error('invalid json');
      return body;
    }),
    signal: undefined,
    url
  };
}

function makeSupabase({
  user = { id: 'owner-1' },
  authError = null,
  rpcResults = {},
  profile = { id: EMPRESA_ID },
  rpcError = null
} = {}) {
  const rpc = vi.fn((name) => {
    const result = typeof rpcResults[name] === 'function'
      ? rpcResults[name]()
      : (rpcResults[name] ?? null);
    return {
      single: vi.fn(async () => ({ data: result, error: rpcError })),
      maybeSingle: vi.fn(async () => ({ data: result, error: rpcError })),
      then: (resolve, reject) => Promise.resolve({ data: result, error: rpcError }).then(resolve, reject),
    };
  });

  const from = vi.fn((table) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: table === 'empresa_perfil' ? profile : null,
        error: null
      })),
    };
    return query;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: authError })),
    },
    from,
    rpc,
  };
}

function baseAccessContext(overrides = {}) {
  return {
    isSubUser: false,
    ownerUserId: 'owner-1',
    roleId: null,
    permissions: null,
    ...overrides,
  };
}

async function loadRoute({ supabase, accessContext = baseAccessContext() } = {}) {
  vi.resetModules();
  vi.doMock('$lib/server/supabaseAdmin.js', () => ({ supabaseAdmin: supabase }));
  vi.doMock('$lib/server/accessControl.js', () => ({
    getServerAccessContext: vi.fn(async () => accessContext),
  }));
  return import('../src/routes/api/integrations/ifood/product-mappings/+server.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('iFood product mapping permissions', () => {
  it('lets owners suggest and confirm; subusers need produtos permissions', () => {
    expect(canSuggestIfoodProductMapping(baseAccessContext())).toBe(true);
    expect(canConfirmIfoodProductMapping(baseAccessContext())).toBe(true);

    const viewer = baseAccessContext({
      isSubUser: true,
      permissions: { 'produtos.visualizar': true }
    });
    expect(canSuggestIfoodProductMapping(viewer)).toBe(true);
    expect(canConfirmIfoodProductMapping(viewer)).toBe(false);

    const manager = baseAccessContext({
      isSubUser: true,
      permissions: { 'produtos.gerenciar': true }
    });
    expect(canSuggestIfoodProductMapping(manager)).toBe(true);
    expect(canConfirmIfoodProductMapping(manager)).toBe(true);

    const cashier = baseAccessContext({
      isSubUser: true,
      permissions: { 'pedidos.acessar': true }
    });
    expect(canSuggestIfoodProductMapping(cashier)).toBe(false);
    expect(canConfirmIfoodProductMapping(cashier)).toBe(false);
  });
});

describe('createIfoodProductMappingService', () => {
  it('suggests an exact externalCode match and keeps similar names read-only', async () => {
    const repository = {
      suggestMapping: vi.fn(async () => ({
        outcome: 'ok',
        existingMapping: {
          id: 'map-1',
          mappingStatus: 'suggested',
          productId: 812001
        },
        exactMatch: { productId: 812001, name: 'Exact Burger', reason: 'external_code' },
        similarMatches: [{ productId: 812002, name: 'Exact Burger Deluxe', reason: 'similar_name' }]
      })),
      confirmMapping: vi.fn()
    };
    const service = createIfoodProductMappingService({
      repository,
      accessResolver: async () => baseAccessContext()
    });

    const result = await service.suggest({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      query: {
        merchantId: 'merchant-a',
        externalItemId: 'item-1',
        externalCode: '812001',
        name: 'Exact Burger'
      }
    });

    expect(result.status).toBe(200);
    expect(result.body.exactMatch.productId).toBe(812001);
    expect(result.body.similarMatches).toHaveLength(1);
    expect(repository.suggestMapping).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: EMPRESA_ID,
      merchantId: 'merchant-a',
      externalItemId: 'item-1',
      externalCode: '812001',
      itemName: 'Exact Burger'
    }));
    expect(repository.confirmMapping).not.toHaveBeenCalled();
  });

  it('confirms a manual mapping and rejects missing auth before repository work', async () => {
    const repository = {
      suggestMapping: vi.fn(),
      confirmMapping: vi.fn(async () => ({
        outcome: 'ok',
        mappingId: 'map-1',
        mappingStatus: 'confirmed',
        productId: 812001
      }))
    };
    const accessResolver = vi.fn(async () => baseAccessContext());
    const service = createIfoodProductMappingService({ repository, accessResolver });

    await expect(service.confirm({
      authResult: null,
      empresaId: EMPRESA_ID,
      body: { merchantId: 'm', externalItemId: 'i', productId: 1 }
    })).resolves.toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(accessResolver).not.toHaveBeenCalled();

    const confirmed = await service.confirm({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      body: {
        merchantId: 'merchant-a',
        externalItemId: 'item-1',
        productId: 812001,
        action: 'confirm'
      }
    });
    expect(confirmed).toEqual({
      status: 200,
      body: { mappingId: 'map-1', mappingStatus: 'confirmed', productId: 812001 }
    });
  });

  it('maps cross-tenant product rejection and connection miss to stable 404s', async () => {
    const repository = {
      suggestMapping: vi.fn(),
      confirmMapping: vi.fn(async () => ({ outcome: 'product_not_found' }))
    };
    const service = createIfoodProductMappingService({
      repository,
      accessResolver: async () => baseAccessContext()
    });

    await expect(service.confirm({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      body: { merchantId: 'm', externalItemId: 'i', productId: 999 }
    })).resolves.toEqual({ status: 404, body: { error: 'product_not_found' } });

    repository.confirmMapping.mockResolvedValueOnce({ outcome: 'connection_not_found' });
    await expect(service.confirm({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      body: { merchantId: 'm', externalItemId: 'i', productId: 1 }
    })).resolves.toEqual({ status: 404, body: { error: 'connection_not_found' } });
  });

  it('forbids subusers without produtos.gerenciar from confirming', async () => {
    const repository = {
      suggestMapping: vi.fn(),
      confirmMapping: vi.fn()
    };
    const service = createIfoodProductMappingService({
      repository,
      accessResolver: async () => baseAccessContext({
        isSubUser: true,
        permissions: { 'produtos.visualizar': true }
      })
    });

    await expect(service.confirm({
      authResult: { user: { id: 'sub-1' } },
      empresaId: EMPRESA_ID,
      body: { merchantId: 'm', externalItemId: 'i', productId: 1 }
    })).resolves.toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(repository.confirmMapping).not.toHaveBeenCalled();
  });

  it('never forwards repository error text across the browser boundary', async () => {
    const repository = {
      suggestMapping: vi.fn(async () => {
        throw new Error('sql-detail-fixture-not-forwarded');
      }),
      confirmMapping: vi.fn()
    };
    const service = createIfoodProductMappingService({
      repository,
      accessResolver: async () => baseAccessContext()
    });

    const result = await service.suggest({
      authResult: { user: { id: 'owner-1' } },
      empresaId: EMPRESA_ID,
      query: { merchantId: 'm', externalItemId: 'i' }
    });
    expect(result).toEqual({ status: 500, body: { error: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain('sql-detail-fixture-not-forwarded');
  });
});

describe('GET/POST /api/integrations/ifood/product-mappings', () => {
  it('authenticates GET suggest and POST confirm through the route shell', async () => {
    const supabase = makeSupabase({
      rpcResults: {
        suggest_ifood_product_mapping_v1: {
          outcome: 'ok',
          existing_mapping: null,
          exact_match: { productId: 812001, reason: 'external_code' },
          similar_matches: []
        },
        confirm_ifood_product_mapping_v1: {
          outcome: 'ok',
          mapping_id: 'map-1',
          mapping_status: 'confirmed',
          product_id: 812001
        }
      }
    });
    const route = await loadRoute({ supabase });

    const getResponse = await route.GET({
      request: makeRequest(),
      url: new URL('https://zelopdv.test/api/integrations/ifood/product-mappings?merchantId=m1&externalItemId=i1&externalCode=812001&name=Burger')
    });
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.exactMatch.productId).toBe(812001);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'suggest_ifood_product_mapping_v1',
      expect.objectContaining({
        p_empresa_id: EMPRESA_ID,
        p_merchant_id: 'm1',
        p_external_item_id: 'i1',
        p_external_code: '812001',
        p_item_name: 'Burger'
      })
    );

    const postResponse = await route.POST({
      request: makeRequest({
        body: {
          merchantId: 'm1',
          externalItemId: 'i1',
          productId: 812001,
          action: 'confirm'
        }
      })
    });
    expect(postResponse.status).toBe(200);
    const postBody = await postResponse.json();
    expect(postBody).toEqual({
      mappingId: 'map-1',
      mappingStatus: 'confirmed',
      productId: 812001
    });
  });

  it('returns 401 without a bearer token', async () => {
    const route = await loadRoute({ supabase: makeSupabase() });
    const response = await route.GET({
      request: makeRequest({ token: null }),
      url: new URL('https://zelopdv.test/api/integrations/ifood/product-mappings?merchantId=m&externalItemId=i')
    });
    expect(response.status).toBe(401);
  });
});
