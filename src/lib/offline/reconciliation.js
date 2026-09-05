import { db } from '../offlineDb.js';
import { confirmOperation } from './operations.js';

/** Retry transport/auth failures only. Business conflicts require a recorded owner decision. */
export async function retryPendingOperations(ownerUserId) {
  if (!ownerUserId) throw new Error('Loja não identificada.');
  await db.transaction('rw', db.offline_operations, async () => {
    await db.offline_operations.where('ownerUserId').equals(ownerUserId)
      .filter(row => ['pending', 'needs_auth'].includes(row.status))
      .modify({ status: 'pending', nextAttemptAt: 0, leaseId: null, leaseUntil: 0 });
  });
}

/** Remote acknowledgement is required; a lost response leaves local work recoverable. */
export async function reconcileOperation({ ownerUserId, userId, operationId, action, note, request }) {
  if (!ownerUserId || userId !== ownerUserId) throw new Error('Somente o titular pode conferir.');
  if (!['retry', 'record_duplicate', 'record_additional_sale', 'record_refund'].includes(action) || typeof note !== 'string' || note.trim().length < 5) throw new Error('Informe uma justificativa para a conferência.');
  const current = await db.offline_operations.get([ownerUserId, operationId]);
  if (!current || current.status !== 'needs_review') throw new Error('Este lançamento não aguarda conferência.');
  const acknowledgement = await request('/api/offline/reconcile', { method: 'POST', body: JSON.stringify({ operationId, action, note: note.trim() }) });
  await confirmOperation(ownerUserId, operationId, acknowledgement);
  return acknowledgement;
}
