export const OFFLINE_TYPES = new Set([
  'sale.create', 'order.create', 'caixa.open', 'caixa.move', 'caixa.close', 'mesa.open',
  'mesa.item.add', 'mesa.item.delta', 'mesa.payment.add', 'mesa.payment.remove', 'mesa.transfer',
  'mesa.cancel', 'mesa.close', 'mesa.update'
]);

export function validateOfflineBatch(body) {
  const operations = body?.operations;
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 50) {
    throw new Error('Envie entre 1 e 50 operações.');
  }
  const seen = new Set();
  for (const op of operations) {
    if (!op || op.schemaVersion !== 1 || !OFFLINE_TYPES.has(op.type)
      || !['operationId', 'deviceId', 'entityType', 'entityId', 'ownerUserId', 'operatorId'].every(
        key => typeof op[key] === 'string' && op[key].length > 0 && op[key].length <= 200)
      || !Number.isSafeInteger(op.sequence) || op.sequence < 0
      || !Array.isArray(op.dependencies) || op.dependencies.length > 10000
      || !op.dependencies.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)
      || typeof op.occurredAt !== 'string' || !Number.isFinite(Date.parse(op.occurredAt))
      || !op.payload || typeof op.payload !== 'object' || Array.isArray(op.payload)
      || (op.baseRevision != null && (!Number.isSafeInteger(op.baseRevision) || op.baseRevision < 0))
      || seen.has(op.operationId)) {
      throw new Error('Operação offline inválida ou repetida no lote.');
    }
    seen.add(op.operationId);
  }
  return operations;
}

export function classifyOfflineRpcError(error) {
  const code = String(error?.code || '');
  if (['42501', '28000'].includes(code)) return 'rejected';
  if (code.startsWith('22') || code.startsWith('23') || code === 'P0001') return 'needs_review';
  return 'retry';
}
