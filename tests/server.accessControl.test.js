import { beforeEach, describe, expect, it, vi } from 'vitest';

function filterRows(rows, filters) {
  return rows.filter((row) => filters.every((filter) => {
    const value = row?.[filter.field];
    if (filter.type === 'eq') return value === filter.value;
    if (filter.type === 'neq') return value !== filter.value;
    if (filter.type === 'in') return filter.values.includes(value);
    return true;
  }));
}

function sortRows(rows, orderConfig) {
  if (!orderConfig) return rows;

  const { field, ascending } = orderConfig;
  const factor = ascending === false ? -1 : 1;

  return [...rows].sort((a, b) => {
    if (a?.[field] === b?.[field]) return 0;
    return a?.[field] > b?.[field] ? factor : -factor;
  });
}

function buildQuery(table, state) {
  const queryState = {
    filters: [],
    order: null,
    limit: null,
    selectOptions: {},
  };

  function getRows() {
    const rows = Array.isArray(state[table])
      ? state[table]
      : state[table] == null
        ? []
        : [state[table]];

    const filtered = filterRows(rows, queryState.filters);
    const ordered = sortRows(filtered, queryState.order);
    return queryState.limit == null ? ordered : ordered.slice(0, queryState.limit);
  }

  async function execute() {
    const rows = getRows();

    if (queryState.selectOptions?.head && queryState.selectOptions?.count === 'exact') {
      return { count: rows.length, error: state.countError ?? null };
    }

    return { data: rows, error: null };
  }

  const query = {
    select(_columns, options = {}) {
      queryState.selectOptions = options;
      return query;
    },
    eq(field, value) {
      queryState.filters.push({ type: 'eq', field, value });
      return query;
    },
    neq(field, value) {
      queryState.filters.push({ type: 'neq', field, value });
      return query;
    },
    in(field, values) {
      queryState.filters.push({ type: 'in', field, values });
      return query;
    },
    order(field, options = {}) {
      queryState.order = { field, ascending: options.ascending };
      return query;
    },
    limit(value) {
      queryState.limit = value;
      return query;
    },
    async maybeSingle() {
      const rows = getRows();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = getRows();
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
  };

  return query;
}

function makeSupabaseAdmin(state) {
  return {
    from: vi.fn((table) => ({
      ...buildQuery(table, state),
      upsert: vi.fn(async (rows, options) => {
        state.upsertCalls.push({ table, rows, options });
        return { error: state.upsertError ?? null };
      }),
      insert: vi.fn((payload) => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            if (state.insertError) {
              return { data: null, error: state.insertError };
            }

            const row = {
              id: state.nextAccessUserId ?? `access-user-${state.insertedAccessUsers.length + 1}`,
              ...payload,
            };
            state.insertedAccessUsers.push(row);
            state.access_users = [...(state.access_users ?? []), row];

            return { data: { id: row.id }, error: null };
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (field, value) => {
          state.deleteCalls.push({ table, field, value });
          state[table] = (state[table] ?? []).filter((row) => row?.[field] !== value);
          return { error: state.deleteError ?? null };
        }),
      })),
      update: vi.fn((payload) => {
        const filters = [];
        const updateQuery = {
          eq(field, value) {
            filters.push({ field, value });
            return updateQuery;
          },
          select() {
            return {
              single: async () => {
                const rows = (state[table] ?? []).map((row) => {
                  const match = filters.every((f) => row?.[f.field] === f.value);
                  if (!match) return row;
                  return { ...row, ...payload };
                });
                state[table] = rows;
                const updated = rows.find((row) =>
                  filters.every((f) => row?.[f.field] === f.value),
                );
                state.updateCalls.push({ table, payload, filters });
                if (state.updateError) return { data: null, error: state.updateError };
                return { data: updated ? { id: updated.id } : null, error: null };
              },
            };
          },
        };
        return updateQuery;
      }),
    })),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users: state.authUsers ?? [] },
          error: state.listUsersError ?? null,
        })),
        generateLink: vi.fn(async (payload) => {
          state.inviteCalls.push(payload);
          return {
            data: state.generateLinkData ?? {
              user: {
                id: state.generatedInviteUserId ?? 'auth-invite-1',
              },
              properties: {
                action_link: state.generatedInviteLink ?? 'https://zelopdv.com.br/auth/v1/verify?token=test',
              },
            },
            error: state.inviteError ?? null,
          };
        }),
        deleteUser: vi.fn(async (id) => {
          state.deletedAuthUsers.push(id);
          return { data: { user: null }, error: state.deleteUserError ?? null };
        }),
      },
    },
  };
}

async function loadAccessControl(state) {
  vi.resetModules();
  vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
    supabaseAdmin: makeSupabaseAdmin(state),
  }));
  vi.doMock('../src/lib/server/email.js', () => ({
    isEmailConfigured: vi.fn(() => state.emailConfigured ?? true),
    sendEmail: vi.fn(async (payload) => {
      state.sentEmails.push(payload);
      return state.sendEmailResult ?? true;
    }),
  }));
  vi.doMock('../src/lib/server/emailTemplates.js', () => ({
    emailAccessControlInvite: vi.fn(({ companyName, roleName, inviteUrl }) => ({
      subject: `Convite para acessar ${companyName || 'sua empresa'} no Zelo PDV`,
      html: `<p>Empresa: ${companyName || 'sua empresa'} | Cargo: ${roleName || 'sem-cargo'} | Link: ${inviteUrl}</p>`,
    })),
  }));
  return import('../src/lib/server/accessControl.js');
}

function createState(overrides = {}) {
  return {
    access_roles: [],
    access_settings: [],
    access_users: [],
    empresa_perfil: [],
    subscriptions: [],
    authUsers: [],
    upsertCalls: [],
    insertedAccessUsers: [],
    deleteCalls: [],
    updateCalls: [],
    deletedAuthUsers: [],
    inviteCalls: [],
    sentEmails: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('server accessControl', () => {
  it('provisions the three default system roles for an owner', async () => {
    const state = createState();
    const { ensureDefaultRoles } = await loadAccessControl(state);

    await ensureDefaultRoles('owner-1');

    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]).toMatchObject({
      table: 'access_roles',
      options: { onConflict: 'owner_user_id,name', ignoreDuplicates: true },
    });
    expect(state.upsertCalls[0].rows).toHaveLength(3);
    expect(state.upsertCalls[0].rows.map((row) => row.name)).toEqual(['Caixa', 'Atendente', 'Gerente']);
    expect(state.upsertCalls[0].rows.every((row) => row.owner_user_id === 'owner-1')).toBe(true);
  });

  it('blocks new invites when the default 5 sub-user limit has been reached', async () => {
    const state = createState({
      access_users: Array.from({ length: 5 }, (_, index) => ({
        id: `sub-${index + 1}`,
        owner_user_id: 'owner-1',
        email: `sub${index + 1}@test.com`,
        status: index === 4 ? 'pending' : 'active',
      })),
    });
    const { inviteSubUser } = await loadAccessControl(state);

    await expect(inviteSubUser('owner-1', 'novo@test.com', 'role-1')).rejects.toBe('Limite de subusuários atingido.');
    expect(state.insertedAccessUsers).toHaveLength(0);
    expect(state.inviteCalls).toHaveLength(0);
  });

  it('rejects an email already invited under the same owner', async () => {
    const state = createState({
      access_users: [
        {
          id: 'access-1',
          owner_user_id: 'owner-1',
          email: 'caixa@test.com',
          status: 'pending',
        },
      ],
    });
    const { inviteSubUser } = await loadAccessControl(state);

    await expect(inviteSubUser('owner-1', 'caixa@test.com', 'role-1')).rejects.toBe(
      'E-mail já convidado ou cadastrado nesta empresa.',
    );
    expect(state.insertedAccessUsers).toHaveLength(0);
  });

  it('rejects an email that already belongs to a ZeloPDV owner account', async () => {
    const state = createState({
      authUsers: [{ id: 'owner-2', email: 'titular@test.com' }],
      subscriptions: [{ id: 'sub-owner', user_id: 'owner-2', status: 'active' }],
    });
    const { inviteSubUser } = await loadAccessControl(state);

    await expect(inviteSubUser('owner-1', 'titular@test.com', 'role-1')).rejects.toBe(
      'Este e-mail já possui uma conta ZeloPDV como titular.',
    );
    expect(state.insertedAccessUsers).toHaveLength(0);
    expect(state.inviteCalls).toHaveLength(0);
  });

  it('creates a pending access row and sends the auth invite on success', async () => {
    const state = createState({
      access_settings: [{ owner_user_id: 'owner-1', max_subusers: 5 }],
      access_roles: [{ id: 'role-gerente', owner_user_id: 'owner-1', name: 'Gerente' }],
      empresa_perfil: [{ user_id: 'owner-1', nome_exibicao: 'Lanchonete Central' }],
      nextAccessUserId: 'access-user-99',
      generatedInviteLink: 'https://zelopdv.com.br/auth/v1/verify?token=abc',
    });
    const { inviteSubUser } = await loadAccessControl(state);

    const result = await inviteSubUser('owner-1', 'novo@test.com', 'role-gerente');

    expect(result).toEqual({ success: true, accessUserId: 'access-user-99' });
    expect(state.insertedAccessUsers).toEqual([
      {
        id: 'access-user-99',
        owner_user_id: 'owner-1',
        email: 'novo@test.com',
        role_id: 'role-gerente',
        status: 'pending',
      },
    ]);
    expect(state.inviteCalls).toEqual([
      {
        type: 'invite',
        email: 'novo@test.com',
        options: {
          redirectTo: 'https://zelopdv.com.br/redefinir-senha',
          data: {
            owner_user_id: 'owner-1',
            access_role_id: 'role-gerente',
            company_name: 'Lanchonete Central',
            role_name: 'Gerente',
          },
        },
      },
    ]);
    expect(state.sentEmails).toEqual([
      {
        to: 'novo@test.com',
        subject: 'Convite para acessar Lanchonete Central no Zelo PDV',
        html: '<p>Empresa: Lanchonete Central | Cargo: Gerente | Link: https://zelopdv.com.br/auth/v1/verify?token=abc</p>',
      },
    ]);
  });

  it('reactivates a previously-removed row instead of failing on the unique (owner,email) constraint', async () => {
    const state = createState({
      access_roles: [{ id: 'role-gerente', owner_user_id: 'owner-1', name: 'Gerente' }],
      empresa_perfil: [{ user_id: 'owner-1', nome_exibicao: 'Loja' }],
      access_users: [
        {
          id: 'access-removed-1',
          owner_user_id: 'owner-1',
          email: 'reconvite@test.com',
          status: 'removed',
          role_id: 'role-old',
          auth_user_id: 'auth-old-1',
        },
      ],
      generatedInviteLink: 'https://zelopdv.com.br/auth/v1/verify?token=re',
    });

    // Track the update call to confirm reactivation
    const originalFrom = state;
    state.updateCalls = [];

    const { inviteSubUser } = await loadAccessControl(state);

    const result = await inviteSubUser('owner-1', 'reconvite@test.com', 'role-gerente');

    expect(result).toEqual({ success: true, accessUserId: 'access-removed-1' });
    // No new row inserted — the existing 'removed' row was reused
    expect(state.insertedAccessUsers).toHaveLength(0);
    // Invite email still sent
    expect(state.inviteCalls).toHaveLength(1);
    expect(state.sentEmails).toHaveLength(1);
  });

  it('cleans up the pending row when the invite email cannot be sent', async () => {
    const state = createState({
      access_roles: [{ id: 'role-1', owner_user_id: 'owner-1', name: 'Caixa' }],
      empresa_perfil: [{ user_id: 'owner-1', nome_exibicao: 'Loja Bairro' }],
      nextAccessUserId: 'access-user-100',
      sendEmailResult: false,
    });
    const { inviteSubUser } = await loadAccessControl(state);

    await expect(inviteSubUser('owner-1', 'caixa@test.com', 'role-1')).rejects.toBe(
      'Erro ao enviar convite por e-mail. Tente novamente.',
    );

    expect(state.deleteCalls).toEqual([{ table: 'access_users', field: 'id', value: 'access-user-100' }]);
    expect(state.deletedAuthUsers).toEqual(['auth-invite-1']);
  });
});
