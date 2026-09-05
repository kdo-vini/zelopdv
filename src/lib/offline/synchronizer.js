import { db } from '../offlineDb.js';
import { confirmOperation, listOperations } from './operations.js';

export function createSyncCoordinator({ ownerUserId, transport, getAccessToken, refreshAuth, onChange = () => {}, onConnection = () => {}, now = Date.now, random = Math.random, timeoutMs = 10000 }) {
    const leaseId = crypto.randomUUID();
    let stopped = false;
    let running = null;
    const controllers = new Set();
    const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zelo-offline-operations') : null;
    const notify = () => { try { onChange(); channel?.postMessage({ ownerUserId }); } catch { /* diagnostics cannot affect persistence */ } };
    async function claim() {
        return db.transaction('rw', db.offline_operations, async () => {
            const rows = await listOperations(ownerUserId);
            const selected = [];
            const busy = new Set(rows.filter(r => r.status === 'inflight' && r.leaseUntil > now()).map(r => `${r.entityType}:${r.entityId}`));
            for (const row of rows) {
                if (!['pending', 'inflight'].includes(row.status) || row.nextAttemptAt > now()) continue;
                const entity = `${row.entityType}:${row.entityId}`;
                if (busy.has(entity) || row.dependencies.some(id => !rows.some(dep => dep.operationId === id && dep.status === 'acked'))) continue;
                // A failed/reviewed earlier operation must not be overtaken on the same entity.
                if (rows.some(prev => prev.entityType === row.entityType && prev.entityId === row.entityId && prev.sequence < row.sequence && prev.status !== 'acked')) continue;
                const predecessor = rows.filter(dep => row.dependencies.includes(dep.operationId) && dep.entityType === row.entityType && dep.entityId === row.entityId && Number.isFinite(dep.result?.revision)).sort((a, b) => b.sequence - a.sequence)[0];
                const claimed = { ...row, ...(row.attempts === 0 && predecessor ? { baseRevision: predecessor.result.revision } : {}), status: 'inflight', leaseId, leaseUntil: now() + Math.max(timeoutMs * 3, 30000), attempts: row.attempts + 1 };
                await db.offline_operations.put(claimed);
                selected.push(claimed); busy.add(entity);
                if (selected.length === 2) break;
            }
            return selected;
        });
    }
    async function update(op, values) {
        await db.transaction('rw', db.offline_operations, async () => {
            const current = await db.offline_operations.get([ownerUserId, op.operationId]);
            if (current?.leaseId === leaseId) await db.offline_operations.update([ownerUserId, op.operationId], { ...values, leaseId: null, leaseUntil: 0 });
        });
    }
    async function defaultTransport(operations, { signal }) {
        const token = await getAccessToken?.();
        const response = await fetch('/api/offline/sync', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ operations }) });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const error = Object.assign(new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`), { status: response.status, retryAfter: response.headers.get('Retry-After') });
            throw error;
        }
        return response.json();
    }
    async function send(op) {
        const controller = new AbortController(); controllers.add(controller);
        let timer;
        try {
            const invoke = async () => {
                try { return await (transport || defaultTransport)([op], { signal: controller.signal }); }
                catch (error) {
                    if (error.status === 401 && refreshAuth && !stopped && await refreshAuth()) return (transport || defaultTransport)([op], { signal: controller.signal });
                    throw error;
                }
            };
            const result = await Promise.race([invoke(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Tempo de conexão esgotado.')); }, timeoutMs); })]);
            const ack = result?.results?.find(r => r.operationId === op.operationId);
            if (!ack || !['applied', 'already_applied', 'needs_review', 'rejected'].includes(ack.status)) throw new Error('Confirmação remota inválida.');
            if (!stopped) onConnection('online');
            if (['applied', 'already_applied'].includes(ack.status)) await confirmOperation(ownerUserId, op.operationId, ack, leaseId);
            else await update(op, { status: 'needs_review', acknowledgement: ack, lastError: { code: ack.code || ack.status, message: ack.message || ack.error || ack.result?.reason || 'Operação precisa de conferência.' } });
        } catch (error) {
            if (!stopped && !error.localAuth) onConnection(globalThis.navigator?.onLine === false ? 'offline' : (!error.status || error.status >= 500 ? 'degraded' : 'online'));
            const status = error.status === 401 ? 'needs_auth' : [400, 403, 404, 409, 413, 422].includes(error.status) ? 'needs_review' : 'pending';
            const delays = [2000, 5000, 10000, 30000, 60000, 120000, 300000];
            const delay = delays[Math.min(op.attempts - 1, delays.length - 1)] * (0.8 + random() * 0.4);
            const retryHeader = error.retryAfter;
            const retryAfter = retryHeader ? (/^\d+$/.test(retryHeader) ? Number(retryHeader) * 1000 : Math.max(0, Date.parse(retryHeader) - now())) : 0;
            await update(op, { status, nextAttemptAt: now() + Math.max(delay, retryAfter || 0), lastError: { code: error.status || 'transport', message: String(error.message || 'Falha de conexão').slice(0, 300) } });
        } finally { clearTimeout(timer); controllers.delete(controller); notify(); }
    }
    async function drain() {
        while (!stopped) {
            const rows = await claim();
            if (!rows.length) break;
            if (stopped) { await Promise.all(rows.map(row => update(row, { status: 'pending' }))); break; }
            await Promise.all(rows.map(send));
        }
    }
    return {
        syncNow() {
            if (stopped) return Promise.resolve();
            if (!running) running = drain().finally(() => { running = null; });
            return running;
        },
        stop() { stopped = true; controllers.forEach(c => c.abort()); channel?.close(); },
        async resumeAuth() {
            await db.offline_operations.where('[ownerUserId+status]').equals([ownerUserId, 'needs_auth']).modify({ status: 'pending', nextAttemptAt: 0 });
        }
    };
}
