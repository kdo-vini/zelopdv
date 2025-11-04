import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase client
let db = {};
const makeFrom = (table) => ({
  select: () => ({
    eq: () => ({
      order: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: db[table] ?? null })
        })
      }),
      maybeSingle: async () => ({ data: db[table] ?? null })
    })
  })
});

vi.mock('../src/lib/supabaseClient.js', () => {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: db.__session || null } }))
    },
    from: vi.fn((table) => makeFrom(table))
  };
  return { supabase, hasSupabaseConfig: true };
});

// Mock window.location
const originalWindow = global.window;

beforeEach(() => {
  global.window = { location: { href: '' } };
  db = { __session: null }; // reset
});

afterEach(() => {
  global.window = originalWindow;
  vi.resetModules();
});

describe('ensureActiveSubscription', () => {
  it('redirects to /login when no session', async () => {
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();
    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/login');
  });

  it('redirects to /perfil when profile incomplete and requireProfile', async () => {
    db.__session = { user: { id: 'u1', email: 'x@y.com' } };
    db['empresa_perfil'] = { nome_exibicao: '', documento: '', contato: '', largura_bobina: '80mm' };
    db['subscriptions'] = { status: 'active' };
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription({ requireProfile: true });
    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/perfil');
  });

  it('redirects to /assinatura when subscription not active', async () => {
    db.__session = { user: { id: 'u1', email: 'x@y.com' } };
    db['empresa_perfil'] = { nome_exibicao: 'A', documento: 'B', contato: 'C', largura_bobina: '80mm' };
    db['subscriptions'] = { status: 'canceled' };
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription();
    expect(res).toBeNull();
    expect(global.window.location.href).toContain('/assinatura');
  });

  it('returns user info when subscription active and profile ok', async () => {
    db.__session = { user: { id: 'u1', email: 'x@y.com' } };
    db['empresa_perfil'] = { nome_exibicao: 'A', documento: 'B', contato: 'C', largura_bobina: '80mm' };
    db['subscriptions'] = { status: 'active' };
    const { ensureActiveSubscription } = await import('../src/lib/guards.js');
    const res = await ensureActiveSubscription({ requireProfile: true });
    expect(res).toEqual({ userId: 'u1', email: 'x@y.com' });
    expect(global.window.location.href).toBe('');
  });
});
