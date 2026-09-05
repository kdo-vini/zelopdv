import { db, legacyToPayload } from '../offlineDb.js';

function requireOwner(owner) {
    if (!owner || typeof owner !== 'string') throw new Error('Titular obrigatório para armazenamento offline.');
}

export function canonicalJSON(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
}

export async function hashPayload(payload) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(payload)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId() {
    return db.transaction('rw', db.offline_meta, async () => {
        const existing = await db.offline_meta.get('deviceId');
        if (existing) return existing.value;
        const value = crypto.randomUUID();
        await db.offline_meta.put({ key: 'deviceId', value });
        return value;
    });
}

/** All validation/hashing finishes before opening IDB: no network or crypto await in a transaction. */
export async function commitOperation({ ownerUserId, operatorId, deviceId, type, entityType = type?.split('.')[0], entityId,
    payload, dependencies = [], baseRevision = null, operationId = crypto.randomUUID(), occurredAt = new Date().toISOString(), projection, clearDraft, legacySource }) {
    requireOwner(ownerUserId);
    if (!operatorId || !deviceId || !type || !entityType || !entityId || !payload || !operationId) throw new Error('Operação offline incompleta.');
    if (!Array.isArray(dependencies) || dependencies.includes(operationId)) throw new Error('Dependências inválidas.');
    // JSON round-trip enforces wire-compatible immutable values, stripping undefined consistently.
    const immutablePayload = JSON.parse(JSON.stringify(payload));
    const payloadHash = await hashPayload(immutablePayload);
    const intent = { ownerUserId, operatorId, deviceId, type, entityType, entityId, payload: immutablePayload, dependencies, baseRevision, operationId };
    return db.transaction('rw', db.offline_operations, db.offline_entities, db.offline_meta, db.offline_snapshots, db.offline_drafts, db.vendas_pendentes, async () => {
        const old = await db.offline_operations.get([ownerUserId, operationId]);
        if (old) {
            if (old.payloadHash !== payloadHash || old.type !== type || old.entityId !== entityId || old.operatorId !== operatorId || old.deviceId !== deviceId || canonicalJSON(old.dependencies) !== canonicalJSON(dependencies) || old.baseRevision !== baseRevision) throw new Error('Identificação já utilizada por outra intenção.');
            if (legacySource) {
                const current = await db.vendas_pendentes.get(legacySource.id);
                if (current && canonicalJSON(current) === canonicalJSON(legacySource)) await db.vendas_pendentes.update(current.id, { status: 'migrated', operationId });
            }
            return old;
        }
        if (legacySource) {
            const current = await db.vendas_pendentes.get(legacySource.id);
            if (!current || current.ownerUserId !== ownerUserId || canonicalJSON(current) !== canonicalJSON(legacySource)) throw new Error('Registro legado alterado durante migração.');
            await db.vendas_pendentes.update(current.id, { status: 'migrated', operationId });
        }
        const key = `sequence:${ownerUserId}:${deviceId}`;
        const sequence = ((await db.offline_meta.get(key))?.value || 0) + 1;
        const row = { ...intent, schemaVersion: 1, sequence, occurredAt, payloadHash, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null, createdAt: new Date().toISOString() };
        await db.offline_meta.put({ key, value: sequence });
        await db.offline_operations.add(row);
        if (projection !== undefined) {
            const value = projection?.update ? projection.update((await db.offline_snapshots.get([ownerUserId, projection.key]))?.value) : projection?.key ? projection.value : projection;
            await db.offline_entities.put({ ownerUserId, entityType, entityId, value, operationId, updatedAt: row.createdAt });
            if (projection?.key) await db.offline_snapshots.put({ ownerUserId, key: projection.key, value, updatedAt: row.createdAt });
        }
        if (clearDraft?.operatorId && clearDraft?.key) await db.offline_drafts.delete([ownerUserId, clearDraft.operatorId, clearDraft.key]);
        return row;
    });
}

/** Call only after the server has enabled protocol v1. Unknown owners/operators are never inferred. */
export async function migrateLegacyOperations(ownerUserId) {
    requireOwner(ownerUserId);
    const deviceId = await getDeviceId();
    const rows = await db.vendas_pendentes.where('ownerUserId').equals(ownerUserId).and(row => row.status === 'aguardando').toArray();
    let migrated = 0;
    for (const row of rows) {
        const operatorId = row.operatorUserId || row.payload?.operador_id;
        if (!operatorId) continue;
        // Stabilize the old key before conversion, also safe against legacy replay in another tab.
        const source = await db.transaction('rw', db.vendas_pendentes, async () => {
            const current = await db.vendas_pendentes.get(row.id);
            if (!current || current.status !== 'aguardando' || current.ownerUserId !== ownerUserId) return null;
            const payload = current.payload || legacyToPayload(current);
            if (!payload) return null;
            payload.client_sale_id ||= current.client_sale_id || crypto.randomUUID();
            const stable = { ...current, payload };
            await db.vendas_pendentes.put(stable);
            return stable;
        });
        if (!source) continue;
        await commitOperation({ ownerUserId, operatorId, deviceId, type: 'sale.create', entityId: source.payload.client_sale_id,
            operationId: source.payload.client_sale_id, payload: source.payload, occurredAt: source.createdAt || source.data || source.payload.created_at || new Date().toISOString(), legacySource: source });
        migrated++;
    }
    return { migrated };
}

export async function listOperations(ownerUserId) {
    if (!ownerUserId) return [];
    return (await db.offline_operations.where('ownerUserId').equals(ownerUserId).toArray()).sort((a, b) => a.sequence - b.sequence || a.operationId.localeCompare(b.operationId));
}

export async function confirmOperation(ownerUserId, operationId, acknowledgement, leaseId) {
    if (acknowledgement?.operationId !== operationId || !['applied', 'already_applied'].includes(acknowledgement?.status) || !acknowledgement.result || typeof acknowledgement.result !== 'object') throw new Error('Confirmação remota inválida.');
    return db.transaction('rw', db.offline_operations, async () => {
        const op = await db.offline_operations.get([ownerUserId, operationId]);
        if (!op || (leaseId && op.leaseId !== leaseId)) return false;
        await db.offline_operations.update([ownerUserId, operationId], { status: 'acked', acknowledgement, result: acknowledgement.result, acknowledgedAt: new Date().toISOString(), lastError: null, leaseId: null, leaseUntil: 0 });
        return true;
    });
}

export async function saveSnapshot(ownerUserId, key, value) {
    requireOwner(ownerUserId);
    await db.offline_snapshots.put({ ownerUserId, key, value, updatedAt: new Date().toISOString() });
}
export async function readSnapshot(ownerUserId, key) {
    if (!ownerUserId) return null;
    return (await db.offline_snapshots.get([ownerUserId, key]))?.value ?? null;
}
export async function saveDraft(ownerUserId, operatorId, key, value) {
    requireOwner(ownerUserId);
    if (!operatorId) throw new Error('Operador obrigatório.');
    await db.offline_drafts.put({ ownerUserId, operatorId, key, value, updatedAt: new Date().toISOString() });
}
export async function readDraft(ownerUserId, operatorId, key) {
    if (!ownerUserId || !operatorId) return null;
    return (await db.offline_drafts.get([ownerUserId, operatorId, key]))?.value ?? null;
}

export async function prepareStorage(storage = globalThis.navigator?.storage) {
    const persistent = storage?.persist ? await storage.persist().catch(() => false) : false;
    const estimate = storage?.estimate ? await storage.estimate().catch(() => ({})) : {};
    await db.transaction('rw', db.offline_meta, async () => {
        await db.offline_meta.put({ key: 'write-probe', value: Date.now() });
        await db.offline_meta.delete('write-probe');
    });
    return { writable: true, persistent, ...estimate };
}
