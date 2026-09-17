import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('GET /api/admin/analytics-data', () => {
  let GET, supabaseAdminMock, requestMock;

  beforeEach(async () => {
    vi.resetModules();

    // Mock supabaseAdmin
    const mockLastSeen = [
      { user_id: 'user-1', effective_last_seen: '2024-01-15T10:00:00Z' },
      { user_id: 'user-2', effective_last_seen: '2024-01-14T10:00:00Z' },
    ];
    const mockSales = [
      { id_usuario: 'user-1', sales_count: 150 },
      { id_usuario: 'user-2', sales_count: 75 },
    ];
    const mockRevenue = [
      { id_usuario: 'user-1', total_revenue: 45000.00 },
      { id_usuario: 'user-2', total_revenue: 22500.00 },
    ];

    supabaseAdminMock = {
      rpc: vi.fn((rpcName) => {
        if (rpcName === 'admin_get_users_last_seen') {
          return Promise.resolve({ data: mockLastSeen, error: null });
        }
        if (rpcName === 'admin_get_sales_counts') {
          return Promise.resolve({ data: mockSales, error: null });
        }
        if (rpcName === 'admin_get_total_sales_value') {
          return Promise.resolve({ data: mockRevenue, error: null });
        }
        return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
      }),
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'admin-123', email: 'admin@test.com' } },
          error: null,
        })),
      },
      from: vi.fn((table) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: table === 'super_admins' ? { id: 'sa-1', user_id: 'admin-123', is_active: true } : null,
                error: null,
              })),
            })),
          })),
        })),
      })),
    };

    vi.doMock('$lib/server/supabaseAdmin', () => ({
      supabaseAdmin: supabaseAdminMock,
    }));

    const module = await import('../src/routes/api/admin/analytics-data/+server.js');
    GET = module.GET;

    requestMock = {
      headers: {
        get: vi.fn((header) => {
          if (header === 'origin') return 'http://localhost:5174';
          if (header === 'authorization') return 'Bearer valid-jwt-token';
          return null;
        }),
      },
    };
  });

  it('returns analytics data for authenticated super admin', async () => {
    const response = await GET({ request: requestMock });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lastSeen).toHaveLength(2);
    expect(body.sales).toHaveLength(2);
    expect(body.revenue).toHaveLength(2);

    expect(body.lastSeen[0]).toEqual({
      user_id: 'user-1',
      effective_last_seen: '2024-01-15T10:00:00Z',
    });
    expect(body.sales[0]).toEqual({
      id_usuario: 'user-1',
      sales_count: 150,
    });
    expect(body.revenue[0]).toEqual({
      id_usuario: 'user-1',
      total_revenue: 45000.00,
    });
  });

  it('rejects request without authorization header', async () => {
    requestMock.headers.get = vi.fn((header) => {
      if (header === 'origin') return 'http://localhost:5174';
      if (header === 'authorization') return null;
      return null;
    });

    const response = await GET({ request: requestMock });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Não autorizado.');
  });

  it('rejects request from non-super-admin', async () => {
    supabaseAdminMock.from = vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null, // Not a super admin
              error: null,
            })),
          })),
        })),
      })),
    }));

    const response = await GET({ request: requestMock });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Acesso restrito a super admins.');
  });

  it('rejects request from disallowed origin', async () => {
    requestMock.headers.get = vi.fn((header) => {
      if (header === 'origin') return 'https://malicious-site.com';
      if (header === 'authorization') return 'Bearer valid-jwt-token';
      return null;
    });

    const response = await GET({ request: requestMock });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Origem não permitida.');
  });

  it('handles RPC errors gracefully', async () => {
    supabaseAdminMock.rpc = vi.fn((rpcName) => {
      if (rpcName === 'admin_get_users_last_seen') {
        return Promise.resolve({ data: null, error: { message: 'RPC failed' } });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const response = await GET({ request: requestMock });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('Failed to get last seen data');
  });
});
