import { db } from '../offlineDb.js';
import { canonicalJSON, hashPayload, listOperations } from './operations.js';

const encode = bytes => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function recoveryKey(password, salt) {
    if (typeof password !== 'string' || password.length < 12) throw new Error('Use uma senha de recuperação com pelo menos 12 caracteres.');
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Caller must gate this UI to the authenticated owner. No auth tokens or local sessions enter the archive. */
export async function exportRecovery(ownerUserId, password) {
    if (!ownerUserId) throw new Error('Titular obrigatório.');
    const all = await listOperations(ownerUserId);
    const needed = new Set(all.filter(op => op.status !== 'acked').map(op => op.operationId));
    // Include confirmed ancestors: a new device must be able to replay them and obtain its own receipts.
    let grew = true;
    while (grew) {
        grew = false;
        for (const op of all) if (needed.has(op.operationId)) for (const id of op.dependencies) if (!needed.has(id)) { needed.add(id); grew = true; }
    }
    const operations = all.filter(op => needed.has(op.operationId)).map(op => ({
        ownerUserId: op.ownerUserId, operationId: op.operationId, operatorId: op.operatorId, deviceId: op.deviceId,
        type: op.type, entityType: op.entityType, entityId: op.entityId, schemaVersion: op.schemaVersion,
        sequence: op.sequence, dependencies: op.dependencies, baseRevision: op.baseRevision, occurredAt: op.occurredAt,
        payload: op.payload, payloadHash: op.payloadHash, createdAt: op.createdAt
    }));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await recoveryKey(password, salt);
    const data = new TextEncoder().encode(JSON.stringify({ version: 1, ownerUserId, operations }));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { format: 'zelo-offline-recovery', version: 1, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
}

export async function importRecovery(ownerUserId, password, archive) {
    if (!ownerUserId || archive?.format !== 'zelo-offline-recovery' || archive.version !== 1) throw new Error('Arquivo de recuperação inválido.');
    const key = await recoveryKey(password, decode(archive.salt));
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(archive.iv) }, key, decode(archive.ciphertext));
    const document = JSON.parse(new TextDecoder().decode(bytes));
    if (document.version !== 1 || document.ownerUserId !== ownerUserId || !Array.isArray(document.operations)) throw new Error('Este arquivo pertence a outra loja ou versão.');
    for (const row of document.operations) {
        if (row.ownerUserId !== ownerUserId || row.schemaVersion !== 1 || !row.operationId || !row.operatorId || !row.deviceId || !row.type || !row.entityId || !Array.isArray(row.dependencies) || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || await hashPayload(row.payload) !== row.payloadHash) throw new Error('Operação de recuperação inválida.');
    }
    return db.transaction('rw', db.offline_operations, db.offline_meta, async () => {
        let imported = 0;
        for (const row of document.operations) {
            const old = await db.offline_operations.get([ownerUserId, row.operationId]);
            if (old) {
                if (old.payloadHash !== row.payloadHash || old.type !== row.type || old.entityId !== row.entityId || old.operatorId !== row.operatorId || canonicalJSON(old.dependencies) !== canonicalJSON(row.dependencies)) throw new Error('Identificação em conflito com registro existente.');
                continue;
            }
            await db.offline_operations.add({ ...row, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null, leaseUntil: 0, leaseId: null });
            const sequenceKey = `sequence:${ownerUserId}:${row.deviceId}`;
            const sequence = (await db.offline_meta.get(sequenceKey))?.value || 0;
            if (row.sequence > sequence) await db.offline_meta.put({ key: sequenceKey, value: row.sequence });
            imported++;
        }
        return { imported };
    });
}
