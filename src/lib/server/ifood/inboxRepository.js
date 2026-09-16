// The webhook route never touches Supabase directly. Every write goes
// through `enqueue_ifood_webhook_event_v1`, the only RPC that can resolve a
// bare `merchantId` (all the webhook envelope carries) into a connection,
// because `ifood_internal` has no PostgREST exposure and no other lookup
// path. Keeping the RPC name and shape behind this seam lets tests inject a
// fake `supabase` client instead of a real database.

// DB-level outcomes collapse to the vocabulary the webhook route cares
// about: a merchant the RPC could not attribute to a live connection is
// simply not persisted, and that maps to the same "ignored" outcome the
// route uses to still answer 202 without writing anything.
const DB_OUTCOME_TO_REPOSITORY_OUTCOME = Object.freeze({
  inserted: 'inserted',
  duplicate: 'duplicate',
  unknown_merchant: 'ignored'
});

function toTimestampOrNull(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * @param {{ supabase: { rpc: Function } }} deps
 */
export function createIfoodInboxRepository({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new TypeError('createIfoodInboxRepository requires a supabase client with rpc()');
  }

  /**
   * @param {{
   *   eventId: string, merchantId: string, externalOrderId?: string | null,
   *   eventType: string, externalRevision?: number, occurredAt?: string | null,
   *   payload: object
   * }} event
   * @returns {Promise<{ outcome: 'inserted' | 'duplicate' | 'ignored' }>}
   */
  async function enqueueWebhookEvent(event) {
    let data;
    let error;
    try {
      ({ data, error } = await supabase
        .rpc('enqueue_ifood_webhook_event_v1', {
          p_event_id: event.eventId,
          p_merchant_id: event.merchantId,
          p_external_order_id: event.externalOrderId ?? null,
          p_event_type: event.eventType,
          p_external_revision: Number.isFinite(event.externalRevision) ? event.externalRevision : 0,
          p_occurred_at: toTimestampOrNull(event.occurredAt),
          p_payload: event.payload
        })
        .single());
    } catch {
      // Never surface the underlying driver error: it can echo query
      // parameters (payload/ids) in some drivers' error objects.
      throw new Error('iFood webhook inbox enqueue failed');
    }

    if (error) {
      throw new Error('iFood webhook inbox enqueue failed');
    }

    const outcome = data && DB_OUTCOME_TO_REPOSITORY_OUTCOME[data.outcome];
    if (!outcome) {
      throw new Error('iFood webhook inbox enqueue returned an unrecognized outcome');
    }

    return { outcome };
  }

  return { enqueueWebhookEvent };
}

export default createIfoodInboxRepository;
