import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSupabaseAdmin(state) {
  function findReferralByFilters(filters = {}) {
    const referrals = Object.values(state.referrals || {});

    return referrals.find((referral) => {
      if (filters.id && referral.id !== filters.id) return false;
      if (filters.referral_id && referral.referral_id !== filters.referral_id) return false;
      if (filters.referral_code && referral.referral_code !== filters.referral_code) return false;
      if (filters.referred_empresa_id && referral.referred_empresa_id !== filters.referred_empresa_id) return false;
      if (filters.referred_email && referral.referred_email !== filters.referred_email) return false;
      if (filters.status_neq && referral.status === filters.status_neq) return false;
      return true;
    }) || null;
  }

  function findRewardByFilters(filters = {}) {
    const rewards = Object.values(state.rewards || {});

    return rewards.find((reward) => {
      if (filters.id && reward.id !== filters.id) return false;
      if (filters.referral_id && reward.referral_id !== filters.referral_id) return false;
      if (filters.empresa_id && reward.empresa_id !== filters.empresa_id) return false;
      return true;
    }) || null;
  }

  return {
    auth: {
      getUser: vi.fn(),
      admin: {
        getUserById: vi.fn(async (userId) => ({
          data: {
            user: {
              id: userId,
              email: state.authUsers[userId]?.email || null,
            },
          },
        })),
      },
    },
    from: vi.fn((table) => {
      if (table === 'access_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null })),
              })),
            })),
          })),
        };
      }

      if (table === 'super_admins') {
        const selectChain = {
          filters: {},
          eq(field, value) {
            this.filters[field] = value;
            return this;
          },
          async maybeSingle() {
            const admin = Object.values(state.superAdmins || {}).find((entry) => {
              if (this.filters.user_id && entry.user_id !== this.filters.user_id) return false;
              if (this.filters.is_active !== undefined && entry.is_active !== this.filters.is_active) return false;
              return true;
            }) || null;
            return { data: admin };
          },
          async single() {
            return this.maybeSingle();
          },
        };

        return {
          select: vi.fn(() => ({ ...selectChain })),
        };
      }

      if (table === 'empresa_perfil') {
        const selectChain = {
          filters: {},
          eq(field, value) {
            this.filters[field] = value;
            return this;
          },
          async maybeSingle() {
            if (this.filters.referral_code) {
              return {
                data: Object.values(state.profiles).find((profile) => profile.referral_code === this.filters.referral_code) || null,
              };
            }
            if (this.filters.user_id) {
              return {
                data: state.profiles[this.filters.user_id] || null,
              };
            }
            return { data: null };
          },
        };

        return {
          select: vi.fn(() => ({ ...selectChain })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }

      if (table === 'referrals') {
        const selectChain = {
          filters: {},
          eq(field, value) {
            this.filters[field] = value;
            return this;
          },
          neq(field, value) {
            if (field === 'status') this.filters.status_neq = value;
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          ilike(field, value) {
            this.filters[field] = value;
            return this;
          },
          async maybeSingle() {
            return { data: findReferralByFilters(this.filters) };
          },
          async single() {
            return this.maybeSingle();
          },
        };

        return {
          select: vi.fn(() => ({ ...selectChain })),
          update: vi.fn((payload) => ({
            eq: vi.fn((field, value) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const referral = findReferralByFilters({ [field]: value });
                  if (!referral) return { data: null, error: null };
                  state.referrals[referral.id] = { ...referral, ...payload };
                  return { data: state.referrals[referral.id], error: null };
                }),
                maybeSingle: vi.fn(async () => {
                  const referral = findReferralByFilters({ [field]: value });
                  if (!referral) return { data: null, error: null };
                  state.referrals[referral.id] = { ...referral, ...payload };
                  return { data: state.referrals[referral.id], error: null };
                }),
              })),
            })),
          })),
          insert: vi.fn((payload) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: payload, error: null })),
            })),
          })),
        };
      }

      if (table === 'referral_rewards') {
        const selectChain = {
          filters: {},
          eq(field, value) {
            this.filters[field] = value;
            return this;
          },
          in() {
            return this;
          },
          gte() {
            return this;
          },
          async maybeSingle() {
            return { data: findRewardByFilters(this.filters) };
          },
          async single() {
            return this.maybeSingle();
          },
        };

        return {
          select: vi.fn((_, options = {}) => {
            if (options.head && options.count === 'exact') {
              return {
                eq() { return this; },
                in() { return this; },
                gte: vi.fn(async () => ({ count: Object.values(state.rewards || {}).length, error: null })),
              };
            }
            return { ...selectChain };
          }),
          update: vi.fn((payload) => ({
            eq: vi.fn((field, value) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const reward = findRewardByFilters({ [field]: value });
                  if (!reward) return { data: null, error: null };
                  state.rewards[reward.id] = { ...reward, ...payload };
                  return { data: state.rewards[reward.id], error: null };
                }),
              })),
            })),
          })),
          upsert: vi.fn((payload) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const existing = findRewardByFilters({ referral_id: payload.referral_id });
                const id = existing?.id || payload.id || `reward-${Object.keys(state.rewards || {}).length + 1}`;
                state.rewards[id] = { ...(existing || {}), ...payload, id };
                return { data: state.rewards[id], error: null };
              }),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('server referrals', () => {
  it('revives a rejected referral caused by same_documento when the user finishes signup', async () => {
    const state = {
      currentReferralId: 'ref-1',
      authUsers: {
        'owner-1': { email: 'kdo.vini@gmail.com' },
      },
      profiles: {
        'owner-1': {
          user_id: 'owner-1',
          nome_exibicao: 'Donutopia',
          contato: '5511999999999',
          documento: '12345678000199',
          referral_code: 'DONUTOPIA',
        },
        'lead-1': {
          user_id: 'lead-1',
          contato: '5511999999999',
          documento: '12345678000199',
        },
      },
      referrals: {
        'ref-1': {
          id: 'ref-1',
          referrer_empresa_id: 'owner-1',
          referral_code: 'DONUTOPIA',
          status: 'rejected',
          rejection_reason: 'same_documento',
        },
      },
      rewards: {},
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const { claimReferralForUser } = await import('../src/lib/server/referrals.js');
    const result = await claimReferralForUser({
      referralCode: 'DONUTOPIA',
      referralId: 'ref-1',
      referredUserId: 'lead-1',
      referredEmail: 'maju.brito874@gmail.com',
      wantedStatus: 'signed_up',
    });

    expect(result.claimed).toBe(true);
    expect(result.referral.status).toBe('signed_up');
    expect(result.referral.rejection_reason).toBeNull();
  });

  it('still blocks the strict same_email case', async () => {
    const state = {
      currentReferralId: null,
      authUsers: {
        'owner-1': { email: 'kdo.vini@gmail.com' },
      },
      profiles: {
        'owner-1': {
          user_id: 'owner-1',
          nome_exibicao: 'Donutopia',
          contato: '5511999999999',
          documento: '12345678000199',
          referral_code: 'DONUTOPIA',
        },
        'lead-1': {
          user_id: 'lead-1',
          contato: '000',
          documento: '999',
        },
      },
      referrals: {},
      rewards: {},
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const { claimReferralForUser } = await import('../src/lib/server/referrals.js');
    const result = await claimReferralForUser({
      referralCode: 'DONUTOPIA',
      referredUserId: 'lead-1',
      referredEmail: 'kdo.vini@gmail.com',
      wantedStatus: 'signed_up',
    });

    expect(result.claimed).toBe(false);
    expect(result.reason).toBe('same_email');
  });

  it('reopens a referral to pending payment and cancels the approved reward for audit consistency', async () => {
    const state = {
      authUsers: {
        'owner-1': { email: 'kdo.vini@gmail.com' },
      },
      superAdmins: {
        'admin-1': { id: 'sa-1', user_id: 'admin-1', is_active: true },
      },
      profiles: {
        'owner-1': {
          user_id: 'owner-1',
          nome_exibicao: 'Donutopia',
          referral_code: 'DONUTOPIA',
        },
      },
      referrals: {
        'ref-1': {
          id: 'ref-1',
          referrer_empresa_id: 'owner-1',
          referred_empresa_id: 'lead-1',
          referral_code: 'DONUTOPIA',
          status: 'paid_manual_confirmed',
          admin_notes: 'Pagamento confirmado.',
          paid_at: '2026-05-16T19:00:00.000Z',
          confirmed_by: 'admin-1',
        },
      },
      rewards: {
        'reward-1': {
          id: 'reward-1',
          referral_id: 'ref-1',
          empresa_id: 'owner-1',
          reward_type: 'credit',
          amount_cents: 3000,
          status: 'approved',
        },
      },
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const { executeReferralAdminAction } = await import('../src/lib/server/referrals.js');
    const result = await executeReferralAdminAction('ref-1', 'reopen_pending_payment', 'admin-1', {
      notes: 'Pagamento entrou em revisão.',
    });

    expect(result.referral.status).toBe('pending_payment');
    expect(result.referral.paid_at).toBeNull();
    expect(result.reward.status).toBe('cancelled');
    expect(result.referral.admin_notes).toContain('Pagamento entrou em revisão.');
  });

  it('rejects a referral manually and cancels an applied reward', async () => {
    const state = {
      authUsers: {
        'owner-1': { email: 'kdo.vini@gmail.com' },
      },
      superAdmins: {
        'admin-1': { id: 'sa-1', user_id: 'admin-1', is_active: true },
      },
      profiles: {
        'owner-1': {
          user_id: 'owner-1',
          nome_exibicao: 'Donutopia',
          referral_code: 'DONUTOPIA',
        },
      },
      referrals: {
        'ref-1': {
          id: 'ref-1',
          referrer_empresa_id: 'owner-1',
          referred_empresa_id: 'lead-1',
          referral_code: 'DONUTOPIA',
          status: 'reward_applied',
          admin_notes: 'Crédito já aplicado.',
        },
      },
      rewards: {
        'reward-1': {
          id: 'reward-1',
          referral_id: 'ref-1',
          empresa_id: 'owner-1',
          reward_type: 'credit',
          amount_cents: 3000,
          status: 'applied',
        },
      },
    };

    vi.doMock('../src/lib/server/supabaseAdmin.js', () => ({
      supabaseAdmin: makeSupabaseAdmin(state),
    }));

    const { executeReferralAdminAction } = await import('../src/lib/server/referrals.js');
    const result = await executeReferralAdminAction('ref-1', 'reject_duplicate', 'admin-1', {
      notes: 'Identificada duplicidade no cadastro.',
    });

    expect(result.referral.status).toBe('rejected');
    expect(result.referral.rejection_reason).toBe('duplicate');
    expect(result.reward.status).toBe('cancelled');
    expect(result.referral.admin_notes).toContain('duplicidade');
  });
});
