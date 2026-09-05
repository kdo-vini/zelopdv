import { vi } from 'vitest';

// HTTP unit fixture only; real locking/constraints are tested in PostgreSQL.
export function makePixReservationMock(state) {
  return vi.fn((name, params) => {
    const execute = async () => {
      if (name === 'reserve_pix_payment') {
        if (state.reserveError) return { data: null, error: state.reserveError };
        const existing = state.reservation || state.selectResults?.billing_payments;
        if (existing) return { data: { action: state.reserveAction ||
          (['dispatching', 'unknown'].includes(existing.creation_state) ? 'blocked' : 'reuse'), payment: existing }, error: null };
        const sub = state.selectResults?.subscriptions;
        state.reservation = {
          id: '11111111-1111-4111-8111-111111111111', user_id: params.p_user_id,
          subscription_id: sub?.id || null, kind: sub ? 'subscription_renewal' : 'subscription_start',
          provider: 'abacatepay', method: 'pix', status: 'pending', creation_state: 'dispatching',
          plan_tier: params.p_plan_tier, amount_expected_cents: params.p_amount_cents,
          has_mesas_addon: params.p_mesas, has_acessos_addon: params.p_acessos, has_zelo_menu: params.p_menu,
          external_reference: 'pix_11111111-1111-4111-8111-111111111111',
          metadata: { ...params.p_metadata, paymentId: '11111111-1111-4111-8111-111111111111', userId: params.p_user_id },
        };
        state.writes.push({ table: 'billing_payments', operation: 'insert', payload: { ...state.reservation } });
        return { data: { action: 'create', payment: state.reservation }, error: null };
      }
      if (name === 'complete_pix_creation') {
        if (state.completeError) return { data: null, error: state.completeError };
        const row = state.reservation;
        const remote = params.p_remote;
        Object.assign(row, { creation_state: params.p_outcome }, remote ? {
          provider_payment_id: remote.id, br_code: remote.brCode,
          qr_code_base64: remote.brCodeBase64, expires_at: remote.expiresAt,
        } : {});
        return { data: { ...row }, error: null };
      }
      state.rpcCalls = [...(state.rpcCalls || []), { fn: name, params }];
      return { data: state.rpcResult ?? null, error: state.rpcError ?? null };
    };
    return { then: (resolve, reject) => execute().then(resolve, reject), single: execute };
  });
}
