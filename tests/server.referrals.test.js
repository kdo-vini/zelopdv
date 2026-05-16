import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSupabaseAdmin(state) {
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
          neq() {
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
            if (this.filters.id) {
              return { data: state.referrals[this.filters.id] || null };
            }
            return { data: null };
          },
        };

        return {
          select: vi.fn(() => ({ ...selectChain })),
          update: vi.fn((payload) => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const referral = state.referrals[state.currentReferralId];
                  state.referrals[state.currentReferralId] = { ...referral, ...payload };
                  return { data: state.referrals[state.currentReferralId], error: null };
                }),
                maybeSingle: vi.fn(async () => {
                  const referral = state.referrals[state.currentReferralId];
                  state.referrals[state.currentReferralId] = { ...referral, ...payload };
                  return { data: state.referrals[state.currentReferralId], error: null };
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
});
