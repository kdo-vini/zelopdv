import { beforeEach, describe, expect, it, vi } from 'vitest';

const ownerId = 'owner-1';
const operatorId = 'operator-1';
const accessId = 'access-1';

async function loadDelete(overrides = {}) {
  const state = {
    accessUsers: [{ id: accessId, owner_user_id: ownerId, auth_user_id: operatorId,
      email: 'operator@example.test', status: 'blocked', role_id: 'role-1' }],
    subscriptions: [],
    subscriptionError: null,
    deleteError: null,
    events: [],
    ...overrides,
  };
  const deleteAuthUser = vi.fn(async () => {
    state.events.push('auth:delete');
    return { error: null };
  });
  const audit = vi.fn(async () => { state.events.push('audit:insert'); });
  const supabaseAdmin = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: ownerId } }, error: null })),
      admin: { deleteUser: deleteAuthUser },
    },
    from(table) {
      const filters = [];
      let operation = 'select';
      let rowLimit = Infinity;
      const rows = () => state[table === 'access_users' ? 'accessUsers' : 'subscriptions']
        .filter((row) => filters.every(([column, value]) => row[column] === value));
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        limit(value) { rowLimit = value; return query; },
        delete() { operation = 'delete'; return query; },
        async maybeSingle() {
          state.events.push(`${table}:select`);
          if (table === 'subscriptions' && state.subscriptionError) {
            return { data: rows()[0] ?? null, error: state.subscriptionError };
          }
          const selected = rows().slice(0, rowLimit);
          // PostgREST rejects a singular result when multiple history rows match.
          return selected.length > 1
            ? { data: null, error: { code: 'PGRST116', message: 'Multiple rows returned' } }
            : { data: selected[0] ?? null, error: null };
        },
        then(resolve, reject) {
          state.events.push(`${table}:${operation}`);
          if (operation === 'delete' && !state.deleteError) {
            const selected = rows();
            state.accessUsers = state.accessUsers.filter((row) => !selected.includes(row));
          }
          return Promise.resolve({ error: state.deleteError }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin }));
  vi.doMock('$lib/server/accessControl', () => ({ logServerAuditAction: audit }));
  const { DELETE } = await import('../src/routes/api/access/users/[id]/+server.js');
  const invoke = () => DELETE({
    request: new Request('http://localhost/api/access/users/access-1', {
      method: 'DELETE', headers: { authorization: 'Bearer test-token' },
    }),
    params: { id: accessId },
  });
  return { state, deleteAuthUser, audit, invoke };
}

beforeEach(() => { vi.resetModules(); });

describe('DELETE access user preserves independent owner accounts', () => {
  it('preserves Auth when several historical subscriptions match, regardless of status', async () => {
    const { state, deleteAuthUser, audit, invoke } = await loadDelete({ subscriptions: [
      { id: 'old-1', user_id: operatorId, status: 'canceled' },
      { id: 'old-2', user_id: operatorId, status: 'expired' },
    ] });
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, auth_deleted: false });
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(state.accessUsers).toEqual([]);
    expect(state.events).toEqual(['access_users:select', 'subscriptions:select', 'access_users:delete', 'audit:insert']);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      auth_skipped_reason: 'has_own_subscription', auth_deleted: false,
    }) }));
  });

  it.each([
    { name: 'no data', subscriptions: [] },
    { name: 'partial data', subscriptions: [{ id: 'partial', user_id: operatorId }] },
  ])('stops before any deletion or audit write on a query error with $name', async ({ subscriptions }) => {
    const { state, deleteAuthUser, audit, invoke } = await loadDelete({
      subscriptions,
      subscriptionError: { code: '57014', message: 'Query timed out' },
    });
    const response = await invoke();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(state.accessUsers).toHaveLength(1);
    expect(state.events).toEqual(['access_users:select', 'subscriptions:select']);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('preserves an ordinary owner with one subscription', async () => {
    const { state, deleteAuthUser, invoke } = await loadDelete({ subscriptions: [
      { id: 'own-1', user_id: operatorId, status: 'active' },
    ] });
    expect((await invoke()).status).toBe(200);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(state.accessUsers).toEqual([]);
  });

  it('deletes the link then Auth for a true subuser with no subscription of their own', async () => {
    const { state, deleteAuthUser, invoke } = await loadDelete({ subscriptions: [
      { id: 'other-owner-sub', user_id: ownerId, status: 'active' },
    ] });
    expect(await (await invoke()).json()).toEqual({ success: true, auth_deleted: true });
    expect(deleteAuthUser).toHaveBeenCalledExactlyOnceWith(operatorId);
    expect(state.accessUsers).toEqual([]);
    expect(state.events).toEqual(['access_users:select', 'subscriptions:select', 'access_users:delete', 'auth:delete', 'audit:insert']);
  });

  it('only removes the link for an invitation that has no Auth account', async () => {
    const { state, deleteAuthUser, invoke } = await loadDelete({ accessUsers: [
      { id: accessId, owner_user_id: ownerId, auth_user_id: null, status: 'pending' },
    ] });
    expect(await (await invoke()).json()).toEqual({ success: true, auth_deleted: false });
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(state.events).toEqual(['access_users:select', 'access_users:delete', 'audit:insert']);
  });

  it('does not delete Auth if removing the access link fails', async () => {
    const { state, deleteAuthUser, audit, invoke } = await loadDelete({ deleteError: { message: 'Delete failed' } });
    expect((await invoke()).status).toBe(500);
    expect(state.accessUsers).toHaveLength(1);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does not operate on another owner’s access link', async () => {
    const { state, deleteAuthUser, audit, invoke } = await loadDelete({ accessUsers: [
      { id: accessId, owner_user_id: 'another-owner', auth_user_id: operatorId },
    ] });
    expect((await invoke()).status).toBe(404);
    expect(state.accessUsers).toHaveLength(1);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(state.events).toEqual(['access_users:select']);
  });
});
